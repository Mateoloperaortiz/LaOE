import { describe, expect, it } from "vitest";
import {
  availableOf,
  canOpen,
  monthKey,
  sanctioned,
  summarizeLines,
  totalsOf,
} from "@/modules/finance/domain/budget-pure";

// Presupuesto del comité sin I/O (ADR-059 regla 3; ADR-060 regla 12).

const lines = [
  { id: "a", name: "Logística", assigned: 1000, sortOrder: 2 },
  { id: "b", name: "Alimentación", assigned: 500, sortOrder: 1 },
];
const expenses = [
  { lineId: "a", amount: 200 },
  { lineId: "a", amount: 50.5 },
];
const transfers = [{ fromLineId: "a", toLineId: "b", amount: 100 }];

describe("presupuesto por rubros", () => {
  it("disponible = asignado + recibido − trasladado − gastado, en el orden de los rubros", () => {
    const summary = summarizeLines(lines, expenses, transfers);
    expect(summary.map((line) => line.name)).toEqual(["Alimentación", "Logística"]);
    expect(summary[1]).toMatchObject({
      assigned: 1000,
      spent: 250.5,
      transferredIn: 0,
      transferredOut: 100,
      available: 649.5,
    });
    expect(summary[0]).toMatchObject({ assigned: 500, transferredIn: 100, available: 600 });
    expect(availableOf("a", lines, expenses, transfers)).toBe(649.5);
    expect(totalsOf(summary)).toEqual({ assigned: 1500, spent: 250.5, available: 1249.5 });
  });

  it("la sanción del 10 % descuenta lo asignado (Regl. art. 66)", () => {
    expect(sanctioned(1000, 10)).toBe(900);
    expect(sanctioned(333.33, 10)).toBe(300);
    expect(sanctioned(1000, 0)).toBe(1000);
    expect(summarizeLines(lines, [], [], 10)[1]?.available).toBe(900);
  });

  it("se abre con las dos aprobaciones y al menos un rubro; el mes sale de la fecha", () => {
    expect(
      canOpen({ studentDevelopmentApprovedOn: null, vpFinanceApprovedOn: "2026-01-10", lines: 2 }),
    ).toBe("T-2290");
    expect(
      canOpen({
        studentDevelopmentApprovedOn: "2026-01-09",
        vpFinanceApprovedOn: "2026-01-10",
        lines: 0,
      }),
    ).toBe("T-2291");
    expect(
      canOpen({
        studentDevelopmentApprovedOn: "2026-01-09",
        vpFinanceApprovedOn: "2026-01-10",
        lines: 1,
      }),
    ).toBeNull();
    expect(monthKey("2026-09-13")).toBe("2026-09");
  });
});
