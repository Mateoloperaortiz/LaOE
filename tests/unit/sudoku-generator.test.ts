import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  countSolutions,
  generateSudoku,
  logicSolve,
  SUDOKU_MAX_ATTEMPTS,
} from "@/modules/participation/domain/sudoku-generator";
import {
  isSudokuGivens,
  isSudokuGrid,
  respectsGivens,
  sudokuConflicts,
} from "@/modules/participation/sudoku-engine";
import type { SudokuDifficulty } from "@/modules/participation/sudoku-types";

// Generador y solver lógico del Sudoku (ADR-078 reglas 4 a 6). Sin azar: los tableros literales
// fijan el orden de sorteos y las propiedades corren sobre semillas que salen de un contador.

const SAMPLES = 120;
const FLOOR: Record<SudokuDifficulty, number> = { EASY: 36, MEDIUM: 28, HARD: 24 };

/**
 * Tableros literales de tres semillas fijas. Si alguien cambia un sorteo, el orden del cavado o una
 * técnica del solver, esto falla: no se corrige el literal, se sube `SUDOKU_RULES_VERSION`.
 */
const GOLDEN: Record<
  SudokuDifficulty,
  { seed: string; givens: string; solution: string; attempts: number }
> = {
  EASY: {
    seed: "0e0e0e0e2026a001",
    givens: "053000610800901030001700409092008300307000906006300840208009700060403008049000520",
    solution: "953284617874961235621735489492658371387142956516397842238519764765423198149876523",
    attempts: 1,
  },
  MEDIUM: {
    seed: "0e0e0e0e2026b002",
    givens: "600400530090026400500000000805100700040080060006004108000000002002940010063008004",
    solution: "628491537397526481514837296835162749241789365976354128459613872782945613163278954",
    attempts: 19,
  },
  HARD: {
    seed: "0e0e0e0e2026c003",
    givens: "900004000005030106000020090009001005016000980400200700070050000103040200000600008",
    solution: "931564827285739146647128593729381465316475982458296731872953614163847259594612378",
    attempts: 11,
  },
};

const DIFFICULTIES = Object.keys(GOLDEN) as SudokuDifficulty[];

function seedFor(difficulty: string, index: number): string {
  return createHash("sha256").update(`unit:${difficulty}:${index}`).digest("hex").slice(0, 16);
}

function boards(difficulty: SudokuDifficulty) {
  return Array.from({ length: SAMPLES }, (_, index) => {
    const board = generateSudoku(seedFor(difficulty, index), difficulty);
    if (!board) {
      throw new Error(`La semilla ${index} de ${difficulty} agotó sus intentos`);
    }
    return board;
  });
}

function countGivens(givens: string): number {
  return 81 - (givens.split("0").length - 1);
}

describe("orden de sorteos del generador", () => {
  it.each(DIFFICULTIES)("la semilla fija de %s reproduce su tablero literal", (difficulty) => {
    const golden = GOLDEN[difficulty];
    expect(generateSudoku(golden.seed, difficulty)).toEqual({
      givens: golden.givens,
      solution: golden.solution,
      attempts: golden.attempts,
    });
  });

  it("la misma semilla da el mismo tablero y otra semilla da otro", () => {
    const one = generateSudoku(seedFor("HARD", 1), "HARD");
    expect(generateSudoku(seedFor("HARD", 1), "HARD")).toEqual(one);
    expect(generateSudoku(seedFor("HARD", 2), "HARD")?.solution).not.toBe(one?.solution);
  });

  it("rechaza una semilla mal formada", () => {
    expect(generateSudoku("xyz", "EASY")).toBeNull();
    expect(generateSudoku("0E0E0E0E2026A001", "EASY")).toBeNull();
    expect(generateSudoku("0e0e0e0e2026a0011", "EASY")).toBeNull();
  });

  it("devuelve null cuando la semilla agota sus intentos", () => {
    // La semilla fija de Difícil necesita once intentos: con diez no alcanza.
    expect(generateSudoku(GOLDEN.HARD.seed, "HARD", { maxAttempts: 10 })).toBeNull();
    expect(generateSudoku(GOLDEN.HARD.seed, "HARD", { maxAttempts: 11 })).not.toBeNull();
    expect(GOLDEN.HARD.attempts).toBeLessThan(SUDOKU_MAX_ATTEMPTS);
  });
});

describe.each(DIFFICULTIES)("tableros de %s", (difficulty) => {
  const generated = boards(difficulty);

  it("la solución es una cuadrícula válida y las dadas salen de ella", () => {
    for (const board of generated) {
      expect(isSudokuGrid(board.solution)).toBe(true);
      expect(sudokuConflicts(board.solution).size).toBe(0);
      expect(isSudokuGivens(board.givens)).toBe(true);
      expect(respectsGivens(board.solution, board.givens)).toBe(true);
    }
  });

  it("tienen exactamente una solución, contada aparte del solver lógico", () => {
    for (const board of generated) {
      expect(countSolutions(board.givens, 2)).toBe(1);
    }
  });

  it("exigen exactamente la técnica de su dificultad, y nunca adivinar", () => {
    const tier = DIFFICULTIES.indexOf(difficulty) + 1;
    for (const board of generated) {
      const solved = logicSolve(board.givens, tier as 1 | 2 | 3);
      expect(solved.solved).toBe(true);
      expect(solved.grid).toBe(board.solution);
      expect(solved.maxTierUsed).toBe(tier);
      if (tier > 1) {
        // Con las técnicas del nivel anterior el tablero se traba: por eso es de este nivel.
        expect(logicSolve(board.givens, (tier - 1) as 1 | 2).solved).toBe(false);
      }
    }
  });

  it("respetan el piso de dadas y la simetría de 180 grados", () => {
    for (const board of generated) {
      expect(countGivens(board.givens)).toBeGreaterThanOrEqual(FLOOR[difficulty]);
      for (let cell = 0; cell < 81; cell += 1) {
        expect(board.givens[cell] === "0").toBe(board.givens[80 - cell] === "0");
      }
    }
  });
});

describe("solver lógico", () => {
  it("con un tablero ambiguo se traba en vez de inventar", () => {
    // Sin dadas hay miles de millones de soluciones: ninguna técnica deduce nada.
    const empty = logicSolve("0".repeat(81), 3);
    expect(empty.solved).toBe(false);
    expect(empty.maxTierUsed).toBe(0);
    expect(countSolutions("0".repeat(81), 2)).toBe(2);
  });

  it("un tablero ya resuelto no usa ninguna técnica", () => {
    expect(logicSolve(GOLDEN.EASY.solution, 3)).toEqual({
      solved: true,
      maxTierUsed: 0,
      grid: GOLDEN.EASY.solution,
    });
  });
});
