// Fechas sin entorno ni I/O (ADR-083): lo que reciben la zona por parámetro. Lo pueden importar los
// `*-pure.ts` y los componentes cliente; `dates.ts` suma las envolturas que leen `APP_TIMEZONE`.

/**
 * Zona de la app para el código que no puede leer el entorno. Es el valor por defecto de `APP_TIMEZONE`
 * (src/env.ts); Colombia no tiene horario de verano.
 */
export const APP_TIME_ZONE = "America/Bogota";

/** Suma días hábiles (lunes a viernes, sin festivos) a partir de un instante: el plazo de la eliminación. */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }
  return result;
}

/** "AAAA-MM-DD" de un instante en la zona dada. */
export function dateKeyIn(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hora (0 a 23) de un instante en la zona dada. */
export function hourIn(timeZone: string, at: Date): number {
  const value = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit" })
    .formatToParts(at)
    .find((part) => part.type === "hour")?.value;
  return Number(value ?? "0");
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
