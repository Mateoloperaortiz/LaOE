import { describe, expect, it } from "vitest";
import {
  rubricLevel,
  rubricPoints,
  rubricTotal,
  THE_CHALLENGE_RUBRIC,
} from "@/modules/competition/domain/rubric-pure";

// Rúbrica de The Challenge (ADR-089 regla 7): pesos 20/20/20/15/10 llevados a 100 y puntos = total × 10.

const { criteria, scale } = THE_CHALLENGE_RUBRIC;

describe("rúbrica de The Challenge", () => {
  it("es la de la OE: cinco criterios que suman 85 % y escala 10", () => {
    expect(criteria.map((criterion) => criterion.weight)).toEqual([20, 20, 20, 15, 10]);
    expect(scale).toBe(10);
  });

  it("lleva el total a 100: todo en 10 da 100 y 1000 puntos", () => {
    const total = rubricTotal(criteria, [10, 10, 10, 10, 10]);
    expect(total).toBe(100);
    expect(rubricPoints(total ?? 0, scale)).toBe(1000);
  });

  it("pondera con los pesos de la hoja Instrucciones", () => {
    // (8·20 + 6·20 + 10·20 + 5·15 + 10·10) / 85 · 10 = 655 / 8,5 = 77,06
    const total = rubricTotal(criteria, [8, 6, 10, 5, 10]) ?? 0;
    expect(total).toBeCloseTo(77.0588, 3);
    expect(rubricPoints(total, scale)).toBe(771);
    expect(rubricTotal(criteria, [1, 1, 1, 1, 1])).toBe(10);
  });

  it("sin todas las notas no hay total, y una nota fuera de 1 a 10 se rechaza", () => {
    expect(rubricTotal(criteria, [10, 10, 10, 10])).toBeNull();
    expect(rubricTotal(criteria, [10, null, 10, 10, 10])).toBeNull();
    expect(() => rubricTotal(criteria, [11, 10, 10, 10, 10])).toThrow(RangeError);
    expect(() => rubricTotal(criteria, [0, 10, 10, 10, 10])).toThrow(RangeError);
    expect(() => rubricTotal(criteria, [7.5, 10, 10, 10, 10])).toThrow(RangeError);
  });

  it("los niveles usan los cortes de la hoja Consolidado", () => {
    expect(rubricLevel(100)).toBe("EXCELLENT");
    expect(rubricLevel(85)).toBe("EXCELLENT");
    expect(rubricLevel(84.9)).toBe("GOOD");
    expect(rubricLevel(65)).toBe("GOOD");
    expect(rubricLevel(45)).toBe("FAIR");
    expect(rubricLevel(44.9)).toBe("TO_IMPROVE");
  });
});
