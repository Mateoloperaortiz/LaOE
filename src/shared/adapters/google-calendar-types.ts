// Lo que la API de Google Calendar devuelve y recibe de un evento (ADR-197 regla 6). Solo tipos, sin
// E/S, para que las reglas puras del calendario de la junta los usen.

export interface GoogleCalendarTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleCalendarTime;
  end?: GoogleCalendarTime;
  updated?: string;
  htmlLink?: string;
  extendedProperties?: { private?: Record<string, string> };
}

export type GoogleCalendarEventBody = Omit<GoogleCalendarEvent, "id" | "updated" | "htmlLink">;
