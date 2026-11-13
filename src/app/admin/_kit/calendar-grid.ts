// La cuadrícula del Calendario de la Operación (ADR-169 regla 1): semanas de lunes a domingo y meses de
// seis semanas, en días "AAAA-MM-DD" de la hora de la OE. Lógica pura, para probarla sin base. La suma
// de días es la única de la casa (`addDays`, ADR-121 regla 6).

import { addDays } from "@/shared/lib/dates-pure";

export const CALENDAR_VIEWS = ["semana", "mes"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_LAYERS = [
  "ACTIVITY",
  "ASSEMBLY",
  "EDITION_SESSION",
  "EDITION",
  "RESERVATION",
  "BOARD",
] as const;
export type CalendarLayer = (typeof CALENDAR_LAYERS)[number];

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Un día válido "AAAA-MM-DD" o `null`. */
export function parseDayKey(raw: string | undefined | null): string | null {
  if (!raw || !DAY_KEY.test(raw)) return null;
  const ms = toUtc(raw);
  return Number.isNaN(ms) || fromUtc(ms) !== raw ? null : raw;
}

/** El lunes de la semana del día. */
export function weekStart(day: string): string {
  const weekday = new Date(toUtc(day)).getUTCDay();
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}

/** Los 7 días de la semana del día, de lunes a domingo. */
export function weekDays(day: string): string[] {
  const start = weekStart(day);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** Los 42 días de la vista de mes: seis semanas desde el lunes de la semana del primero. */
export function monthDays(day: string): string[] {
  const start = weekStart(`${day.slice(0, 7)}-01`);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/** El primer día del mes anterior o siguiente, para moverse por meses. */
export function shiftMonth(day: string, months: number): string {
  const [year, month] = day.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return fromUtc(date.getTime());
}

/** Los días visibles de una vista: la semana o la cuadrícula del mes. */
export function visibleDays(view: CalendarView, day: string): string[] {
  return view === "semana" ? weekDays(day) : monthDays(day);
}

/** Las capas pedidas en la dirección; sin parámetro o sin ninguna válida, todas. */
export function parseLayers(raw: string | string[] | undefined): CalendarLayer[] {
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((item) => item.split(","));
  const wanted = CALENDAR_LAYERS.filter((layer) => values.includes(layer));
  return wanted.length > 0 ? wanted : [...CALENDAR_LAYERS];
}

/** Los días que toca un elemento de varios días (una edición), recortados a la vista. */
export function daysCovered(
  firstDay: string,
  lastDay: string,
  visible: readonly string[],
): string[] {
  return visible.filter((day) => day >= firstDay && day <= lastDay);
}

/**
 * Los cruces de la vista (ADR-197 regla 6, tramo A8 de ADR-195): los elementos con hora que caen a la
 * misma hora que otro. Dos se cruzan si uno empieza antes de que el otro termine; uno sin hora de fin
 * solo se cruza con lo que empieza a su misma hora o lo contiene.
 */
export function overlappingIds(
  items: ReadonlyArray<{ id: string; startsAt: Date; endsAt: Date }>,
): Set<string> {
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const ids = new Set<string>();
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i];
    if (!a) continue;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (!b) continue;
      const sameStart = b.startsAt.getTime() === a.startsAt.getTime();
      if (!sameStart && b.startsAt >= a.endsAt) break;
      ids.add(a.id);
      ids.add(b.id);
    }
  }
  return ids;
}
