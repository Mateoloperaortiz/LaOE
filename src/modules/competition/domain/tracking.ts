import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getPeopleByIds } from "@/modules/people";
import {
  competitionBase,
  competitionMatchup,
  competitionResult,
  competitionRotation,
  competitionStaff,
  competitionSupport,
  competitionTeam,
} from "../schema";
import type { Day } from "./schedule-pure";
import type { BaseKind } from "./scoring-pure";
import {
  type BaseState,
  type DelayRow,
  delayRanking,
  rotationChecklist,
  type TrackingBase,
  type TrackingMatchup,
  type TrackingRotation,
} from "./tracking-pure";

// Lecturas del seguimiento del registro de resultados (ADR-105). Solo leen: el panel de la operación
// ve qué bases ya registraron, qué se debe y quién se demora más, con el líder y el calificador de cada
// base solo por nombre; el líder ve qué rotación cerrada quedó sin su resultado.

export interface TrackerBase {
  id: string;
  name: string;
  day: Day;
  orderIndex: number;
  kind: BaseKind;
  judges: string[];
  graders: string[];
}

export interface TrackerTeam {
  number: number;
  name: string;
}

export interface RecordingTracker {
  /** La jornada de la tabla de demoras. */
  day: Day;
  /** La rotación en curso, si hay, con su lista. */
  current: {
    rotation: { id: string; day: Day; number: number };
    recorded: number;
    total: number;
    rows: Array<{ matchupId: string; base: TrackerBase; state: BaseState }>;
  } | null;
  /** Los enfrentamientos de rotaciones cerradas sin resultado, de las dos jornadas. */
  debts: Array<{
    matchupId: string;
    rotation: { day: Day; number: number };
    base: TrackerBase;
    teamA: TrackerTeam;
    teamB: TrackerTeam;
  }>;
  /** Rotaciones de la jornada que ya empezaron. */
  playedRotations: number;
  ranking: Array<DelayRow & { base: TrackerBase }>;
}

/** El seguimiento de una competencia. `requestedDay` elige la jornada de la tabla; sin ella, la de la
 *  rotación en curso o, si no hay, la de la última que empezó. */
