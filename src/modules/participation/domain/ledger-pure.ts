// Aritmética del ledger y de los tableros (ADR-007, ADR-008, ADR-009, ADR-024): sin I/O.

export type PointEntryKind =
  | "CHECKIN"
  | "ADJUSTMENT"
  | "REVERSAL"
  | "LEGACY"
  | "WORDLE"
  | "CHALLENGE"
  | "BOOST"
  | "GAME2048"
  | "SUDOKU";
export const POINT_ENTRY_KINDS: readonly PointEntryKind[] = [
  "CHECKIN",
  "ADJUSTMENT",
  "REVERSAL",
  "LEGACY",
  "WORDLE",
  // ADR-067: premio base y extra de la gamificación; cierran la lista T-085.
  "CHALLENGE",
  "BOOST",
  // ADR-075: premio del 2048.
  "GAME2048",
  // ADR-078: premio del Sudoku; cierra la lista T-085.
  "SUDOKU",
];

/** El saldo nunca se persiste: es la suma de las entradas. */
export function balance(entries: ReadonlyArray<{ points: number }>): number {
  return entries.reduce((sum, entry) => sum + entry.points, 0);
}

export interface Level {
  /** Posición del nivel en la lista de cortes (0 = el primero). */
  index: number;
  /** Puntos desde los que rige el nivel. */
  min: number;
  /** Corte del nivel siguiente, o null en el último. */
  next: number | null;
  /** Puntos que faltan para el siguiente nivel, o null en el último. */
  remaining: number | null;
}

/** Nivel de un saldo según cortes crecientes (`points.levels`, etiquetas de T-082). */
export function levelFor(total: number, cutoffs: readonly number[]): Level {
  const sorted = [...cutoffs].sort((a, b) => a - b);
  let index = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (total >= (sorted[i] ?? 0)) {
      index = i;
    }
  }
  const next = sorted[index + 1] ?? null;
  return {
    index,
    min: sorted[index] ?? 0,
    next,
    remaining: next === null ? null : Math.max(0, next - total),
  };
}

export interface Ranked<T> {
  rank: number;
  total: number;
  row: T;
}

/**
 * Puestos de competición (1, 2, 2, 4): los empates comparten puesto y se ordenan visualmente con
 * `tieBreak` (nombre para personas, slug para comités).
 */
export function competitionRanks<T>(
  rows: ReadonlyArray<T>,
  total: (row: T) => number,
  tieBreak: (a: T, b: T) => number,
): Ranked<T>[] {
  const sorted = [...rows].sort((a, b) => total(b) - total(a) || tieBreak(a, b));
  const ranked: Ranked<T>[] = [];
  let previousTotal: number | null = null;
  let previousRank = 0;
  sorted.forEach((row, position) => {
    const value = total(row);
    const rank = previousTotal !== null && value === previousTotal ? previousRank : position + 1;
    ranked.push({ rank, total: value, row });
    previousTotal = value;
    previousRank = rank;
  });
  return ranked;
}

export function rawRate(present: number, eligible: number): number {
  return eligible > 0 ? present / eligible : 0;
}

/** Media de las tasas crudas de los comités con elegibles: la `μ` de la ocasión. */
export function meanRate(rates: ReadonlyArray<number>): number {
  return rates.length === 0 ? 0 : rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

/** `(presentes + k·μ) / (elegibles + k)`: los chicos se acercan a la media hasta acumular evidencia (ADR-024). */
export function smoothedRate(present: number, eligible: number, mu: number, k: number): number {
  return eligible + k > 0 ? (present + k * mu) / (eligible + k) : 0;
}

/** Score del término de un comité: promedio simple de sus tasas suavizadas; null sin ocasiones. */
export function termCommitteeScore(smoothed: ReadonlyArray<number>): number | null {
  return smoothed.length === 0 ? null : meanRate(smoothed);
}

/** Redondeo a cuatro decimales, como la columna numeric(6,4). */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
