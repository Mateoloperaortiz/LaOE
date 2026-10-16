// Contrato serializable de Color (ADR-134). Los objetivos futuros no salen del servidor.
export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface StartColorInput {
  requestId: string;
}
export interface NextColorRoundInput extends StartColorInput {
  runId: string;
}
export interface SubmitColorRoundInput extends NextColorRoundInput {
  round: number;
  answer: HslColor;
}

export interface ColorRoundResult {
  round: number;
  target: HslColor;
  answer: HslColor;
  accuracy: number;
}

export interface ColorRunView {
  id: string;
  day: string;
  status: "IN_PROGRESS" | "FINISHED" | "EXPIRED";
  round: number;
  watchUntil: string | null;
  target: HslColor | null;
  results: ColorRoundResult[];
  average: number | null;
  points: number;
}

export interface TodayColor {
  serverNow: string;
  day: string;
  nextAvailableAt: string;
  termId: string | null;
  availability: "AVAILABLE" | "NO_TERM" | "TERM_CLOSED" | "NOT_ELIGIBLE";
  open: ColorRunView | null;
  credited: ColorRunView | null;
  best: number;
}

export type ColorDenial =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "NO_TERM"
  | "TERM_CLOSED"
  | "EXPIRED"
  | "FINISHED"
  | "REQUEST_CONFLICT"
  | "ROUND_NOT_READY"
  | "TOO_EARLY";

export type ColorResult =
  | { ok: true; serverNow: string; run: ColorRunView }
  | { ok: false; reason: ColorDenial };
