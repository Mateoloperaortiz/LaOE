// Reglas puras de la ocasión (ADR-006, ADR-035 regla 4): ciclo de vida, ventana de check-in y qué
// campos se congelan al abrir.

export type OccasionStatus = "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
export type OccasionKind = "ACTIVITY" | "ASSEMBLY" | "EDITION_SESSION";
export type AssemblyKind = "ORDINARY" | "BOARD_ELECTION" | "RUNOFF";
export type OccasionCategory =
  | "INTEGRATION"
  | "ATHLETIC_MATCH"
  | "COMMITTEE_MEETING"
  | "TALK"
  | "WORKSHOP"
  | "SOCIAL"
  | "OTHER";

export const OCCASION_KINDS: readonly OccasionKind[] = ["ACTIVITY", "ASSEMBLY", "EDITION_SESSION"];
export const ASSEMBLY_KINDS: readonly AssemblyKind[] = ["ORDINARY", "BOARD_ELECTION", "RUNOFF"];
export const OCCASION_CATEGORIES: readonly OccasionCategory[] = [
  "INTEGRATION",
  "ATHLETIC_MATCH",
  "COMMITTEE_MEETING",
  "TALK",
  "WORKSHOP",
  "SOCIAL",
  "OTHER",
];
export const OCCASION_STATUSES: readonly OccasionStatus[] = [
  "DRAFT",
  "OPEN",
  "CLOSED",
  "CANCELLED",
];

const TRANSITIONS: Record<OccasionStatus, readonly OccasionStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "CANCELLED"],
  CLOSED: ["CANCELLED"],
  CANCELLED: [],
};

export function canTransitionOccasion(from: OccasionStatus, to: OccasionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type WindowState = "NOT_OPEN" | "OPEN" | "CLOSED";

/** Estado de la ventana de check-in frente al reloj del servidor (ADR-020). */
export function windowState(
  occasion: { checkInOpensAt: Date; checkInClosesAt: Date },
  now: Date,
): WindowState {
  if (now < occasion.checkInOpensAt) {
    return "NOT_OPEN";
  }
  if (now >= occasion.checkInClosesAt) {
    return "CLOSED";
  }
  return "OPEN";
}

export interface WindowConfig {
  opensMinutesBefore: number;
  closesMinutesAfter: number;
}

/** Ventana por defecto alrededor del inicio (`checkin.defaultWindow`). */
export function defaultWindow(
  startsAt: Date,
  config: WindowConfig,
): { checkInOpensAt: Date; checkInClosesAt: Date } {
  return {
    checkInOpensAt: new Date(startsAt.getTime() - config.opensMinutesBefore * 60_000),
    checkInClosesAt: new Date(startsAt.getTime() + config.closesMinutesAfter * 60_000),
  };
}

/** Un líder abre por sí mismo solo las ocasiones sin puntos; las que dan GH Points las abre GH. */
export function canOpenOccasion(
  actor: { isAdmin: boolean },
  occasion: { points: number },
): boolean {
  return actor.isAdmin || occasion.points === 0;
}

/** Una ocasión abierta cuya ventana venció hace más de `hours` horas se cierra sola. */
export function isAutoCloseDue(
  occasion: { status: OccasionStatus; checkInClosesAt: Date },
  now: Date,
  hours: number,
): boolean {
  return (
    occasion.status === "OPEN" &&
    now.getTime() - occasion.checkInClosesAt.getTime() >= hours * 3_600_000
  );
}
