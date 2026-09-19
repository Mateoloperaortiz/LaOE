import { describe, expect, it } from "vitest";
import {
  isSudokuDifficulty,
  isSudokuGivens,
  isSudokuGrid,
  looksSolved,
  respectsGivens,
  SUDOKU_DIFFICULTIES,
  SUDOKU_PEERS,
  SUDOKU_REWARDS,
  SUDOKU_UNITS,
  sudokuConflicts,
  sudokuReward,
} from "@/modules/participation/sudoku-engine";

// Motor compartido del Sudoku (ADR-078): geometría, formatos, duplicados y premios. Sin solver.

const GIVENS = "053000610800901030001700409092008300307000906006300840208009700060403008049000520";
const SOLUTION =
  "953284617874961235621735489492658371387142956516397842238519764765423198149876523";

function put(values: string, cell: number, digit: string): string {
  return values.slice(0, cell) + digit + values.slice(cell + 1);
}

describe("geometría del Sudoku", () => {
  it("tiene 27 unidades de nueve casillas distintas: filas, columnas y cajas en ese orden", () => {
    expect(SUDOKU_UNITS).toHaveLength(27);
    for (const unit of SUDOKU_UNITS) {
      expect(new Set(unit).size).toBe(9);
    }
    expect(SUDOKU_UNITS[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(SUDOKU_UNITS[9]).toEqual([0, 9, 18, 27, 36, 45, 54, 63, 72]);
    expect(SUDOKU_UNITS[18]).toEqual([0, 1, 2, 9, 10, 11, 18, 19, 20]);
    expect(SUDOKU_UNITS[26]).toEqual([60, 61, 62, 69, 70, 71, 78, 79, 80]);
  });

  it("cada casilla está en exactamente una fila, una columna y una caja", () => {
    for (let cell = 0; cell < 81; cell += 1) {
      expect(SUDOKU_UNITS.filter((unit) => unit.includes(cell))).toHaveLength(3);
    }
  });

  it("cada casilla tiene 20 pares, sin ella misma, y la relación es simétrica", () => {
    for (let cell = 0; cell < 81; cell += 1) {
      const peers = SUDOKU_PEERS[cell] as readonly number[];
      expect(peers).toHaveLength(20);
      expect(peers).not.toContain(cell);
      for (const peer of peers) {
        expect(SUDOKU_PEERS[peer]).toContain(cell);
      }
    }
  });
});

describe("formatos del Sudoku", () => {
  it("una cuadrícula completa son 81 dígitos del 1 al 9", () => {
    expect(isSudokuGrid(SOLUTION)).toBe(true);
    expect(isSudokuGrid(GIVENS)).toBe(false);
    expect(isSudokuGrid(SOLUTION.slice(1))).toBe(false);
    expect(isSudokuGrid(`${SOLUTION}1`)).toBe(false);
    expect(isSudokuGrid(put(SOLUTION, 4, "x"))).toBe(false);
  });

  it("un tablero admite el 0 como casilla vacía", () => {
    expect(isSudokuGivens(GIVENS)).toBe(true);
    expect(isSudokuGivens(SOLUTION)).toBe(true);
    expect(isSudokuGivens(GIVENS.slice(1))).toBe(false);
    expect(isSudokuGivens(put(GIVENS, 0, "-"))).toBe(false);
  });

  it("reconoce las tres dificultades y nada más", () => {
    expect(SUDOKU_DIFFICULTIES.every(isSudokuDifficulty)).toBe(true);
    expect(isSudokuDifficulty("EXPERT")).toBe(false);
    expect(isSudokuDifficulty("easy")).toBe(false);
  });
});

describe("duplicados y solución", () => {
  it("una solución válida no tiene duplicados", () => {
    expect(sudokuConflicts(SOLUTION).size).toBe(0);
    expect(sudokuConflicts(GIVENS).size).toBe(0);
  });

  it("marca las dos casillas de un dígito repetido en la fila, la columna o la caja", () => {
    // La casilla 0 está vacía; la 1 es un 5 de la misma fila.
    expect([...sudokuConflicts(put(GIVENS, 0, "5"))].sort((a, b) => a - b)).toEqual([0, 1]);
    // El 8 de la casilla 9 comparte columna y caja con la 0.
    expect([...sudokuConflicts(put(GIVENS, 0, "8"))].sort((a, b) => a - b)).toEqual([0, 9]);
    // La 40 es el centro: el 8 de la casilla 32 comparte con ella solo la caja.
    expect([...sudokuConflicts(put(GIVENS, 40, "8"))].sort((a, b) => a - b)).toEqual([32, 40]);
  });

  it("las casillas vacías nunca chocan entre sí", () => {
    expect(sudokuConflicts("0".repeat(81)).size).toBe(0);
  });

  it("exige que cada dada siga en su lugar", () => {
    expect(respectsGivens(SOLUTION, GIVENS)).toBe(true);
    expect(respectsGivens(put(SOLUTION, 1, "9"), GIVENS)).toBe(false);
    expect(respectsGivens(SOLUTION.slice(1), GIVENS)).toBe(false);
  });

  it("completa, sin duplicados y con las dadas en su lugar es la solución", () => {
    expect(looksSolved(SOLUTION, GIVENS)).toBe(true);
    expect(looksSolved(GIVENS, GIVENS)).toBe(false);
    // Completa y con las dadas, pero con un duplicado.
    expect(looksSolved(put(SOLUTION, 0, "5"), GIVENS)).toBe(false);
    // Una cuadrícula válida de otro tablero no respeta estas dadas.
    const other = SOLUTION.replaceAll("1", "x").replaceAll("2", "1").replaceAll("x", "2");
    expect(sudokuConflicts(other).size).toBe(0);
    expect(looksSolved(other, GIVENS)).toBe(false);
  });
});

describe("premios del Sudoku", () => {
  it("paga 2, 4 y 6 sin ayudas y la mitad con ayudas", () => {
    expect(sudokuReward("EASY", false)).toBe(2);
    expect(sudokuReward("MEDIUM", false)).toBe(4);
    expect(sudokuReward("HARD", false)).toBe(6);
    expect(sudokuReward("EASY", true)).toBe(1);
    expect(sudokuReward("MEDIUM", true)).toBe(2);
    expect(sudokuReward("HARD", true)).toBe(3);
  });

  it("queda dentro de los checks de la base: de 1 a 6, y con ayudas nunca más de 3", () => {
    for (const difficulty of SUDOKU_DIFFICULTIES) {
      const [plain, assisted] = SUDOKU_REWARDS[difficulty];
      expect(plain).toBeGreaterThanOrEqual(1);
      expect(plain).toBeLessThanOrEqual(6);
      expect(assisted).toBeGreaterThanOrEqual(1);
      expect(assisted).toBeLessThanOrEqual(3);
      expect(assisted * 2).toBe(plain);
    }
  });

  it("el techo es 6, el mismo del Wordle y del 2048", () => {
    expect(Math.max(...SUDOKU_DIFFICULTIES.map((d) => sudokuReward(d, false)))).toBe(6);
  });
});
