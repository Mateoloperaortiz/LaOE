import { describe, expect, it } from "vitest";
import {
  CALENDAR_LAYERS,
  daysCovered,
  monthDays,
  overlappingIds,
  parseDayKey,
  parseLayers,
  shiftMonth,
  weekDays,
  weekStart,
} from "@/app/admin/_kit/calendar-grid";
import { addDays } from "@/shared/lib/dates-pure";

// La cuadrícula del Calendario de la Operación (ADR-169 regla 1).

describe("semanas de lunes a domingo", () => {
  it("el lunes de la semana, también desde un domingo", () => {
    expect(weekStart("2026-11-13")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
  });

  it("la semana cruza el cambio de año sin saltarse días", () => {
    expect(weekDays("2027-01-01")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });
});

describe("meses de seis semanas", () => {
  it("empiezan el lunes de la semana del primero y traen 42 días seguidos", () => {
    const days = monthDays("2026-11-13");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-10-26");
    expect(days.slice(1).every((day, index) => day === addDays(days[index] ?? "", 1))).toBe(true);
    expect(days).toContain("2026-11-30");
  });

  it("moverse por meses cae en el primer día y cruza el año", () => {
    expect(shiftMonth("2026-12-20", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-31", -1)).toBe("2025-12-01");
  });
});

describe("lo que llega en la dirección", () => {
  it("un día inválido no pasa", () => {
    expect(parseDayKey("2026-02-30")).toBeNull();
    expect(parseDayKey("13/11/2026")).toBeNull();
    expect(parseDayKey("2026-11-13")).toBe("2026-11-13");
    expect(parseDayKey(undefined)).toBeNull();
  });

  it("las capas: las pedidas, y todas si no hay ninguna válida", () => {
    expect(parseLayers("ASSEMBLY,EDITION")).toEqual(["ASSEMBLY", "EDITION"]);
    expect(parseLayers(["ACTIVITY", "otra"])).toEqual(["ACTIVITY"]);
    expect(parseLayers(undefined)).toEqual([...CALENDAR_LAYERS]);
    expect(parseLayers("nada")).toEqual([...CALENDAR_LAYERS]);
  });

  it("una edición de varios días se ve en cada día que toca dentro de la vista", () => {
    const week = weekDays("2026-11-13");
    expect(daysCovered("2026-11-12", "2026-11-20", week)).toEqual([
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });
});

describe("los cruces (ADR-197 regla 6)", () => {
  const at = (hour: number) => new Date(Date.UTC(2099, 2, 2, hour));
  const item = (id: string, from: number, to: number) => ({
    id,
    startsAt: at(from),
    endsAt: at(to),
  });

  it("se cruzan dos cosas cuando una empieza antes de que la otra termine", () => {
    expect(
      [...overlappingIds([item("a", 14, 16), item("b", 15, 17), item("c", 17, 18)])].sort(),
    ).toEqual(["a", "b"]);
  });

  it("terminar justo cuando empieza la otra no es cruce", () => {
    expect(overlappingIds([item("a", 14, 16), item("b", 16, 18)]).size).toBe(0);
  });

  it("una sin hora de fin se cruza con lo que empieza a su hora o la contiene", () => {
    expect([...overlappingIds([item("a", 15, 15), item("b", 15, 16)])].sort()).toEqual(["a", "b"]);
    expect([...overlappingIds([item("a", 14, 18), item("b", 15, 15)])].sort()).toEqual(["a", "b"]);
    expect(overlappingIds([item("a", 15, 15), item("b", 16, 16)]).size).toBe(0);
  });

  it("un evento largo se cruza con todos los que caen adentro, aunque estén en desorden", () => {
    expect(
      [...overlappingIds([item("c", 16, 17), item("a", 9, 20), item("b", 10, 11)])].sort(),
    ).toEqual(["a", "b", "c"]);
  });
});
