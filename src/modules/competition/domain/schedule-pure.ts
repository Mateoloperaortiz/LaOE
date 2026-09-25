// Calendario de The Games sin I/O (ADR-089 regla 8): quién juega contra quién, en qué base y en qué
// rotación, más el validador de un calendario ya cargado y los mapas de calor.
//
// Con 2n equipos y n bases por jornada, cada rotación ocupa las n bases y hace jugar a todos. Los
// equipos se nombran por su número de siembra (1..2n) y se parten en dos mitades: A_i = i+1 y
// B_k = 2n−k, con i, k ∈ Z_n.
// - Jornada 1: A_i contra B_(i+r) en la base (2i+r) mod n. La rotación 1 queda 1–2n, 2–(2n−1)…
// - Jornada 2: todos contra todos dentro de cada mitad, desde un starter de Z_n con dos adders
//   complementarios (un par de cuadrados de Room que se reparten las celdas). Los dos equipos que
//   quedan libres en cada rotación, uno por mitad, se enfrentan entre sí en la base r.
// Así cada equipo pasa una vez por cada base de cada jornada, y entre las dos se repite a lo sumo un
// rival por equipo: con n rotaciones el jueves la revancha es inevitable (2n partidos, 2n−1 rivales);
// con menos, la mitad B se desplaza R1 posiciones y no hay ninguna.

export type Day = 1 | 2;

/** Un enfrentamiento por siembra: `a` y `b` son números de equipo (1..2n); `base` es 0..n−1. */
export interface SeedPairing {
  base: number;
  a: number;
  b: number;
}

/** Un starter de Z_n (pares que cubren Z_n∖{0} con todas las diferencias) y sus dos adders. */
export interface StarterAdders {
  starter: ReadonlyArray<readonly [number, number]>;
  addersA: readonly number[];
  addersB: readonly number[];
}

/** La construcción de 15 bases y 30 equipos, verificada el 2026-09-23 (ADR-089 regla 8). */
export const STARTER_ADDERS_15: StarterAdders = {
  starter: [
    [1, 2],
    [3, 5],
    [4, 10],
    [6, 14],
    [7, 11],
    [8, 13],
    [9, 12],
  ],
  addersA: [3, 10, 7, 12, 6, 2, 5],
  addersB: [8, 14, 9, 1, 4, 11, 13],
};

function mod(value: number, n: number): number {
  return ((value % n) + n) % n;
}

function assertBaseCount(n: number): void {
  if (!Number.isInteger(n) || n < 3 || n % 2 === 0) {
    throw new RangeError(`El calendario necesita un número impar de bases (3 o más); llegó ${n}.`);
  }
}

function assertRotations(rotations: number, n: number): void {
  if (!Number.isInteger(rotations) || rotations < 1 || rotations > n) {
    throw new RangeError(`Las rotaciones de una jornada van de 1 a ${n}; llegó ${rotations}.`);
  }
}

const seedA = (i: number) => i + 1;
const seedB = (k: number, n: number) => 2 * n - k;

/** Jornada 1: la mitad A contra la mitad B, sembrada 1–2n en la primera rotación. */
export function dayOneRounds(n: number, rotations = n): SeedPairing[][] {
  assertBaseCount(n);
  assertRotations(rotations, n);
  const rounds: SeedPairing[][] = [];
  for (let r = 0; r < rotations; r++) {
    const round: SeedPairing[] = [];
    for (let i = 0; i < n; i++) {
      round.push({ base: mod(2 * i + r, n), a: seedA(i), b: seedB(mod(i + r, n), n) });
    }
    rounds.push(round.sort((x, y) => x.base - y.base));
  }
  return rounds;
}

/** Jornada 2: todos contra todos dentro de cada mitad; `dayOneRotations` evita las revanchas. */
export function dayTwoRounds(
  n: number,
  dayOneRotations: number,
  rotations = n,
  construction: StarterAdders | null = n === 15 ? STARTER_ADDERS_15 : findStarterAdders(n),
): SeedPairing[][] {
  assertBaseCount(n);
  assertRotations(rotations, n);
  assertRotations(dayOneRotations, n);
  if (!construction) {
    throw new RangeError(
      `No hay construcción automática para ${n} bases: el calendario va a mano.`,
    );
  }
  const shift = mod(dayOneRotations, n);
  const { starter, addersA, addersB } = construction;
  const rounds: SeedPairing[][] = [];
  for (let r = 0; r < rotations; r++) {
    const round: SeedPairing[] = [];
    starter.forEach(([s, t], k) => {
      round.push({
        base: mod(r + (addersA[k] ?? 0), n),
        a: seedA(mod(s + r, n)),
        b: seedA(mod(t + r, n)),
      });
      round.push({
        base: mod(r + (addersB[k] ?? 0), n),
        a: seedB(mod(s + r + shift, n), n),
        b: seedB(mod(t + r + shift, n), n),
      });
    });
    round.push({ base: r, a: seedA(r), b: seedB(mod(r + shift, n), n) });
    rounds.push(round.sort((x, y) => x.base - y.base));
  }
  return rounds;
}

