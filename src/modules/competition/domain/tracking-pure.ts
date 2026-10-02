// El seguimiento del registro de resultados, sin I/O (ADR-105): qué bases ya registraron la rotación en
// curso, cuál registró de última en cada rotación cerrada, quién se demora más en una jornada y el
// aviso al líder. Cuenta el primer registro de cada enfrentamiento, en minutos desde el inicio de la
// rotación: la duración planeada puede ser provisional y no sirve para decir quién llegó tarde.

import type { Day } from "./schedule-pure";

export type RecordedBy = "JUDGE" | "OPERATION";

export interface TrackingRotation {
  id: string;
  day: Day;
  number: number;
  status: "PENDING" | "ACTIVE" | "CLOSED";
  startsAt: Date | null;
}

export interface TrackingMatchup {
  id: string;
  rotationId: string;
  baseId: string;
  /** Cuándo empezó la base (ADR-098 regla 4). */
  startedAt: Date | null;
  /** Si tiene un resultado vigente. */
  recorded: boolean;
  /** El primer registro, aunque después se haya corregido o anulado. */
  firstRecordedAt: Date | null;
  firstRecordedById: string | null;
}

export interface TrackingBase {
  id: string;
  orderIndex: number;
  /** Los jueces actuales de la base: el resto cuenta como la operación. */
  judgeIds: readonly string[];
}

export type BaseState =
  | { kind: "NOT_STARTED" }
  | { kind: "PLAYING"; startedAt: Date }
  | { kind: "RECORDED"; at: Date | null; minutes: number | null; by: RecordedBy };

/** Minutos enteros entre dos momentos; nulo si falta alguno o si el segundo es anterior. */
export function minutesBetween(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const elapsed = to.getTime() - from.getTime();
  return elapsed < 0 ? null : Math.round(elapsed / 60_000);
}

function recordedBy(matchup: TrackingMatchup, base: TrackingBase | undefined): RecordedBy {
  return matchup.firstRecordedById && base?.judgeIds.includes(matchup.firstRecordedById)
    ? "JUDGE"
    : "OPERATION";
}

/** El estado de una base en su rotación: sin empezar, en juego o registrada. */
export function baseState(
  matchup: TrackingMatchup,
  rotation: TrackingRotation,
  base: TrackingBase | undefined,
): BaseState {
  if (matchup.recorded) {
    return {
      kind: "RECORDED",
      at: matchup.firstRecordedAt,
      minutes: minutesBetween(rotation.startsAt, matchup.firstRecordedAt),
      by: recordedBy(matchup, base),
    };
  }
  return matchup.startedAt
    ? { kind: "PLAYING", startedAt: matchup.startedAt }
    : { kind: "NOT_STARTED" };
}

export interface ChecklistRow {
  matchupId: string;
  baseId: string;
  state: BaseState;
}

/** La lista de una rotación: primero las bases que faltan, cada grupo en el orden de las bases. */
export function rotationChecklist(
  rotation: TrackingRotation,
  matchups: readonly TrackingMatchup[],
  bases: ReadonlyMap<string, TrackingBase>,
): { rows: ChecklistRow[]; recorded: number; total: number } {
  const order = (baseId: string) => bases.get(baseId)?.orderIndex ?? Number.MAX_SAFE_INTEGER;
  const rows = matchups
    .filter((matchup) => matchup.rotationId === rotation.id)
    .map((matchup) => ({
      matchupId: matchup.id,
      baseId: matchup.baseId,
      state: baseState(matchup, rotation, bases.get(matchup.baseId)),
    }))
    .sort(
      (a, b) =>
        Number(a.state.kind === "RECORDED") - Number(b.state.kind === "RECORDED") ||
        order(a.baseId) - order(b.baseId),
    );
  return {
    rows,
    recorded: rows.filter((row) => row.state.kind === "RECORDED").length,
    total: rows.length,
  };
}

/** Los enfrentamientos que registraron de últimos en una rotación cerrada. Si alguno quedó sin
 *  resultado, los últimos son esos. */
