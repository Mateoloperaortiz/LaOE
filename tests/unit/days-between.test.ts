import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "@/shared/lib/dates-pure";

// DT-337, inciso b (ADR-123 regla 20): la resta de días entre dos claves, que estaba escrita en la
// mitad del término, en la viabilidad de un comité y en los avisos de permanencia. Lo que cada uno
// hace con ella está en `day-sum.test.ts`, `committee-trial-days.test.ts` y `permanence-pure.test.ts`.

describe("los días entre dos días", () => {
  it("cuenta días de calendario y lleva signo: positivo hacia adelante, negativo hacia atrás", () => {
    expect(daysBetween("2026-09-01", "2026-10-01")).toBe(30);
    expect(daysBetween("2026-10-01", "2026-09-01")).toBe(-30);
    expect(daysBetween("2026-09-01", "2026-09-01")).toBe(0);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("febrero cuenta 28 o 29 días según el año, y un año entero 365 o 366", () => {
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(daysBetween("2028-01-01", "2029-01-01")).toBe(366);
  });

  it("es la inversa de la suma de días", () => {
    for (const days of [-400, -31, -1, 0, 1, 59, 366]) {
      const to = addDays("2026-09-15", days);
      expect(daysBetween("2026-09-15", to), String(days)).toBe(days);
      expect(addDays("2026-09-15", daysBetween("2026-09-15", to)), String(days)).toBe(to);
    }
  });
});
