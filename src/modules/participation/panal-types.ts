export type PanalCheckpointId = 1 | 2 | 3;

export interface PanalPuzzleView {
  letters: string;
  center: string;
  totalWords: number;
  maxScore: number;
  geniusScore: number;
}

export interface PanalGameView {
  id: string;
  day: string;
  words: string[];
  score: number;
  points: number;
  awardedCheckpoints: PanalCheckpointId[];
  complete: boolean;
}

export interface TodayPanal {
  checkpointsEnabled: boolean;
  day: string;
  nextAvailableAt: string;
  availability: "AVAILABLE" | "NO_TERM" | "TERM_CLOSED" | "NOT_ELIGIBLE" | "DICTIONARY_UNAVAILABLE";
  puzzle: PanalPuzzleView | null;
  game: PanalGameView | null;
}

export type PanalDenial =
  | Exclude<TodayPanal["availability"], "AVAILABLE">
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "EXPIRED"
  | "TOO_SHORT"
  | "MISSING_CENTER"
  | "OUTSIDE_LETTERS"
  | "UNKNOWN_WORD";

export type PanalResult =
  | { ok: true; game: PanalGameView; added: boolean }
  | { ok: false; reason: PanalDenial; game?: PanalGameView };

export interface SubmitPanalInput {
  gameId: string;
  word: string;
}
