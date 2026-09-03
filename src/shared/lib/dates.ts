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

/** Medianoche de hoy en la zona dada, como instante UTC. Colombia no tiene horario de verano. */
export function startOfTodayIn(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const local = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
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
