// Estados del check-in (ADR-035 regla 6): reaprobar un rechazo es válido porque nunca tuvo crédito;
// anular un aprobado revierte su crédito y es terminal. EXCUSED es la falta con excusa válida aceptada
// (ADR-060 regla 5): sin crédito, terminal, y no cuenta como falta.

export type CheckInStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXCUSED";
export type CheckInSource = "SELF_QR" | "HOST" | "ADMIN" | "IMPORT";
export type CheckInDecision = "APPROVE" | "REJECT" | "CANCEL";

export const CHECK_IN_STATUSES: readonly CheckInStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXCUSED",
];
export const CHECK_IN_SOURCES: readonly CheckInSource[] = ["SELF_QR", "HOST", "ADMIN", "IMPORT"];

const TRANSITIONS: Record<CheckInStatus, readonly CheckInStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "EXCUSED"],
  APPROVED: ["CANCELLED"],
  REJECTED: ["APPROVED", "EXCUSED"],
  CANCELLED: ["EXCUSED"],
  EXCUSED: [],
};

export function canTransitionCheckIn(from: CheckInStatus, to: CheckInStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// Cancelar la ocasión anula sus asistencias vivas, también las pendientes. `PENDING → CANCELLED` vale
// solo por ese camino (ADR-119 regla 4): a una decisión, la tabla de arriba se lo niega.
const CANCELLED_WITH_OCCASION: readonly CheckInStatus[] = ["PENDING", "APPROVED"];

export function canCancelWithOccasion(from: CheckInStatus): boolean {
  return CANCELLED_WITH_OCCASION.includes(from);
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
