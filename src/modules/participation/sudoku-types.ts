// Contrato serializable del Sudoku (ADR-078); los componentes no importan dominio ni base de datos.

export type SudokuDifficulty = "EASY" | "MEDIUM" | "HARD";
export type SudokuStatus = "IN_PROGRESS" | "SOLVED" | "ABANDONED" | "EXPIRED";

export interface SudokuRunView {
  id: string;
  day: string;
  status: SudokuStatus;
  difficulty: SudokuDifficulty;
  /** Modo con ayudas: errores al instante y pistas, a cambio de la mitad del premio. */
  assisted: boolean;
  /** GH Points acreditados por esta partida; 0 si no acreditó. */
  points: number;
}

/**
 * Solo a su dueño y solo con la partida abierta de hoy. `solution` es `null` sin ayudas: en ese modo
 * la solución no viaja en ninguna respuesta. La semilla no viaja nunca.
 */
export interface SudokuStartedView extends SudokuRunView {
  /** 81 dígitos por filas; 0 es una casilla vacía. */
  givens: string;
  solution: string | null;
  rulesVersion: string;
}

export interface TodaySudoku {
  day: string;
  nextAvailableAt: string;
  termId: string | null;
  availability: "AVAILABLE" | "NO_TERM" | "TERM_CLOSED" | "NOT_ELIGIBLE";
  /** La partida abierta de hoy, si quedó una a medias. */
  open: SudokuStartedView | null;
  /** La partida de hoy que acreditó, si ya hay una. */
  credited: SudokuRunView | null;
  /** Tableros resueltos en el semestre, por dificultad. */
  solved: Record<SudokuDifficulty, number>;
}

export interface StartSudokuInput {
  requestId: string;
  difficulty: SudokuDifficulty;
  assisted: boolean;
}

export interface FinishSudokuInput {
  runId: string;
  /** La cuadrícula completa: 81 dígitos del 1 al 9. */
  grid: string;
  requestId: string;
}

export interface AbandonSudokuInput {
  runId: string;
}

/** Lo que la persona lleva escrito. Vive en el navegador; el servidor solo ve la cuadrícula final. */
export interface SudokuPlay {
  /** 81 dígitos por filas, dadas incluidas; 0 es una casilla vacía. */
  readonly values: string;
  /** Notas a lápiz: una máscara de nueve bits por casilla, el bit `d - 1` es el dígito `d`. */
  readonly notes: readonly number[];
  /** Casillas reveladas con una pista. */
  readonly hinted: readonly number[];
}

export type SudokuDenial =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "NO_TERM"
  | "TERM_CLOSED"
  | "EXPIRED"
  | "FINISHED"
  | "OPEN_RUN"
  | "NOT_SOLVED"
  | "REQUEST_CONFLICT";

export type SudokuResult =
  | { ok: true; run: SudokuRunView }
  | { ok: false; reason: SudokuDenial; run?: SudokuRunView };

export type SudokuStartResult =
  | { ok: true; run: SudokuStartedView }
  | { ok: false; reason: SudokuDenial };
