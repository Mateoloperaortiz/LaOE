// Contrato serializable del 2048 (ADR-075); los componentes no importan dominio ni base de datos.

export type Game2048Move = "U" | "D" | "L" | "R";
export type Game2048Status = "IN_PROGRESS" | "FINISHED" | "EXPIRED";

/** Estado de una partida en curso. Lo calculan igual el navegador y el servidor. */
export interface Game2048State {
  /** Dieciséis celdas por filas; 0 es una celda vacía. */
  readonly board: readonly number[];
  readonly score: number;
  readonly maxTile: number;
  readonly moves: number;
  readonly over: boolean;
  /** Estado del generador; viaja con la partida para poder seguir jugando movimiento a movimiento. */
  readonly rng: readonly [number, number, number, number];
}

export interface Game2048RunView {
  id: string;
  day: string;
  status: Game2048Status;
  score: number;
  maxTile: number;
  moveCount: number;
  /** GH Points acreditados por esta partida; 0 si no acreditó. */
  points: number;
}

/** Solo al crear la partida, y solo a su dueño: con la semilla se reproduce el tablero entero. */
export interface Game2048StartedView extends Game2048RunView {
  seed: string;
  rulesVersion: string;
}

export interface TodayGame2048 {
  day: string;
  nextAvailableAt: string;
  termId: string | null;
  availability: "AVAILABLE" | "NO_TERM" | "TERM_CLOSED" | "NOT_ELIGIBLE";
  /** La partida abierta de hoy, si quedó una a medias. */
  open: Game2048StartedView | null;
  /** La partida de hoy que acreditó, si ya hay una. */
  credited: Game2048RunView | null;
  /** El mejor puntaje del semestre, para que la persona tenga contra qué competir. */
  best: number;
}

export interface StartGame2048Input {
  requestId: string;
}

export interface FinishGame2048Input {
  runId: string;
  moves: string;
  requestId: string;
}

export type Game2048Denial =
  | "INVALID_INPUT"
  | "INVALID_MOVES"
  | "NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "NO_TERM"
  | "TERM_CLOSED"
  | "EXPIRED"
  | "FINISHED"
  | "REQUEST_CONFLICT";

export type Game2048Result =
  | { ok: true; run: Game2048RunView }
  | { ok: false; reason: Game2048Denial; run?: Game2048RunView };

export type Game2048StartResult =
  | { ok: true; run: Game2048StartedView }
  | { ok: false; reason: Game2048Denial };
