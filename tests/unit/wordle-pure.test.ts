import { describe, expect, it } from "vitest";
import {
  isWordleWord,
  normalizeWordleGuess,
  scoreWordleGuess,
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
});
