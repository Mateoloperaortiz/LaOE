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

/** U+0000 a U+001F y U+007F: RFC 5545 (sección 3.1) no los admite en una línea de contenido. */
function isControl(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code <= 0x1f || code === 0x7f;
}

/**
 * Escapa lo que RFC 5545 (sección 3.3.11) exige en un valor de texto. Todo salto (`\r\n`, `\r` o
 * `\n`) sale como `\n` escapado y los demás caracteres de control se quitan, salvo el tabulador,
 * que el RFC sí admite: un valor nunca abre una línea nueva (ADR-116 regla 14).
 */
export function icsText(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
  return [...escaped].filter((char) => char === "\t" || !isControl(char)).join("");
}

/** Valor que no es texto (UID, URL, PRODID): sale tal cual, sin saltos ni caracteres de control. */
function icsPlain(value: string): string {
  return [...value].filter((char) => !isControl(char)).join("");
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
    `PRODID:${icsPlain(calendar.prodId)}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calendar.name)}`,
  ];
  for (const item of calendar.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${icsPlain(item.uid)}`);
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
      lines.push(`URL:${icsPlain(item.url)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
