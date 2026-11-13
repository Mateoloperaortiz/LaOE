import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  type TimelineReservation,
  timelineDays,
} from "@/app/admin/inventario/_ui/timeline";

// La línea de tiempo del inventario (ADR-191 regla 4): una barra por reserva viva, en su carril.
const timeZone = "America/Bogota";
const days = timelineDays("2026-03-09", 7); // lunes 9 a domingo 15 de marzo
const items = [
  { id: "parlante", name: "Parlante" },
  { id: "cables", name: "Cables" },
];

function reserva(
  id: string,
  desde: string,
  hasta: string,
  extra: Partial<TimelineReservation> = {},
): TimelineReservation {
  return {
    id,
    status: "CONFIRMED",
    overdue: false,
    startsAt: new Date(desde),
    endsAt: new Date(hasta),
    scopeLabel: `Frente ${id}`,
    requesterName: "Persona sintética",
    lines: [{ itemId: "parlante", itemName: "Parlante", quantity: 1 }],
    ...extra,
  };
}

describe("buildTimeline", () => {
  it("pone cada reserva en sus días, en la hora de Bogotá", () => {
    const [parlante, cables] = buildTimeline(
      items,
      [reserva("a", "2026-03-10T13:00:00Z", "2026-03-11T23:00:00Z")],
      days,
      timeZone,
    );
    expect(parlante?.bars).toMatchObject([{ reservationId: "a", start: 1, span: 2, lane: 0 }]);
    expect(cables?.bars).toEqual([]);
  });

  it("una reserva que termina a medianoche no ocupa el día siguiente", () => {
    const [parlante] = buildTimeline(
      items,
      [reserva("a", "2026-03-10T13:00:00Z", "2026-03-11T05:00:00Z")],
      days,
      timeZone,
    );
    expect(parlante?.bars[0]).toMatchObject({ start: 1, span: 1 });
  });

  it("las que se cruzan bajan a otro carril y las que no, comparten", () => {
    const [parlante] = buildTimeline(
      items,
      [
        reserva("a", "2026-03-10T13:00:00Z", "2026-03-12T23:00:00Z"),
        reserva("b", "2026-03-11T13:00:00Z", "2026-03-11T23:00:00Z"),
        reserva("c", "2026-03-13T13:00:00Z", "2026-03-13T23:00:00Z"),
      ],
      days,
      timeZone,
    );
    expect(parlante?.lanes).toBe(2);
    expect(parlante?.bars.map((bar) => [bar.reservationId, bar.lane])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 0],
    ]);
  });

  it("recorta lo que se sale de la ventana y omite lo cancelado o devuelto", () => {
    const [parlante] = buildTimeline(
      items,
      [
        reserva("antes", "2026-03-01T13:00:00Z", "2026-03-10T23:00:00Z"),
        reserva("despues", "2026-03-14T13:00:00Z", "2026-03-20T23:00:00Z"),
        reserva("cancelada", "2026-03-10T13:00:00Z", "2026-03-10T23:00:00Z", {
          status: "CANCELLED",
        }),
        reserva("devuelta", "2026-03-10T13:00:00Z", "2026-03-10T23:00:00Z", {
          status: "RETURNED",
        }),
      ],
      days,
      timeZone,
    );
    expect(parlante?.bars.map((bar) => [bar.reservationId, bar.start, bar.span])).toEqual([
      ["antes", 0, 2],
      ["despues", 5, 2],
    ]);
  });

  it("un préstamo vencido sigue ocupando el material hasta hoy y se marca", () => {
    const [parlante] = buildTimeline(
      items,
      [
        reserva("vencido", "2026-03-09T13:00:00Z", "2026-03-10T23:00:00Z", {
          status: "OUT",
          overdue: true,
        }),
      ],
      days,
      timeZone,
      new Date("2026-03-12T15:00:00Z"),
    );
    expect(parlante?.bars[0]).toMatchObject({ start: 0, span: 4, tone: "error" });
  });
});
