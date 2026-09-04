// Estados del check-in (ADR-035 regla 6): reaprobar un rechazo es válido porque nunca tuvo crédito;
// anular un aprobado revierte su crédito y es terminal.

export type CheckInStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type CheckInSource = "SELF_QR" | "HOST" | "ADMIN" | "IMPORT";
export type CheckInDecision = "APPROVE" | "REJECT" | "CANCEL";

export const CHECK_IN_STATUSES: readonly CheckInStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
];
export const CHECK_IN_SOURCES: readonly CheckInSource[] = ["SELF_QR", "HOST", "ADMIN", "IMPORT"];

const TRANSITIONS: Record<CheckInStatus, readonly CheckInStatus[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["CANCELLED"],
  REJECTED: ["APPROVED"],
  CANCELLED: [],
};

export function canTransitionCheckIn(from: CheckInStatus, to: CheckInStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function statusForDecision(decision: CheckInDecision): CheckInStatus {
  return decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "CANCELLED";
}

/** El estado con el que nace un check-in: el organizador da fe (anfitrión y admin); el propio respeta la aprobación. */
export function initialStatus(source: CheckInSource, approval: "AUTO" | "MANUAL"): CheckInStatus {
  if (source === "SELF_QR") {
    return approval === "AUTO" ? "APPROVED" : "PENDING";
  }
  return "APPROVED";
}

export type CheckInOutcome = "APPROVED_WITH_POINTS" | "APPROVED" | "PENDING";

export function outcomeFor(status: CheckInStatus, points: number): CheckInOutcome {
  if (status === "PENDING") {
    return "PENDING";
  }
  return points > 0 ? "APPROVED_WITH_POINTS" : "APPROVED";
}
