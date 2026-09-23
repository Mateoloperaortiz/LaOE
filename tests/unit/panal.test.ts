import { describe, expect, it } from "vitest";
import puzzles from "@/modules/participation/data/panal/versions/rla-es-2.9-panal-v1/puzzles.json";
import {
  getPanalPuzzle,
  PANAL_DICTIONARY_VERSION,
  panalPuzzleForDay,
  panalPuzzleView,
} from "@/modules/participation/domain/panal-dictionary";
import {
  isPanalPangram,
  normalizePanalWord,
  panalGeniusScore,
  panalRank,
  panalWordError,
  panalWordScore,
} from "@/modules/participation/panal-engine";

describe("Panal en español", () => {
  it("normaliza tildes y diéresis sin confundir Ñ con N", () => {
    expect(normalizePanalWord("  piN\u0303ón  ")).toBe("PIÑON");
    expect(normalizePanalWord("pingüino")).toBe("PINGUINO");
    expect(normalizePanalWord("año")).not.toBe(normalizePanalWord("ano"));
  });
  it("valida longitud, central, alfabeto y permite repetir letras", () => {
    expect(panalWordError("CASA", "ACILORT", "A")).toBe("OUTSIDE_LETTERS");
    expect(panalWordError("TILO", "ACILORT", "A")).toBe("MISSING_CENTER");
    expect(panalWordError("ALA", "ACILORT", "A")).toBe("TOO_SHORT");
    expect(panalWordError("LATA!", "ACILORT", "A")).toBe("INVALID_INPUT");
    expect(panalWordError("A".repeat(33), "ACILORT", "A")).toBe("INVALID_INPUT");
    expect(panalWordError("ACATAR", "ACILORT", "A")).toBeNull();
  });
  it("puntúa palabras, pangramas y los límites de Genio sin redondear hacia abajo", () => {
    expect(panalWordScore("LATA")).toBe(1);
    expect(panalWordScore("ACATAR")).toBe(6);
    expect(isPanalPangram("CARTILLA")).toBe(false);
    expect(panalWordScore("CORTICAL")).toBe(15);
    expect(panalGeniusScore(101)).toBe(71);
    expect(panalRank(70, 101)).toBe(7);
    expect(panalRank(71, 101)).toBe(8);
    expect(panalRank(101, 101)).toBe(9);
  });
  it("cada tablero es jugable y todas sus respuestas respetan las reglas", () => {
    expect(puzzles).toHaveLength(326);
    expect(new Set(puzzles.map((p) => p.letters)).size).toBe(puzzles.length);
    for (const puzzle of puzzles) {
      expect(new Set(puzzle.letters).size).toBe(7);
      expect(puzzle.letters).toContain(puzzle.center);
      expect(puzzle.words.length).toBeGreaterThanOrEqual(25);
      expect(puzzle.words.length).toBeLessThanOrEqual(80);
      expect(new Set(puzzle.words).size).toBe(puzzle.words.length);
      expect(puzzle.words.some(isPanalPangram)).toBe(true);
      for (const word of puzzle.words)
        expect(panalWordError(word, puzzle.letters, puzzle.center)).toBeNull();
      const view = panalPuzzleView(puzzle);
      expect(view.maxScore).toBe(puzzle.words.reduce((sum, word) => sum + panalWordScore(word), 0));
      expect(view).not.toHaveProperty("words");
    }
  });
  it("rota determinísticamente sin repetir, conserva versiones y no cae a la actual si falta una", () => {
    const ids = Array.from(
      { length: puzzles.length },
      (_, i) =>
        panalPuzzleForDay(new Date(Date.UTC(2026, 8, 23 + i)).toISOString().slice(0, 10)).id,
    );
    expect(new Set(ids).size).toBe(puzzles.length);
    const first = panalPuzzleForDay("2026-09-23");
    expect(panalPuzzleForDay("2026-09-23")).toEqual(first);
    expect(getPanalPuzzle(PANAL_DICTIONARY_VERSION, first.id)).toEqual(first);
    expect(getPanalPuzzle("desconocida", first.id)).toBeUndefined();
  });
});
