// Convocatorias internas sin I/O (ADR-031, ADR-037): estado de apertura por ventana y selección por
// orden de llegada con cupo y lista de espera.

export const CALL_SELECTIONS = ["FIRST_COME", "MANUAL"] as const;
export const CALL_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export const CALL_ENTRY_STATUSES = ["APPLIED", "ACCEPTED", "WAITLISTED", "REJECTED"] as const;

export type CallSelection = (typeof CALL_SELECTIONS)[number];
export type CallStatus = (typeof CALL_STATUSES)[number];
export type CallEntryStatus = (typeof CALL_ENTRY_STATUSES)[number];

export interface CallWindow {
  status: CallStatus;
  opensAt: Date;
  closesAt: Date;
}

/** Abierta cuando está OPEN y la fecha cae en su ventana; cerrar es manual o por la ventana. */
export function isCallOpen(call: CallWindow, now = new Date()): boolean {
  return call.status === "OPEN" && now >= call.opensAt && now < call.closesAt;
}

/** Estado inicial de una inscripción según la selección y el cupo (T-147, T-148, T-901). */
export function initialEntryStatus(
  selection: CallSelection,
  capacity: number | null,
  accepted: number,
): CallEntryStatus {
  if (selection === "MANUAL") {
    return "APPLIED";
  }
  return capacity === null || accepted < capacity ? "ACCEPTED" : "WAITLISTED";
}

/** Aceptar a alguien exige cupo libre (T-1024); sin cupo fijo siempre hay lugar. */
export function hasRoom(capacity: number | null, accepted: number): boolean {
  return capacity === null || accepted < capacity;
}
