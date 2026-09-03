import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, icsDate, icsText } from "@/modules/events/domain/ics-pure";
import { utcToZonedInput, zonedInputToUtc } from "@/shared/lib/dates";

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
