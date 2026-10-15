import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { type ActiveMemberRef, listActiveMemberRefs, listLiveCommitteeIds } from "@/modules/people";
import { committeeParticipation, occasion, pointEntry } from "../schema";
import { ghPointCondition } from "./ledger-classification";
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

export interface CommitteeScore {
  committeeId: string;
  /** Promedio de la tasa suavizada (0 a 1). */
  score: number;
  /** Promedio de la tasa cruda (0 a 1). */
  rawScore: number;
  occasions: number;
}

/**
 * Score del término por comité: promedio simple sobre las ocasiones cerradas con puntos. Un comité
 * desactivado no compite (ADR-073 regla 4): sus filas quedan como historia y no entran al ranking,
 * así que tampoco corren los puestos de los demás. Dentro de una transacción el llamador pasa los
 * comités vivos que ya leyó; afuera se resuelven acá.
 */
export async function rankCommittees(
  termId: string,
  exec: Executor = getDb(),
  live?: ReadonlySet<string>,
): Promise<Ranked<CommitteeScore>[]> {
  const alive = live ?? (await listLiveCommitteeIds());
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
        eq(committeeParticipation.termId, termId),
        eq(occasion.status, "CLOSED"),
        sql`${occasion.points} > 0`,
      ),
    );
  const byCommittee = new Map<string, { smoothed: number[]; raw: number[] }>();
  for (const row of rows) {
    if (!alive.has(row.committeeId)) {
      continue;
    }
    const bucket = byCommittee.get(row.committeeId) ?? { smoothed: [], raw: [] };
    bucket.smoothed.push(row.smoothedRate);
    bucket.raw.push(row.rate);
    byCommittee.set(row.committeeId, bucket);
  }
  const scores: CommitteeScore[] = [...byCommittee.entries()].map(([committeeId, bucket]) => ({
    committeeId,
    score: termCommitteeScore(bucket.smoothed) ?? 0,
    rawScore: termCommitteeScore(bucket.raw) ?? 0,
    occasions: bucket.smoothed.length,
  }));
  return competitionRanks(
    scores,
    (row) => Math.round(row.score * 10_000),
    (a, b) => a.committeeId.localeCompare(b.committeeId),
  );
}
