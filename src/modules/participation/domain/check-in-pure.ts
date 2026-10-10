import { type OccasionStatus, windowState } from "./occasion-pure";

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

// Registro propio (ADR-035 regla 5, ADR-120 regla 17): por qué no procede. El orden de rechazos vive
// acá y en ningún otro lado: lo usa `checkInSelf`, con el término y la ocasión ya tomados, y lo usa
// la pantalla de `/a/[publicId]` para elegir el texto. El código rotativo y el booster son del
// comando. El registro del organizador es otra política (`hostCheckIn`).

/** Lo que el check-in mira de la membresía de una persona. */
export interface MembershipRef {
  status: "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";
  firstTermId: string;
}

/** Las membresías que registran asistencia, por cuenta propia o por el organizador. */
export const ELIGIBLE_STATUSES: readonly MembershipRef["status"][] = ["ACTIVE", "HONORARY"];

export type SelfCheckInEligibilityDenial =
  | "DRAFT"
  | "CANCELLED"
  | "CLOSED"
  | "TERM_CLOSED"
  | "NOT_OPEN_YET"
  | "WINDOW_CLOSED"
  | "NOT_ELIGIBLE"
  | "NEW_MEMBERS_ONLY";

export interface SelfCheckInFacts {
  occasion: {
    status: OccasionStatus;
    termId: string;
    newMembersOnly: boolean;
    checkInOpensAt: Date;
    checkInClosesAt: Date;
  };
  /** El término de la ocasión ya cerró sus puntos. */
  termClosed: boolean;
  /** `null` si la persona no tiene membresía. */
  membership: MembershipRef | null;
  now: Date;
}

/**
 * El primer peldaño del orden: una ocasión que no está abierta no recibe registros, y eso no depende
 * de nada más. Falla cerrado: todo estado que no sea `OPEN` es motivo.
 */
export function closedToSelf(status: OccasionStatus): "DRAFT" | "CANCELLED" | "CLOSED" | null {
  return status === "OPEN" ? null : status;
}

/**
 * El motivo por el que la persona no puede registrarse por su cuenta, o `null` si puede. En orden:
 * estado de la ocasión → término → ventana → membresía → solo nuevos. «Nuevo» es acá quien entró a
 * la OE en el término de la ocasión (decisión abierta 56). Falla cerrado: una ventana que no sea la
 * abierta y una membresía que no sea de las que registran son motivo.
 */
export function selfCheckInDenial(facts: SelfCheckInFacts): SelfCheckInEligibilityDenial | null {
  const { occasion, membership } = facts;
  const closed = closedToSelf(occasion.status);
  if (closed) {
    return closed;
  }
  if (facts.termClosed) {
    return "TERM_CLOSED";
  }
  const window = windowState(occasion, facts.now);
  if (window === "NOT_OPEN") {
    return "NOT_OPEN_YET";
  }
  if (window !== "OPEN") {
    return "WINDOW_CLOSED";
  }
  if (!membership || !ELIGIBLE_STATUSES.includes(membership.status)) {
    return "NOT_ELIGIBLE";
  }
  if (occasion.newMembersOnly && membership.firstTermId !== occasion.termId) {
    return "NEW_MEMBERS_ONLY";
  }
  return null;
}
