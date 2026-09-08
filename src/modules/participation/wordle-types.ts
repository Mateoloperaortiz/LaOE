// Contrato serializable; los componentes no importan dominio ni diccionarios privados.
export type WordleLetterState = "correct" | "present" | "absent";
export type WordleStatus = "IN_PROGRESS" | "WON" | "LOST" | "EXPIRED";

export interface WordleAttemptView {
  ordinal: number;
  guess: string;
  feedback: WordleLetterState[];
}

export interface WordleGameView {
  id: string;
  day: string;
  termId: string;
  status: WordleStatus;
  attempts: WordleAttemptView[];
  points: number;
  /** Nunca se incluye la respuesta de una partida vigente sin terminar. */
  answer: string | null;
  nextAvailableAt: string;
}

export interface TodayWordle {
  day: string;
  nextAvailableAt: string;
  termId: string | null;
  availability: "AVAILABLE" | "NO_TERM" | "TERM_CLOSED" | "NOT_ELIGIBLE";
  game: WordleGameView | null;
}

export type WordleDenial =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "NO_TERM"
  | "TERM_CLOSED"
  | "EXPIRED"
  | "FINISHED"
  | "STALE_ATTEMPT"
  | "UNKNOWN_WORD"
  | "DICTIONARY_UNAVAILABLE"
  | "EXHAUSTED"
  | "REQUEST_CONFLICT";

export interface SubmitWordleInput {
  gameId: string;
  guess: string;
  requestId: string;
  /** Próximo ordinal que el navegador espera enviar, de 1 a 6. */
  expectedAttempt: number;
}

export type WordleResult =
  | { ok: true; game: WordleGameView }
  | { ok: false; reason: WordleDenial; game?: WordleGameView };