/** Las dos jornadas completas para 2n equipos y n bases por jornada. */
export function buildSeedSchedule(
  n: number,
  rotations: { day1: number; day2: number },
): Record<Day, SeedPairing[][]> {
  return {
    1: dayOneRounds(n, rotations.day1),
    2: dayTwoRounds(n, rotations.day1, rotations.day2),
  };
}

function differenceClass(value: number, n: number): number {
  const d = mod(value, n);
  return Math.min(d, n - d);
}

/** Todos los adders de un starter: cada par {s,t} va a la columna r+α y cada equipo cae en columnas
 *  distintas de la del cruce (0). Devuelve los conjuntos de valores como máscara de bits. */
function addersOf(
  starter: ReadonlyArray<readonly [number, number]>,
  n: number,
  limit: number,
): Map<number, number[]> {
  const found = new Map<number, number[]>();
  const chosen: number[] = [];
  const usedValues = new Set<number>();
  const usedColumns = new Set<number>([0]);
  const visit = (k: number): void => {
    if (found.size >= limit) return;
    const pair = starter[k];
    if (!pair) {
      const mask = chosen.reduce((acc, v) => acc | (1 << v), 0);
      if (!found.has(mask)) found.set(mask, [...chosen]);
      return;
    }
    const [s, t] = pair;
    for (let v = 1; v < n; v++) {
      if (usedValues.has(v)) continue;
      const c1 = mod(v - s, n);
      const c2 = mod(v - t, n);
      if (c1 === c2 || usedColumns.has(c1) || usedColumns.has(c2)) continue;
      usedValues.add(v);
      usedColumns.add(c1);
      usedColumns.add(c2);
      chosen.push(v);
      visit(k + 1);
      chosen.pop();
      usedValues.delete(v);
      usedColumns.delete(c1);
      usedColumns.delete(c2);
    }
  };
  visit(0);
  return found;
}

/** Busca un starter de Z_n con dos adders complementarios. `null` si no hay (n = 9, por ejemplo). */
export function findStarterAdders(n: number): StarterAdders | null {
  assertBaseCount(n);
  if (n > 29) return null;
  const full = ((1 << n) - 1) & ~1;
  const half = (n - 1) / 2;
  let result: StarterAdders | null = null;
  const pairs: Array<[number, number]> = [];
  const usedClass = new Set<number>();
  const visit = (remaining: number[]): void => {
    if (result) return;
    const [p, ...rest] = remaining;
    if (p === undefined) {
      const adders = addersOf(pairs, n, 5000);
      for (const [mask, addersA] of adders) {
        const addersB = adders.get(full & ~mask);
        if (addersB) {
          result = { starter: pairs.map(([s, t]) => [s, t] as const), addersA, addersB };
          return;
        }
      }
      return;
    }
    for (let j = 0; j < rest.length; j++) {
      const q = rest[j] as number;
      const c = differenceClass(q - p, n);
      if (usedClass.has(c)) continue;
      usedClass.add(c);
      pairs.push([p, q]);
      visit(rest.filter((_, index) => index !== j));
      pairs.pop();
      usedClass.delete(c);
      if (result) return;
    }
  };
  if (half >= 1) visit(Array.from({ length: n - 1 }, (_, i) => i + 1));
  return result;
}

// --- Validación de un calendario cargado --------------------------------------------------------

export interface ScheduleTeam {
  id: string;
  number: number;
  active: boolean;
}

export interface ScheduleBase {
  id: string;
  day: Day;
}

export interface ScheduleMatchup {
  id?: string;
  baseId: string;
  teamAId: string;
  teamBId: string;
}

export interface ScheduleRotation {
  id?: string;
  day: Day;
  number: number;
  matchups: readonly ScheduleMatchup[];
}

/** Los errores bloquean guardar; las advertencias piden confirmar (ADR-089 regla 8). Un equipo que
 *  repite base en la jornada es error: cada equipo juega todas las bases (ADR-093). */
export type ScheduleIssue =
  | { kind: "SELF_MATCH"; rotation: number; day: Day; teamId: string }
  | { kind: "TEAM_TWICE_IN_ROTATION"; rotation: number; day: Day; teamId: string }
  | { kind: "BASE_TWICE_IN_ROTATION"; rotation: number; day: Day; baseId: string }
  | { kind: "BASE_OF_OTHER_DAY"; rotation: number; day: Day; baseId: string }
  | { kind: "UNKNOWN_TEAM"; rotation: number; day: Day; teamId: string }
  | { kind: "WITHDRAWN_TEAM"; rotation: number; day: Day; teamId: string }
  | { kind: "REPEATED_PAIR"; teamAId: string; teamBId: string; times: number }
  | { kind: "BASE_REPEATED_IN_DAY"; day: Day; teamId: string; baseId: string; times: number }
  | { kind: "TEAM_IDLE"; rotation: number; day: Day; teamId: string };

