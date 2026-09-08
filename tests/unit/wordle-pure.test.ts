import { describe, expect, it } from "vitest";
import {
  isWordleWord,
  nextWordleAt,
  normalizeWordleGuess,
  scoreWordleGuess,
  wordleDay,
  wordleReward,
} from "@/modules/participation/domain/wordle-pure";

describe("reglas de Wordle", () => {
  it("acepta vocales con tilde y diéresis, y preserva la Ñ compuesta o descompuesta", () => {
    expect(normalizeWordleGuess("  árbol  ")).toBe("ARBOL");
    expect(normalizeWordleGuess("agüés")).toBe("AGUES");
    expect(normalizeWordleGuess("nin\u0303os")).toBe("NIÑOS");
    expect(normalizeWordleGuess("niños")).not.toBe(normalizeWordleGuess("ninos"));
    expect(isWordleWord(normalizeWordleGuess("niños"))).toBe(true);
    expect(isWordleWord(normalizeWordleGuess("ca-sa"))).toBe(false);
    expect(isWordleWord("ABC1D")).toBe(false);
    expect(isWordleWord("ABCDEF")).toBe(false);
  });

  it("consume las letras exactas antes de repartir letras repetidas", () => {
    expect(scoreWordleGuess("LLAMA", "CALMA")).toEqual([
      "present",
      "absent",
      "present",
      "correct",
      "correct",
    ]);
    expect(scoreWordleGuess("CASAS", "SACAR")).toEqual([
      "present",
      "correct",
      "present",
      "correct",
      "absent",
    ]);
    expect(scoreWordleGuess("NIÑOS", "NINOS")).toEqual([
      "correct",
      "correct",
      "absent",
      "correct",
      "correct",
    ]);
    expect(scoreWordleGuess("CALMA", "CALMA")).toEqual(Array(5).fill("correct"));
    expect(() => scoreWordleGuess("NO", "CALMA")).toThrow();
  });

  it("premia 6 a 1 puntos y no admite ordinales fuera de las seis oportunidades", () => {
    expect([1, 2, 3, 4, 5, 6].map(wordleReward)).toEqual([6, 5, 4, 3, 2, 1]);
    expect([0, 7, 1.5, -1, Number.NaN].map(wordleReward)).toEqual([0, 0, 0, 0, 0]);
  });

  it("cambia el reto a medianoche de Bogotá incluso al cambiar año y semestre", () => {
    expect(wordleDay(new Date("2027-01-01T04:59:59.999Z"))).toBe("2026-12-31");
    expect(wordleDay(new Date("2027-01-01T05:00:00.000Z"))).toBe("2027-01-01");
    expect(nextWordleAt("2026-06-30")).toBe("2026-07-01T05:00:00.000Z");
    expect(nextWordleAt("2028-02-28")).toBe("2028-02-29T05:00:00.000Z");
  });
});
