import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import {
  type ActiveMemberRef,
  listActiveMemberRefs,
  listTermCommitteeMembers,
} from "@/modules/people";
import { getTerm, type TermRow } from "@/modules/terms";
import type { CommitteeScore } from "../committee-ranking-types";
import { committeeParticipation, occasion, pointEntry, termStanding } from "../schema";
import { storedCommitteeRanking } from "./committee-snapshot";
import { ghPointCondition, strictGhPointCondition } from "./ledger-classification";
import { competitionRanks, type Ranked, termCommitteeScore } from "./ledger-pure";

// Tableros (ADR-008, ADR-024, ADR-035 regla 10): nuevos y veteranos por `firstTermId`, solo activos,
// puestos de competición; comités por el promedio de la tasa suavizada de las ocasiones cerradas con puntos.

export type Board = "NEW" | "VETERAN";

export interface RankedPerson {
  personId: string;
  name: string;
  anonymized: boolean;
  firstTermId: string;
}

async function totalsFor(
  exec: Executor,
  termId: string,
  personIds: string[],
): Promise<Map<string, number>> {
  if (personIds.length === 0) {
    return new Map();
  }
  const rows = await exec
    .select({ personId: pointEntry.personId, total: sql<number>`sum(${pointEntry.points})::int` })
    .from(pointEntry)
    .where(
      and(eq(pointEntry.termId, termId), inArray(pointEntry.personId, personIds), ghPointCondition),
    )
    .groupBy(pointEntry.personId);
  return new Map(rows.map((row) => [row.personId, row.total]));
}

function onBoard(member: ActiveMemberRef, termId: string, board: Board): boolean {
  return board === "NEW" ? member.firstTermId === termId : member.firstTermId !== termId;
}

/**
 * Tablero completo de un término: quienes suman puntos primero; sin puntos quedan al final con 0. Con
 * referencias precargadas y una única conexión, también durante el cierre.
 */
export async function rankPeopleFromMembers(
  exec: Executor,
  termId: string,
  board: Board,
  allMembers: readonly ActiveMemberRef[],
): Promise<Ranked<RankedPerson>[]> {
  const members = allMembers.filter((member) => onBoard(member, termId, board));
  const totals = await totalsFor(
    exec,
    termId,
    members.map((member) => member.personId),
  );
  const rows: Array<RankedPerson & { total: number }> = members.map((member) => ({
    personId: member.personId,
    name: member.fullName.trim(),
    anonymized: member.anonymized,
    firstTermId: member.firstTermId,
    total: totals.get(member.personId) ?? 0,
  }));
  return competitionRanks(
    rows,
    (row) => row.total,
    (a, b) => a.name.localeCompare(b.name, "es"),
  );
}

export interface MyPosition {
  board: Board;
  rank: number | null;
  total: number;
  of: number;
}

export interface PeopleBoards {
  /** El tablero completo: quienes suman puntos primero; sin puntos quedan al final con 0. */
  rank(board: Board): Promise<Ranked<RankedPerson>[]>;
  /** El puesto de la persona en el tablero que le toca por su primer término. */
  position(personId: string, firstTermId: string): Promise<MyPosition>;
}

/**
 * Los tableros de personas de un término para una sola vista: lee a los activos una vez y arma cada
 * tablero a lo sumo una vez, se lo pidan para el puesto propio, para el top 10 o para los dos. No
 * guarda nada entre vistas: quien lo crea de nuevo lee de nuevo.
 */
export function peopleBoards(termId: string): PeopleBoards {
  let members: Promise<ActiveMemberRef[]> | undefined;
  const rankings = new Map<Board, Promise<Ranked<RankedPerson>[]>>();
  const rank = (board: Board): Promise<Ranked<RankedPerson>[]> => {
    let ranking = rankings.get(board);
    if (!ranking) {
      members ??= listActiveMemberRefs();
      ranking = members.then((all) => rankPeopleFromMembers(getDb(), termId, board, all));
      rankings.set(board, ranking);
    }
    return ranking;
  };
  return {
    rank,
    async position(personId, firstTermId) {
      const board: Board = firstTermId === termId ? "NEW" : "VETERAN";
      const ranking = await rank(board);
      const mine = ranking.find((item) => item.row.personId === personId);
      return {
        board,
        rank: mine && mine.total > 0 ? mine.rank : null,
        total: mine?.total ?? 0,
        of: ranking.filter((item) => item.total > 0).length,
      };
    },
  };
}

/**
 * El cierre conserva criterio, componentes y puestos. Una foto antigua sigue representando sólo
 * participación; un término cerrado sin foto no se reconstruye con la población de hoy.
 */