export const SCHEDULE_ERROR_KINDS = [
  "SELF_MATCH",
  "TEAM_TWICE_IN_ROTATION",
  "BASE_TWICE_IN_ROTATION",
  "BASE_OF_OTHER_DAY",
  "UNKNOWN_TEAM",
  "WITHDRAWN_TEAM",
  "BASE_REPEATED_IN_DAY",
] as const satisfies ReadonlyArray<ScheduleIssue["kind"]>;

/** Todos los tipos, en el orden de sus textos (T-2841). */
export const SCHEDULE_ISSUE_KINDS = [
  "SELF_MATCH",
  "TEAM_TWICE_IN_ROTATION",
  "BASE_TWICE_IN_ROTATION",
  "BASE_OF_OTHER_DAY",
  "UNKNOWN_TEAM",
  "WITHDRAWN_TEAM",
  "REPEATED_PAIR",
  "BASE_REPEATED_IN_DAY",
  "TEAM_IDLE",
] as const satisfies ReadonlyArray<ScheduleIssue["kind"]>;

export interface ScheduleReport {
  errors: ScheduleIssue[];
  warnings: ScheduleIssue[];
}

function pairKey(x: string, y: string): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

/** Revisa un calendario completo: errores por rotación y advertencias entre rotaciones. */
export function validateSchedule(
  rotations: readonly ScheduleRotation[],
  teams: readonly ScheduleTeam[],
  bases: readonly ScheduleBase[],
): ScheduleReport {
  const errors: ScheduleIssue[] = [];
  const warnings: ScheduleIssue[] = [];
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const baseById = new Map(bases.map((base) => [base.id, base]));
  const pairs = new Map<string, number>();
  const visits = new Map<string, number>();

  const ordered = [...rotations].sort((x, y) => x.day - y.day || x.number - y.number);
  for (const rotation of ordered) {
    const { day, number } = rotation;
    const playing = new Set<string>();
    const usedBases = new Set<string>();
    for (const matchup of rotation.matchups) {
      if (matchup.teamAId === matchup.teamBId) {
        errors.push({ kind: "SELF_MATCH", rotation: number, day, teamId: matchup.teamAId });
      }
      if (usedBases.has(matchup.baseId)) {
        errors.push({
          kind: "BASE_TWICE_IN_ROTATION",
          rotation: number,
          day,
          baseId: matchup.baseId,
        });
      }
      usedBases.add(matchup.baseId);
      const base = baseById.get(matchup.baseId);
      if (!base || base.day !== day) {
        errors.push({ kind: "BASE_OF_OTHER_DAY", rotation: number, day, baseId: matchup.baseId });
      }
      for (const teamId of new Set([matchup.teamAId, matchup.teamBId])) {
        const team = teamById.get(teamId);
        if (!team) errors.push({ kind: "UNKNOWN_TEAM", rotation: number, day, teamId });
        else if (!team.active)
          errors.push({ kind: "WITHDRAWN_TEAM", rotation: number, day, teamId });
        if (playing.has(teamId)) {
          errors.push({ kind: "TEAM_TWICE_IN_ROTATION", rotation: number, day, teamId });
        }
        playing.add(teamId);
        const visitKey = `${day}|${teamId}|${matchup.baseId}`;
        visits.set(visitKey, (visits.get(visitKey) ?? 0) + 1);
      }
      if (matchup.teamAId !== matchup.teamBId) {
        const key = pairKey(matchup.teamAId, matchup.teamBId);
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    for (const team of teams) {
      if (team.active && !playing.has(team.id)) {
        warnings.push({ kind: "TEAM_IDLE", rotation: number, day, teamId: team.id });
      }
    }
  }

  for (const [key, times] of pairs) {
    if (times < 2) continue;
    const [teamAId = "", teamBId = ""] = key.split("|");
    warnings.push({ kind: "REPEATED_PAIR", teamAId, teamBId, times });
  }
  for (const [key, times] of visits) {
    if (times < 2) continue;
    const [day = "1", teamId = "", baseId = ""] = key.split("|");
    errors.push({ kind: "BASE_REPEATED_IN_DAY", day: Number(day) as Day, teamId, baseId, times });
  }
  return { errors, warnings };
}

/** Cuántas veces se cruzó cada par de equipos (para el mapa de calor equipo × equipo). */
export function pairCounts(rotations: readonly ScheduleRotation[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rotation of rotations) {
    for (const matchup of rotation.matchups) {
      if (matchup.teamAId === matchup.teamBId) continue;
      const key = pairKey(matchup.teamAId, matchup.teamBId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** Clave de `pairCounts` para dos equipos, en cualquier orden. */
export const pairCountKey = pairKey;
