import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsDate, icsText } from "@/modules/events/domain/ics-pure";
import { utcToZonedInput, zonedInputToUtc } from "@/shared/lib/dates";

// DT-129 (#164): RFC 5545 sección 3.3.11 no admite caracteres de control en un valor de texto, y un
// cliente tolerante parte las líneas también por un retorno de carro o un salto sueltos.

/** Las líneas de contenido como las lee un cliente: desplegadas y partidas por cualquier salto. */
function contentLines(ics: string): string[] {
  return ics
    .replace(/\r\n[ \t]/g, "")
    .split(/\r\n|\r|\n/)
    .filter((line) => line !== "");
}

/** El nombre de la propiedad de cada línea, en orden. */
function propertyNames(ics: string): string[] {
  return contentLines(ics).map((line) => line.slice(0, line.indexOf(":")));
}

/** Los caracteres de control que quedan en la salida, sin contar el CRLF que termina cada línea. */
function controlCodes(ics: string): number[] {
  return [...ics.replace(/\r\n/g, "")]
    .map((char) => char.codePointAt(0) ?? 0)
    .filter((code) => (code <= 0x1f && code !== 0x09) || code === 0x7f);
}

/** Por lo que parte las líneas `str.splitlines` de Python, además de `\r\n`. */
const TOLERANT_BREAKS = new Set(
  [0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029].map((code) =>
    String.fromCodePoint(code),
  ),
);

/** Las líneas de contenido como las lee un cliente tolerante a los separadores de Unicode. */
function tolerantLines(ics: string): string[] {
  const lines = [""];
  for (const char of ics.replace(/\r\n[ \t]/g, "")) {
    if (TOLERANT_BREAKS.has(char)) {
      lines.push("");
    } else {
      lines[lines.length - 1] += char;
    }
  }
  return lines.filter((line) => line !== "");
}

const CALENDAR = ["BEGIN", "VERSION", "PRODID", "CALSCALE", "METHOD", "X-WR-CALNAME"];

