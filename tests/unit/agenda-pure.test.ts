import { describe, expect, it } from "vitest";
import { buildIcs } from "@/modules/events/domain/ics-pure";
import { agendaEntries } from "@/modules/participation/domain/agenda-pure";

// ICS personal (ADR-038 regla 12): una entrada por ocasión y por edición con UID propio, ordenadas.

describe("agendaEntries", () => {
  const base = "https://oeeafit.com";
  const host = "oeeafit.com";
  const stamp = new Date("2026-09-01T00:00:00Z");

  it("arma las entradas con UID por ocasión y edición, URL y descripción en texto plano", () => {
    const entries = agendaEntries(
      [
        {
          id: "o1",
          publicId: "abc123def4",
          title: "Integración",
          description: "## Traé **ganas**\n\nY [algo](https://x.co).",
          location: "Bloque 29",
          startsAt: new Date("2026-09-12T23:00:00Z"),
          endsAt: new Date("2026-09-13T01:00:00Z"),
          updatedAt: stamp,
        },
      ],
      [
        {
          id: "e1",
          name: "2026",
          eventName: "Días EAFIT",
          eventSlug: "dias-eafit",
          slug: "2026",
          description: "",
          location: null,
          startsAt: new Date("2026-09-10T13:00:00Z"),
          endsAt: null,
          updatedAt: stamp,
        },
      ],
      base,
      host,
    );
    expect(entries.map((entry) => entry.uid)).toEqual([
      "edicion-e1@oeeafit.com",
      "ocasion-o1@oeeafit.com",
    ]);
    expect(entries[1]).toMatchObject({
      summary: "Integración",
      description: "Traé ganas Y algo.",
      location: "Bloque 29",
      url: "https://oeeafit.com/a/abc123def4",
    });
    expect(entries[0]).toMatchObject({
      summary: "Días EAFIT · 2026",
      url: "https://oeeafit.com/eventos/dias-eafit/2026",
    });
    expect(entries[0]).not.toHaveProperty("description");
    const ics = buildIcs({ name: "Mi agenda OE", prodId: "-//OE//ES", events: entries });
    expect(ics).toContain("UID:ocasion-o1@oeeafit.com");
    expect(ics).toContain("UID:edicion-e1@oeeafit.com");
    expect(ics).toContain("DTSTART:20260912T230000Z");
  });
});