export async function rankCommittees(
  termId: string,
  exec: Executor = getDb(),
  live?: ReadonlySet<string>,
): Promise<Ranked<CommitteeScore>[]> {
  const term = await getTerm(termId, exec);
  if (!term) return [];
  if (term.pointsClosedAt) {
    const [standing] = await exec
      .select({ rows: termStanding.topCommittees })
      .from(termStanding)
      .where(eq(termStanding.termId, termId))
      .limit(1);
    return storedCommitteeRanking(standing?.rows).map(({ rank, ...row }) => ({
      rank,
      total: Math.round(row.score * 10_000),
      row,
    }));
  }
  return rankCurrentCommittees(term, exec, live);
}

/** Proyección definitiva también después de sellar el término, dentro del cierre exclusivo. */
export async function rankCurrentCommittees(
  term: TermRow,
  exec: Executor,
  live?: ReadonlySet<string>,
  now = new Date(),
): Promise<Ranked<CommitteeScore>[]> {
  const effectiveAt = new Date(
    Math.max(
      new Date(`${term.startsOn}T00:00:00-05:00`).getTime(),
      Math.min(now.getTime(), new Date(`${term.endsOn}T23:59:59.999-05:00`).getTime()),
    ),
  );
  const population = new Map<string, Set<string>>();
  for (const member of await listTermCommitteeMembers(term.id, exec, {
    liveCommitteesOnly: live === undefined,
  })) {
    if (
      (live !== undefined && !live.has(member.committeeId)) ||
      member.status !== "ACTIVE" ||
      (member.joinedAt && member.joinedAt > effectiveAt) ||
      (member.leftAt && member.leftAt <= effectiveAt)
    )
      continue;
    const people = population.get(member.committeeId) ?? new Set<string>();
    people.add(member.personId);
    population.set(member.committeeId, people);
  }
  if (population.size === 0) return [];
  const people = [...new Set([...population.values()].flatMap((members) => [...members]))];
  const ghRows = await exec
    .select({ personId: pointEntry.personId, total: sql<number>`sum(${pointEntry.points})::int` })
    .from(pointEntry)
    .where(
      and(
        eq(pointEntry.termId, term.id),
        inArray(pointEntry.personId, people),
        strictGhPointCondition,
      ),
    )
    .groupBy(pointEntry.personId);
  const ghTotals = new Map(ghRows.map((row) => [row.personId, row.total]));
  const rows = await exec
    .select({
      committeeId: committeeParticipation.committeeId,
      rate: committeeParticipation.rate,
      smoothedRate: committeeParticipation.smoothedRate,
    })
    .from(committeeParticipation)
    .innerJoin(occasion, eq(occasion.id, committeeParticipation.occasionId))
    .where(
      and(
        eq(committeeParticipation.termId, term.id),
        eq(occasion.status, "CLOSED"),
        sql`${occasion.points} > 0`,
      ),
    );
  const byCommittee = new Map<string, { smoothed: number[]; raw: number[] }>();
  for (const row of rows) {
    if (!population.has(row.committeeId)) {
      continue;
    }
    const bucket = byCommittee.get(row.committeeId) ?? { smoothed: [], raw: [] };
    bucket.smoothed.push(row.smoothedRate);
    bucket.raw.push(row.rate);
    byCommittee.set(row.committeeId, bucket);
  }
  // Una observación neta de cero sí es historia; un roster vacío de hechos no fabrica ganadores.
  if (ghRows.length === 0 && byCommittee.size === 0) return [];
  const components = [...population].map(([committeeId, members]) => {
    const bucket = byCommittee.get(committeeId);
    const ghTotal = [...members].reduce((sum, personId) => sum + (ghTotals.get(personId) ?? 0), 0);
    return {
      committeeId,
      attendanceScore: termCommitteeScore(bucket?.smoothed ?? []) ?? 0,
      rawScore: termCommitteeScore(bucket?.raw ?? []) ?? 0,
      occasions: bucket?.smoothed.length ?? 0,
      ghTotal,
      activeMembers: members.size,
      ghAverage: ghTotal / members.size,
    };
  });
  const ghAverageMax = Math.max(0, ...components.map((row) => row.ghAverage));
  const attendanceMax = Math.max(...components.map((row) => row.attendanceScore));
  const policy = {
    version: "GH_ATTENDANCE_50_50_V1",
    effectiveAt: effectiveAt.toISOString(),
    ghWeight: 0.5,
    attendanceWeight: 0.5,
    ghAverageMax,
    attendanceMax,
  } as const;
  const scores: CommitteeScore[] = components.map((row) => {
    const ghNormalized = ghAverageMax > 0 ? Math.max(0, row.ghAverage) / ghAverageMax : 0;
    const attendanceNormalized = attendanceMax > 0 ? row.attendanceScore / attendanceMax : 0;
    return {
      ...row,
      rankingMetric: "COMBINED",
      ghNormalized,
      attendanceNormalized,
      score: policy.ghWeight * ghNormalized + policy.attendanceWeight * attendanceNormalized,
      policy,
    };
  });
  return competitionRanks(
    scores,
    (row) => Math.round(row.score * 10_000),
    (a, b) => a.committeeId.localeCompare(b.committeeId),
  );
}
