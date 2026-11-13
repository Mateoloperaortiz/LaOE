import { describe, expect, it } from "vitest";
import {
  conflictedReservationIds,
  outstanding,
  peakReserved,
} from "@/modules/inventory/domain/availability-pure";

const at = (hour: number) => new Date(Date.UTC(2026, 9, 30, hour));
const slot = (from: number, to: number, quantity: number) => ({
  startsAt: at(from),
  endsAt: at(to),
  quantity,
});

describe("disponibilidad de implementos por intervalos", () => {
  it("mide el máximo simultáneo y no suma reservas sucesivas", () => {
    expect(peakReserved([slot(8, 10, 3), slot(10, 12, 4)], at(7), at(13))).toBe(4);
  });
  it("un final y un inicio a la misma hora no se solapan", () => {
    expect(peakReserved([slot(8, 10, 3), slot(10, 12, 4)], at(10), at(12))).toBe(4);
    expect(peakReserved([slot(8, 10, 3)], at(10), at(12))).toBe(0);
  });
  it("recorta a la consulta y suma solo las cantidades que coinciden", () => {
    expect(peakReserved([slot(8, 14, 2), slot(9, 11, 3), slot(10, 12, 4)], at(10), at(13))).toBe(9);
    expect(peakReserved([slot(8, 9, 9), slot(14, 16, 9)], at(10), at(13))).toBe(0);
  });
  it("mantiene pendiente lo que no regresó ni se dio de baja", () => {
    expect(outstanding(10, 3, 2)).toBe(5);
    expect(outstanding(10, 8, 2)).toBe(0);
  });
  it("no marca horarios adyacentes y avisa cuando el préstamo anterior se atrasa", () => {
    const rows = [
      { id: "sale", startsAt: at(8), endsAt: at(10), status: "OUT" as const },
      { id: "futura", startsAt: at(10), endsAt: at(12), status: "CONFIRMED" as const },
    ];
    const lines = [
      { id: "a", reservationId: "sale", itemId: "material", quantity: 1, returned: 0, lost: 0 },
      { id: "b", reservationId: "futura", itemId: "material", quantity: 1, returned: 0, lost: 0 },
    ];
    const items = [{ id: "material", mode: "QUANTITY" as const, total: 1, quarantined: 0 }];
    expect(conflictedReservationIds(rows, lines, [], items, [], at(9))).toEqual(new Set());
    expect(conflictedReservationIds(rows, lines, [], items, [], at(11))).toEqual(
      new Set(["futura"]),
    );
    expect(
      conflictedReservationIds(
        rows,
        lines.map((line) => (line.id === "a" ? { ...line, returned: 1 } : line)),
        [],
        items,
        [],
        at(11),
      ),
    ).toEqual(new Set());
  });
  it("detecta la misma unidad ocupada aunque el stock agregado alcance", () => {
    const rows = [
      { id: "sale", startsAt: at(8), endsAt: at(10), status: "OUT" as const },
      { id: "futura", startsAt: at(10), endsAt: at(12), status: "CONFIRMED" as const },
    ];
    const lines = [
      { id: "a", reservationId: "sale", itemId: "material", quantity: 1, returned: 0, lost: 0 },
      { id: "b", reservationId: "futura", itemId: "material", quantity: 1, returned: 0, lost: 0 },
    ];
    const assignments = [
      { lineId: "a", unitId: "ocupada", returnedAt: null, lostAt: null },
      { lineId: "b", unitId: "ocupada", returnedAt: null, lostAt: null },
    ];
    const items = [{ id: "material", mode: "UNIT" as const, total: 2, quarantined: 0 }];
    const units = [
      { id: "ocupada", state: "AVAILABLE" as const },
      { id: "libre", state: "AVAILABLE" as const },
    ];
    expect(conflictedReservationIds(rows, lines, assignments, items, units, at(11))).toEqual(
      new Set(["futura"]),
    );
  });
});
