import { getEnv } from "@/env";

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

function formatTime(date: Date): string {
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

/** "AAAA-MM-DD" de un instante en la zona dada. */
function dateKeyIn(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Medianoche de hoy en la zona dada, como instante UTC. Colombia no tiene horario de verano. */
export function startOfTodayIn(timeZone: string, now = new Date()): Date {
  const local = new Date(`${dateKeyIn(timeZone, now)}T00:00:00Z`);
  // Desfase de la zona en ese momento: diferencia entre la hora local y la UTC del mismo instante.
  const offsetMinutes = zoneOffsetMinutes(timeZone, local);
  return new Date(local.getTime() - offsetMinutes * 60_000);
}

function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export const LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** "AAAA-MM-DDTHH:mm" escrito en la zona dada (un `datetime-local`) → instante UTC. */
export function zonedInputToUtc(value: string, timeZone: string): Date {
  if (!LOCAL_INPUT.test(value)) {
    throw new Error(`Fecha y hora inválidas: ${value}`);
  }
  const naive = new Date(`${value}:00Z`); // como si fuera UTC
  const offsetMinutes = zoneOffsetMinutes(timeZone, naive);
  return new Date(naive.getTime() - offsetMinutes * 60_000);
}

/** Instante UTC → "AAAA-MM-DDTHH:mm" en la zona dada, para rellenar un `datetime-local`. */
export function utcToZonedInput(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function bogotaInputToUtc(value: string): Date {
  return zonedInputToUtc(value, getEnv().APP_TIMEZONE);
}

export function utcToBogotaInput(date: Date): string {
  return utcToZonedInput(date, getEnv().APP_TIMEZONE);
}