export async function getRecordingTracker(
  competitionId: string,
  requestedDay: Day | null = null,
): Promise<RecordingTracker> {
  const db = getDb();
  const [rotationRows, baseRows, staffRows, supportRows, teamRows] = await Promise.all([
    db
      .select({
        id: competitionRotation.id,
        day: competitionRotation.day,
        number: competitionRotation.number,
        status: competitionRotation.status,
        startsAt: competitionRotation.startsAt,
      })
      .from(competitionRotation)
      .where(eq(competitionRotation.competitionId, competitionId))
      .orderBy(asc(competitionRotation.day), asc(competitionRotation.number)),
    db
      .select({
        id: competitionBase.id,
        name: competitionBase.name,
        day: competitionBase.day,
        orderIndex: competitionBase.orderIndex,
        kind: competitionBase.kind,
      })
      .from(competitionBase)
      .where(eq(competitionBase.competitionId, competitionId)),
    db
      .select({ baseId: competitionStaff.baseId, personId: competitionStaff.personId })
      .from(competitionStaff)
      .where(
        and(eq(competitionStaff.competitionId, competitionId), eq(competitionStaff.role, "JUDGE")),
      )
      .orderBy(asc(competitionStaff.createdAt)),
    db
      .select({ baseId: competitionSupport.baseId, personId: competitionSupport.personId })
      .from(competitionSupport)
      .where(
        and(
          eq(competitionSupport.competitionId, competitionId),
          eq(competitionSupport.role, "GRADER"),
        ),
      )
      .orderBy(asc(competitionSupport.createdAt)),
    db
      .select({
        id: competitionTeam.id,
        number: competitionTeam.number,
        name: competitionTeam.name,
      })
      .from(competitionTeam)
      .where(eq(competitionTeam.competitionId, competitionId)),
  ]);
  const rotations: TrackingRotation[] = rotationRows.map((row) => ({
    ...row,
    day: row.day as Day,
  }));
  const started = rotations.filter((rotation) => rotation.status !== "PENDING");
  const matchupRows = started.length
    ? await db
        .select({
          id: competitionMatchup.id,
          rotationId: competitionMatchup.rotationId,
          baseId: competitionMatchup.baseId,
          teamAId: competitionMatchup.teamAId,
          teamBId: competitionMatchup.teamBId,
          startedAt: competitionMatchup.startedAt,
        })
        .from(competitionMatchup)
        .where(
          inArray(
            competitionMatchup.rotationId,
            started.map((rotation) => rotation.id),
          ),
        )
    : [];
  // Todas las filas, también las reemplazadas: el primer registro cuenta aunque se haya corregido.
  const resultRows = matchupRows.length
    ? await db
        .select({
          matchupId: competitionResult.matchupId,
          recordedById: competitionResult.recordedById,
          supersededAt: competitionResult.supersededAt,
          createdAt: competitionResult.createdAt,
        })
        .from(competitionResult)
        .where(
          inArray(
            competitionResult.matchupId,
            matchupRows.map((row) => row.id),
          ),
        )
        .orderBy(asc(competitionResult.createdAt), asc(competitionResult.id))
    : [];
  const people = await getPeopleByIds([
    ...new Set([...staffRows, ...supportRows].map((row) => row.personId)),
  ]);
  const namesBy = (rows: Array<{ baseId: string | null; personId: string }>) => {
    const names = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.baseId) continue;
      names.set(row.baseId, [
        ...(names.get(row.baseId) ?? []),
        people.get(row.personId)?.fullName ?? "",
      ]);
    }
    return names;
  };
  const judgeNames = namesBy(staffRows);
  const graderNames = namesBy(supportRows);
  const judgeIds = new Map<string, string[]>();
  for (const row of staffRows) {
    if (row.baseId) judgeIds.set(row.baseId, [...(judgeIds.get(row.baseId) ?? []), row.personId]);
  }
  const bases = new Map<string, TrackerBase>(
    baseRows.map((row) => [
      row.id,
      {
        ...row,
        day: row.day as Day,
        judges: judgeNames.get(row.id) ?? [],
        graders: graderNames.get(row.id) ?? [],
      },
    ]),
  );
  const trackingBases = new Map<string, TrackingBase & { day: Day }>(
    [...bases.values()].map((base) => [
      base.id,
      {
        id: base.id,
        day: base.day,
        orderIndex: base.orderIndex,
        judgeIds: judgeIds.get(base.id) ?? [],
      },
    ]),
  );
  const first = new Map<string, { at: Date; by: string | null }>();
  const current = new Set<string>();
  for (const row of resultRows) {
    if (!first.has(row.matchupId))
      first.set(row.matchupId, { at: row.createdAt, by: row.recordedById });
    if (row.supersededAt === null) current.add(row.matchupId);
  }
  const matchups: TrackingMatchup[] = matchupRows.map((row) => ({
    id: row.id,
    rotationId: row.rotationId,
    baseId: row.baseId,
    startedAt: row.startedAt,
    recorded: current.has(row.id),
    firstRecordedAt: first.get(row.id)?.at ?? null,
    firstRecordedById: first.get(row.id)?.by ?? null,
  }));
  const baseOf = (id: string): TrackerBase =>
    bases.get(id) ?? {
      id,
      name: "",
      day: 1,
      orderIndex: Number.MAX_SAFE_INTEGER,
      kind: "NORMAL",
      judges: [],
      graders: [],
    };

  const active = rotations.find((rotation) => rotation.status === "ACTIVE") ?? null;
  const latest = started.at(-1) ?? null;
  const day: Day = requestedDay ?? active?.day ?? latest?.day ?? 1;

  let currentView: RecordingTracker["current"] = null;
  if (active) {
    const checklist = rotationChecklist(active, matchups, trackingBases);
    currentView = {
      rotation: { id: active.id, day: active.day, number: active.number },
      recorded: checklist.recorded,
      total: checklist.total,
      rows: checklist.rows.map((row) => ({
        matchupId: row.matchupId,
        base: baseOf(row.baseId),
        state: row.state,
      })),
    };
  }

  const rotationById = new Map(rotations.map((rotation) => [rotation.id, rotation]));
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const teamOf = (id: string): TrackerTeam => ({
    number: teamById.get(id)?.number ?? 0,
    name: teamById.get(id)?.name ?? "",
  });
  const debts = matchupRows
    .filter((row) => rotationById.get(row.rotationId)?.status === "CLOSED" && !current.has(row.id))
    .map((row) => {
      const rotation = rotationById.get(row.rotationId);
      return {
        matchupId: row.id,
        rotation: { day: rotation?.day ?? 1, number: rotation?.number ?? 0 },
        base: baseOf(row.baseId),
        teamA: teamOf(row.teamAId),
        teamB: teamOf(row.teamBId),
      };
    })
    .sort(
      (a, b) =>
        a.rotation.day - b.rotation.day ||
        a.rotation.number - b.rotation.number ||
        a.base.orderIndex - b.base.orderIndex,
    );

  return {
    day,
    current: currentView,
    debts,
    playedRotations: started.filter((rotation) => rotation.day === day).length,
    ranking: delayRanking(day, rotations, matchups, trackingBases).map((row) => ({
      ...row,
      base: baseOf(row.baseId),
    })),
  };
}

/** Las rotaciones cerradas que quedaron sin el resultado de unas bases, para el aviso del líder
 *  (ADR-105, regla 5). Las bases salen de las filas de juez de quien mira. */
export async function listJudgeDebts(
  baseIds: string[],
): Promise<Array<{ matchupId: string; day: Day; number: number; baseName: string }>> {
  if (baseIds.length === 0) return [];
  const rows = await getDb()
    .select({
      matchupId: competitionMatchup.id,
      day: competitionRotation.day,
      number: competitionRotation.number,
      baseName: competitionBase.name,
    })
    .from(competitionMatchup)
    .innerJoin(competitionRotation, eq(competitionRotation.id, competitionMatchup.rotationId))
    .innerJoin(competitionBase, eq(competitionBase.id, competitionMatchup.baseId))
    .leftJoin(
      competitionResult,
      and(
        eq(competitionResult.matchupId, competitionMatchup.id),
        isNull(competitionResult.supersededAt),
      ),
    )
    .where(
      and(
        inArray(competitionMatchup.baseId, baseIds),
        eq(competitionRotation.status, "CLOSED"),
        isNull(competitionResult.id),
      ),
    )
    .orderBy(asc(competitionRotation.day), asc(competitionRotation.number));
  return rows.map((row) => ({ ...row, day: row.day as Day }));
}
