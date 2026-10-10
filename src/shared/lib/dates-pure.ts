// Fechas sin entorno ni I/O (ADR-083): lo que reciben la zona por parámetro. Lo pueden importar los
// `*-pure.ts` y los componentes cliente; `dates.ts` suma las envolturas que leen `APP_TIMEZONE`.

/**
 * Zona de la app para el código que no puede leer el entorno. Es el valor por defecto de `APP_TIMEZONE`
 * (src/env.ts); Colombia no tiene horario de verano.
 */
export const APP_TIME_ZONE = "America/Bogota";

/**
 * Suma días hábiles a partir de un instante y conserva la hora: el plazo de una excusa, el de la
 * eliminación y el vencimiento de las tareas de GH. Hábil es de lunes a viernes en el día civil de la
 * zona dada, sin festivos (ADR-118 regla 12; los festivos y la hora de corte son la decisión abierta 33).
 * Avanza de a 24 horas, que es un día civil en una zona sin horario de verano como la de Colombia.
 */
export function addBusinessDaysIn(timeZone: string, from: Date, days: number): Date {
  const result = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (!isWeekendIn(timeZone, result)) {
      remaining -= 1;
    }
  }
  return result;
}

/** Si ese instante cae en sábado o domingo en la zona dada. */
function isWeekendIn(timeZone: string, at: Date): boolean {
  const weekday = new Date(`${dateKeyIn(timeZone, at)}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
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

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** El instante en que dan las `hour` en punto de ese día ("AAAA-MM-DD") en la zona dada. */
export function atHourIn(timeZone: string, dayKey: string, hour: number): Date {
  if (!DAY_KEY.test(dayKey) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Día u hora inválidos: ${dayKey} ${hour}`);
  }
  return zonedInputToUtc(`${dayKey}T${String(hour).padStart(2, "0")}:00`, timeZone);
}

/**
 * Un día ("AAAA-MM-DD") más `days` días, o menos si es negativo: aritmética de calendario, sin zona ni
 * horas. Es la única suma de días de la casa (ADR-121 regla 6).
 */
export function addDays(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * La medianoche que le sigue a ese instante en la zona dada: cuando empieza su día siguiente. Va por
 * el día y no por horas sumadas: el día de ese instante, más uno, a las cero de la zona.
 */
export function startOfNextDayIn(timeZone: string, at: Date): Date {
  return atHourIn(timeZone, addDays(dateKeyIn(timeZone, at), 1), 0);
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
