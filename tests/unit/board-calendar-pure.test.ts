import { describe, expect, it } from "vitest";
import {
  BOARD_CALENDAR_AREAS,
  contentFromGoogle,
  googleBodyFor,
  sameContent,
} from "@/modules/people/domain/board-calendar-pure";
import { BOARD_SEATS } from "@/modules/people/domain/board-seats";

// Cómo se ve en Google una fecha del calendario de la junta y cómo vuelve (ADR-197 regla 6).

const content = {
  title: "Reunión de junta",
  description: "Orden del día",
  location: "Bloque 29",
  startsAt: new Date("2099-03-02T23:00:00Z"),
  endsAt: new Date("2099-03-03T01:00:00Z"),
  allDay: false,
};

describe("el calendario de la junta en Google", () => {
  it("las áreas son la junta en pleno y los seis cargos, en el orden de los Estatutos", () => {
    expect(BOARD_CALENDAR_AREAS).toEqual(["BOARD", ...BOARD_SEATS]);
  });

  it("lo de la casa va con su hora en la zona de la OE y la marca de la casa, y vuelve igual", () => {
    const body = googleBodyFor("casa1", content);
    expect(body).toMatchObject({
      summary: "Reunión de junta",
      start: { dateTime: "2099-03-02T23:00:00.000Z", timeZone: "America/Bogota" },
      end: { dateTime: "2099-03-03T01:00:00.000Z", timeZone: "America/Bogota" },
      extendedProperties: { private: { casaId: "casa1" } },
    });
    const back = contentFromGoogle({ ...body, id: "g1" });
    expect(back && sameContent(back, content)).toBe(true);
  });

  it("un evento de todo el día de Google va de medianoche a medianoche en la hora de la OE", () => {
    expect(
      contentFromGoogle({
        id: "g2",
        summary: "Semana de parciales",
        start: { date: "2099-03-02" },
        end: { date: "2099-03-07" },
      }),
    ).toMatchObject({
      allDay: true,
      startsAt: new Date("2099-03-02T05:00:00Z"),
      endsAt: new Date("2099-03-07T05:00:00Z"),
      description: "",
      location: "",
    });
  });

  it("sin inicio no hay fecha, y un cambio en Google se nota", () => {
    expect(contentFromGoogle({ id: "g3", summary: "Sin hora" })).toBeNull();
    expect(sameContent(content, { ...content, title: "Cambiado en Google" })).toBe(false);
    expect(sameContent(content, { ...content, endsAt: new Date("2099-03-03T02:00:00Z") })).toBe(
      false,
    );
  });
});
