import type {
  GoogleCalendarEvent,
  GoogleCalendarEventBody,
} from "@/shared/adapters/google-calendar";
import { APP_TIME_ZONE, addDays, atHourIn, dateKeyIn } from "@/shared/lib/dates-pure";

// Reglas puras del calendario de la junta (ADR-197 regla 6): las áreas que dan color, de dónde nació
// cada fecha y cómo se ve un evento en Google Calendar. Sin base, para probarlas solas.

/** La junta en pleno y cada uno de sus seis cargos, en el orden de los Estatutos (art. 21). */
export const BOARD_CALENDAR_AREAS = [
  "BOARD",
  "PRESIDENT",
  "VP_ADMIN",
  "VP_FINANCE",
  "VP_PUBLIC_RELATIONS",
  "VP_COMMUNICATIONS",
  "VP_GH",
] as const;
export type BoardCalendarArea = (typeof BOARD_CALENDAR_AREAS)[number];

/** La marca con la que la casa reconoce en Google lo que nació en ella. */
export const CASA_ID_PROPERTY = "casaId";

export interface BoardEventContent {
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
}

/** Cómo se escribe en Google una fecha que nació en la casa. */
export function googleBodyFor(id: string, content: BoardEventContent): GoogleCalendarEventBody {
  const time = (at: Date) =>
    content.allDay
      ? { date: dateKeyIn(APP_TIME_ZONE, at) }
      : { dateTime: at.toISOString(), timeZone: APP_TIME_ZONE };
  return {
    status: "confirmed",
    summary: content.title,
    description: content.description,
    location: content.location,
    start: time(content.startsAt),
    end: time(content.endsAt),
    extendedProperties: { private: { [CASA_ID_PROPERTY]: id } },
  };
}

/**
 * Lo que dice un evento de Google, en la hora de la OE; null si no trae inicio. Un evento de todo el día
 * va de la medianoche de su primer día a la de su día siguiente al último, como lo guarda Google.
 */
export function contentFromGoogle(event: GoogleCalendarEvent): BoardEventContent | null {
  const at = (time: GoogleCalendarEvent["start"]) => {
    if (time?.dateTime) {
      const date = new Date(time.dateTime);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    return time?.date ? atHourIn(APP_TIME_ZONE, time.date, 0) : null;
  };
  const startsAt = at(event.start);
  if (!startsAt) return null;
  const allDay = !event.start?.dateTime && Boolean(event.start?.date);
  const endsAt =
    at(event.end) ??
    (allDay && event.start?.date
      ? atHourIn(APP_TIME_ZONE, addDays(event.start.date, 1), 0)
      : startsAt);
  return {
    title: (event.summary ?? "").trim().slice(0, 200),
    description: (event.description ?? "").slice(0, 4000),
    location: (event.location ?? "").slice(0, 300),
    startsAt,
    endsAt: endsAt < startsAt ? startsAt : endsAt,
    allDay,
  };
}

/** Si Google dice lo mismo que la casa: si no, gana el lado donde nació. */
export function sameContent(a: BoardEventContent, b: BoardEventContent): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.location === b.location &&
    a.allDay === b.allDay &&
    a.startsAt.getTime() === b.startsAt.getTime() &&
    a.endsAt.getTime() === b.endsAt.getTime()
  );
}
