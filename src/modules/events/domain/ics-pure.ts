// Calendario ICS a mano (ADR-033): RFC 5545, líneas plegadas a 75 octetos, texto escapado, UTC.

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  start: Date;
  end?: Date | null;
  /** Última modificación del registro. */
  stamp: Date;
}

export interface IcsCalendar {
  name: string;
  prodId: string;
  events: IcsEvent[];
}

/** AAAAMMDDTHHMMSSZ en UTC. */
export function icsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Escapa lo que RFC 5545 exige en valores de texto. */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Pliega una línea a 75 octetos (UTF-8), continuando con un espacio, sin partir un carácter. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  const limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Las continuaciones empiezan con un espacio, que también cuenta.
    const room = parts.length === 0 ? limit : limit - 1;
    if (currentBytes + bytes > room) {
      parts.push(current);
      current = char;
      currentBytes = bytes;
    } else {
      current += char;
      currentBytes += bytes;
    }
  }
  parts.push(current);
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

export function buildIcs(calendar: IcsCalendar): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${calendar.prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calendar.name)}`,
  ];
  for (const item of calendar.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${item.uid}`);
    lines.push(`DTSTAMP:${icsDate(item.stamp)}`);
    lines.push(`DTSTART:${icsDate(item.start)}`);
    if (item.end) {
      lines.push(`DTEND:${icsDate(item.end)}`);
    }
    lines.push(`SUMMARY:${icsText(item.summary)}`);
    if (item.description) {
      lines.push(`DESCRIPTION:${icsText(item.description)}`);
    }
    if (item.location) {
      lines.push(`LOCATION:${icsText(item.location)}`);
    }
    if (item.url) {
      lines.push(`URL:${item.url}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
