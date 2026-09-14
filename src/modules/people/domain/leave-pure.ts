import { addDays, addYears } from "./sanction-pure";

// Licencia con vencimiento (Est. art. 5.4 y 11.3; ADR-060 regla 10), sin I/O: la ventana del regreso
// y si una licencia ya venció. Las fechas son claves YYYY-MM-DD en Bogotá.

/** Un miembro especial lo es por un periodo máximo de un año (Est. art. 5.4). */
export const MAX_LEAVE_YEARS = 1;

export interface LeaveWindow {
  /** Primer regreso válido: mañana. */
  min: string;
  /** Último regreso válido: un año desde hoy. */
  max: string;
}

export function leaveWindow(todayKey: string): LeaveWindow {
  return { min: addDays(todayKey, 1), max: addYears(todayKey, MAX_LEAVE_YEARS) };
}

/** T-2274 si falta la fecha, T-2275 si sale de la ventana; null si sirve. */
export function leaveUntilError(
  until: string | null | undefined,
  todayKey: string,
): "T-2274" | "T-2275" | null {
  if (!until) {
    return "T-2274";
  }
  const window = leaveWindow(todayKey);
  return until < window.min || until > window.max ? "T-2275" : null;
}

/** La licencia venció sin regreso: el día siguiente al previsto (Est. art. 11.3). */
export function leaveExpired(leaveUntil: string | null, todayKey: string): boolean {
  return leaveUntil !== null && leaveUntil < todayKey;
}