export function lastToRecord(matchups: readonly TrackingMatchup[]): Set<string> {
  const owed = matchups.filter((matchup) => !matchup.recorded);
  if (owed.length > 0) return new Set(owed.map((matchup) => matchup.id));
  const latest = Math.max(
    ...matchups.map((matchup) => matchup.firstRecordedAt?.getTime() ?? Number.NEGATIVE_INFINITY),
  );
  if (!Number.isFinite(latest)) return new Set();
  return new Set(
    matchups
      .filter((matchup) => matchup.firstRecordedAt?.getTime() === latest)
      .map((matchup) => matchup.id),
  );
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export interface DelayRow {
  baseId: string;
  byJudge: number;
  byOperation: number;
  /** Enfrentamientos de rotaciones cerradas que siguen sin resultado. */
  owed: number;
  medianMinutes: number | null;
  /** Veces que fue la última base en registrar una rotación cerrada. */
  lastCount: number;
}

/** Quién se demora más en una jornada: una fila por base, con las que deben más arriba, después las
 *  que más le dejaron a la operación, la mediana más alta y las más veces últimas. Solo cuentan las
 *  rotaciones que ya empezaron. */
export function delayRanking(
  day: Day,
  rotations: readonly TrackingRotation[],
  matchups: readonly TrackingMatchup[],
  bases: ReadonlyMap<string, TrackingBase & { day: Day }>,
): DelayRow[] {
  const played = new Map(
    rotations
      .filter((rotation) => rotation.day === day && rotation.status !== "PENDING")
      .map((rotation) => [rotation.id, rotation]),
  );
  const rows = new Map<string, DelayRow & { minutes: number[] }>();
  for (const base of bases.values()) {
    if (base.day !== day) continue;
    rows.set(base.id, {
      baseId: base.id,
      byJudge: 0,
      byOperation: 0,
      owed: 0,
      medianMinutes: null,
      lastCount: 0,
      minutes: [],
    });
  }
  const byRotation = new Map<string, TrackingMatchup[]>();
  for (const matchup of matchups) {
    const rotation = played.get(matchup.rotationId);
    const row = rows.get(matchup.baseId);
    if (!rotation || !row) continue;
    const own = byRotation.get(rotation.id) ?? [];
    own.push(matchup);
    byRotation.set(rotation.id, own);
    if (matchup.recorded) {
      if (recordedBy(matchup, bases.get(matchup.baseId)) === "JUDGE") row.byJudge += 1;
      else row.byOperation += 1;
      const minutes = minutesBetween(rotation.startsAt, matchup.firstRecordedAt);
      if (minutes !== null) row.minutes.push(minutes);
    } else if (rotation.status === "CLOSED") {
      row.owed += 1;
    }
  }
  for (const [rotationId, own] of byRotation) {
    if (played.get(rotationId)?.status !== "CLOSED") continue;
    for (const matchupId of lastToRecord(own)) {
      const matchup = own.find((item) => item.id === matchupId);
      const row = matchup ? rows.get(matchup.baseId) : undefined;
      if (row) row.lastCount += 1;
    }
  }
  const order = (baseId: string) => bases.get(baseId)?.orderIndex ?? Number.MAX_SAFE_INTEGER;
  return [...rows.values()]
    .map(({ minutes, ...row }) => ({ ...row, medianMinutes: median(minutes) }))
    .sort(
      (a, b) =>
        b.owed - a.owed ||
        b.byOperation - a.byOperation ||
        (b.medianMinutes ?? -1) - (a.medianMinutes ?? -1) ||
        b.lastCount - a.lastCount ||
        order(a.baseId) - order(b.baseId),
    );
}

export interface JudgeNudge {
  matchupId: string;
  recorded: number;
  total: number;
}

/** El aviso al líder (ADR-105, regla 5): por cada enfrentamiento suyo sin resultado en la rotación en
 *  curso, cuántas bases ya registraron, solo si al menos una lo hizo. */
export function judgeNudges(
  matchups: ReadonlyArray<{ id: string; baseId: string; recorded: boolean }>,
  ownBaseIds: readonly string[],
): JudgeNudge[] {
  const recorded = matchups.filter((matchup) => matchup.recorded).length;
  if (recorded === 0) return [];
  return matchups
    .filter((matchup) => !matchup.recorded && ownBaseIds.includes(matchup.baseId))
    .map((matchup) => ({ matchupId: matchup.id, recorded, total: matchups.length }));
}
