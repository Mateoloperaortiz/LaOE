import { getEnv } from "@/env";
import { dateKeyIn, utcToZonedInput, zonedInputToUtc } from "./dates-pure";

export {
  APP_TIME_ZONE,
  addBusinessDays,
  dateKeyIn,
  hourIn,
  LOCAL_INPUT,
  startOfTodayIn,
  utcToZonedInput,
  zonedInputToUtc,
} from "./dates-pure";

// Presentación en America/Bogota; la base y el proceso viven en UTC (ADR-020).

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: getEnv().APP_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Solo la fecha, larga ("3 de septiembre de 2026"), en la zona de la app. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: getEnv().APP_TIMEZONE,
    dateStyle: "long",
  }).format(date);
}

/** Solo la hora ("6:00 p. m."), en la zona de la app. */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: getEnv().APP_TIMEZONE,
    timeStyle: "short",
  }).format(date);
}

/** Rango legible: "3 de septiembre de 2026, 6:00 p. m. a 9:00 p. m." o dos fechas completas si cambia el día. */
export function formatDateRange(start: Date, end: Date | null): string {
  if (!end) {
    return `${formatDate(start)}, ${formatTime(start)}`;
  }
  const sameDay = dateKeyIn(getEnv().APP_TIMEZONE, start) === dateKeyIn(getEnv().APP_TIMEZONE, end);
  if (sameDay) {
    return `${formatDate(start)}, ${formatTime(start)} a ${formatTime(end)}`;
  }
  return `${formatDateTime(start)} a ${formatDateTime(end)}`;
}

/** "AAAA-MM-DD" de hoy en la zona de la app: la fecha con la que se deriva el término actual (ADR-004). */
export function todayKey(now = new Date()): string {
  return dateKeyIn(getEnv().APP_TIMEZONE, now);
}

export function bogotaInputToUtc(value: string): Date {
  return zonedInputToUtc(value, getEnv().APP_TIMEZONE);
}

export function utcToBogotaInput(date: Date): string {
  return utcToZonedInput(date, getEnv().APP_TIMEZONE);
}