describe("ICS", () => {
  it("escribe fechas en UTC y escapa el texto", () => {
    expect(icsDate(new Date("2026-09-03T23:00:00.000Z"))).toBe("20260903T230000Z");
    expect(icsText("Uno; dos, tres\\ cuatro\nlínea")).toBe("Uno\\; dos\\, tres\\\\ cuatro\\nlínea");
  });

  it("pliega a 75 octetos sin partir caracteres multibyte", () => {
    const line = `DESCRIPTION:${"ñ".repeat(80)}`;
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.split("\r\n")[1]?.startsWith(" ")).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(foldLine("corta")).toBe("corta");
  });

  it("arma un calendario con una edición sin fin y otra con fin", () => {
    const ics = buildIcs({
      name: "Eventos de la OE",
      prodId: "-//OE//Casa digital//ES",
      events: [
        {
          uid: "a@oeeafit.com",
          summary: "Días EAFIT · 2026-2",
          location: "Bloque 38, EAFIT",
          url: "https://oeeafit.com/eventos/dias-eafit/2026-2",
          start: new Date("2026-10-01T23:00:00Z"),
          end: null,
          stamp: new Date("2026-09-03T12:00:00Z"),
        },
        {
          uid: "b@oeeafit.com",
          summary: "Inventiva · 2026-2",
          start: new Date("2026-11-01T13:00:00Z"),
          end: new Date("2026-11-01T18:00:00Z"),
          stamp: new Date("2026-09-03T12:00:00Z"),
        },
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:Eventos de la OE\r\n");
    expect(ics).toContain("UID:a@oeeafit.com\r\n");
    expect(ics).toContain("DTSTART:20261001T230000Z\r\n");
    expect(ics).toContain("LOCATION:Bloque 38\\, EAFIT\r\n");
    expect(ics).toContain("DTEND:20261101T180000Z\r\n");
    expect(ics.split("DTEND:")).toHaveLength(2); // solo la edición con fin lleva DTEND
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("un salto suelto en el título, el lugar o la descripción no abre una línea en el calendario", () => {
    const ics = buildIcs({
      name: "Mi agenda OE",
      prodId: "-//OE//Casa digital//ES",
      events: [
        {
          uid: "ocasion-o1@oeeafit.com",
          summary: "Reunión\rATTACH:https://ejemplo.invalid/archivo\rX-INYECTADA:1",
          description: "Primera\r\nsegunda\rtercera\ncuarta\u000BEND:VEVENT",
          location: "Bloque 38\u0000\nGEO:0;0",
          url: "https://oeeafit.com/a/abc123def4",
          start: new Date("2026-10-01T23:00:00Z"),
          end: null,
          stamp: new Date("2026-09-03T12:00:00Z"),
        },
      ],
    });
    expect(propertyNames(ics)).toEqual([
      ...CALENDAR,
      "BEGIN",
      "UID",
      "DTSTAMP",
      "DTSTART",
      "SUMMARY",
      "DESCRIPTION",
      "LOCATION",
      "URL",
      "END",
      "END",
    ]);
    expect(controlCodes(ics)).toEqual([]);
    const lines = contentLines(ics);
    expect(lines).toContain(
      "SUMMARY:Reunión\\nATTACH:https://ejemplo.invalid/archivo\\nX-INYECTADA:1",
    );
    expect(lines).toContain("DESCRIPTION:Primera\\nsegunda\\ntercera\\ncuartaEND:VEVENT");
    expect(lines).toContain("LOCATION:Bloque 38\\nGEO:0\\;0");
  });

  it("todo salto de un texto sale escapado, los demás caracteres de control se quitan y el tabulador se conserva", () => {
    expect(icsText("Uno\r\ndos\ntres\rcuatro")).toBe("Uno\\ndos\\ntres\\ncuatro");
    expect(icsText("columna\tcolumna")).toBe("columna\tcolumna");
    const controls = [...Array.from({ length: 0x20 }, (_, code) => code), 0x7f].filter(
      (code) => code !== 0x09 && code !== 0x0a && code !== 0x0d,
    );
    expect(controls).toHaveLength(30);
    for (const code of controls) {
      expect(icsText(`a${String.fromCodePoint(code)}b`), `U+${code.toString(16)}`).toBe("ab");
    }
  });

  it("el identificador, el enlace y el nombre del calendario salen sin saltos ni caracteres de control", () => {
    const ics = buildIcs({
      name: "Eventos de la OE\rX-NOMBRE:1",
      prodId: "-//OE//Casa digital//ES\nX-PRODUCTO:1",
      events: [
        {
          uid: "a\r\nATTACH:https://ejemplo.invalid/archivo\u0000@oeeafit.com",
          summary: "Inventiva · 2026-2",
          url: "https://oeeafit.com/eventos/inventiva/2026\rX-INYECTADA:1\u007F\tfin\n",
          start: new Date("2026-11-01T13:00:00Z"),
          end: new Date("2026-11-01T18:00:00Z"),
          stamp: new Date("2026-09-03T12:00:00Z"),
        },
      ],
    });
    expect(propertyNames(ics)).toEqual([
      ...CALENDAR,
      "BEGIN",
      "UID",
      "DTSTAMP",
      "DTSTART",
      "DTEND",
      "SUMMARY",
      "URL",
      "END",
      "END",
    ]);
    expect(controlCodes(ics)).toEqual([]);
    const lines = contentLines(ics);
    expect(lines).toContain("UID:aATTACH:https://ejemplo.invalid/archivo@oeeafit.com");
    expect(lines).toContain("URL:https://oeeafit.com/eventos/inventiva/2026X-INYECTADA:1fin");
    expect(lines).toContain("PRODID:-//OE//Casa digital//ESX-PRODUCTO:1");
    expect(lines).toContain("X-WR-CALNAME:Eventos de la OE\\nX-NOMBRE:1");
  });

  // DT-179 (#164): RFC 5545 no cuenta como control los separadores de línea de Unicode ni los C1 y
  // los admite en un texto, pero un cliente que parta las líneas con una función tolerante a ellos
  // (`str.splitlines` de Python parte por U+0085, U+2028 y U+2029) leería una propiedad nueva.
  it("un separador de línea de Unicode en un valor no abre una línea para un cliente que parta por ellos", () => {
    const ics = buildIcs({
      name: "Mi agenda OE\u2028X-NOMBRE:1",
      prodId: "-//OE//Casa digital//ES\u0085X-PRODUCTO:1",
      events: [
        {
          uid: "ocasion-o1\u2029X-IDENTIFICADOR:1@oeeafit.com",
          summary: "Reunión\u2028ATTACH:https://ejemplo.invalid/archivo\u2029X-INYECTADA:1",
          description: "Primera\u0085END:VEVENT",
          location: "Bloque 38\u2028GEO:0;0",
          url: "https://oeeafit.com/a/abc123def4\u2028X-ENLACE:1",
          start: new Date("2026-10-01T23:00:00Z"),
          end: null,
          stamp: new Date("2026-09-03T12:00:00Z"),
        },
      ],
    });
    const lines = tolerantLines(ics);
    expect(lines.map((line) => line.slice(0, line.indexOf(":")))).toEqual([
      ...CALENDAR,
      "BEGIN",
      "UID",
      "DTSTAMP",
      "DTSTART",
      "SUMMARY",
      "DESCRIPTION",
      "LOCATION",
      "URL",
      "END",
      "END",
    ]);
    expect(lines).toContain(
      "SUMMARY:Reunión\\nATTACH:https://ejemplo.invalid/archivo\\nX-INYECTADA:1",
    );
    expect(lines).toContain("DESCRIPTION:Primera\\nEND:VEVENT");
    expect(lines).toContain("LOCATION:Bloque 38\\nGEO:0\\;0");
    expect(lines).toContain("X-WR-CALNAME:Mi agenda OE\\nX-NOMBRE:1");
    // Lo que no es texto no lleva saltos escapados: el separador se quita.
    expect(lines).toContain("UID:ocasion-o1X-IDENTIFICADOR:1@oeeafit.com");
    expect(lines).toContain("URL:https://oeeafit.com/a/abc123def4X-ENLACE:1");
    expect(lines).toContain("PRODID:-//OE//Casa digital//ESX-PRODUCTO:1");
  });

  it("los separadores de línea de Unicode salen como salto escapado y los controles C1 se quitan", () => {
    for (const code of [0x85, 0x2028, 0x2029]) {
      expect(icsText(`a${String.fromCodePoint(code)}b`), `U+${code.toString(16)}`).toBe("a\\nb");
    }
    const c1 = Array.from({ length: 0x20 }, (_, index) => 0x80 + index).filter(
      (code) => code !== 0x85,
    );
    expect(c1).toHaveLength(31);
    for (const code of c1) {
      expect(icsText(`a${String.fromCodePoint(code)}b`), `U+${code.toString(16)}`).toBe("ab");
    }
    // Lo que sigue a los C1 es texto: el espacio duro, las tildes y los signos se conservan.
    expect(icsText("Mañana\u00A0sí · ¿vos?")).toBe("Mañana\u00A0sí · ¿vos?");
  });
});

describe("fechas en la zona de la app", () => {
  it("convierte un datetime-local de Bogotá a UTC y vuelve", () => {
    expect(zonedInputToUtc("2026-09-03T18:00", "America/Bogota").toISOString()).toBe(
      "2026-09-03T23:00:00.000Z",
    );
    expect(utcToZonedInput(new Date("2026-09-03T23:00:00Z"), "America/Bogota")).toBe(
      "2026-09-03T18:00",
    );
    // Medianoche en Bogotá es el día anterior a las 19:00 en UTC... o sea, el mismo día a las 05:00 UTC.
    expect(zonedInputToUtc("2026-01-01T00:00", "America/Bogota").toISOString()).toBe(
      "2026-01-01T05:00:00.000Z",
    );
    expect(() => zonedInputToUtc("hoy", "America/Bogota")).toThrow();
  });
});
