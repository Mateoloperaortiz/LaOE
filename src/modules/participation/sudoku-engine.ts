import type { SudokuDifficulty } from "./sudoku-types";

// Motor del Sudoku (ADR-078). Vive en la raíz del módulo, no en `domain/`, porque lo comparten el
// navegador y el servidor: geometría del tablero, formatos, duplicados y tabla de premios. Aquí no
// hay generador ni solver: eso es del servidor (`domain/sudoku-generator.ts`), y la regla
// `componentes-sin-servidor` garantiza que el navegador no lo importe.

export const SUDOKU_RULES_VERSION = "9x9-sfc32-v1";
export const SUDOKU_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

/** GH Points por dificultad: sin ayudas y con ayudas. Atados a la versión de reglas, no configuración. */
export const SUDOKU_REWARDS: Record<SudokuDifficulty, readonly [plain: number, assisted: number]> =
  {
    EASY: [2, 1],
    MEDIUM: [4, 2],
    HARD: [6, 3],
  };

const SIZE = 9;
const CELLS = SIZE * SIZE;

function buildUnits(): number[][] {
  const units: number[][] = [];
  for (let row = 0; row < SIZE; row += 1) {
    units.push(Array.from({ length: SIZE }, (_, column) => row * SIZE + column));
  }
  for (let column = 0; column < SIZE; column += 1) {
    units.push(Array.from({ length: SIZE }, (_, row) => row * SIZE + column));
  }
  for (let box = 0; box < SIZE; box += 1) {
    const top = Math.floor(box / 3) * 3;
    const left = (box % 3) * 3;
    units.push(
      Array.from(
        { length: SIZE },
        (_, slot) => (top + Math.floor(slot / 3)) * SIZE + left + (slot % 3),
      ),
    );
  }
  return units;
}

/** Las 27 unidades, en orden fijo: filas 0 a 8, columnas 0 a 8, cajas 0 a 8. */
export const SUDOKU_UNITS: readonly (readonly number[])[] = buildUnits();

/** Las 20 casillas que comparten fila, columna o caja con cada una, en orden ascendente. */
export const SUDOKU_PEERS: readonly (readonly number[])[] = Array.from(
  { length: CELLS },
  (_, cell) => {
    const peers = new Set<number>();
    for (const unit of SUDOKU_UNITS) {
      if (unit.includes(cell)) {
        for (const other of unit) {
          if (other !== cell) {
            peers.add(other);
          }
        }
      }
    }
    return [...peers].sort((a, b) => a - b);
  },
);

/** Una cuadrícula completa: 81 dígitos del 1 al 9. */
export function isSudokuGrid(value: string): boolean {
  return /^[1-9]{81}$/.test(value);
}

/** Un tablero o una partida a medias: 81 dígitos donde 0 es una casilla vacía. */
export function isSudokuGivens(value: string): boolean {
  return /^[0-9]{81}$/.test(value);
}

/** Las casillas cuyo dígito se repite en su fila, columna o caja. Son las reglas, no la solución. */
export function sudokuConflicts(values: string): Set<number> {
  const conflicts = new Set<number>();
  for (let cell = 0; cell < CELLS; cell += 1) {
    const digit = values[cell];
    if (digit === undefined || digit === "0") {
      continue;
    }
    for (const peer of SUDOKU_PEERS[cell] as readonly number[]) {
      if (values[peer] === digit) {
        conflicts.add(cell);
        break;
      }
    }
  }
  return conflicts;
}

/** Cada dada sigue en su lugar. */
export function respectsGivens(values: string, givens: string): boolean {
  if (values.length !== CELLS || givens.length !== CELLS) {
    return false;
  }
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (givens[cell] !== "0" && givens[cell] !== values[cell]) {
      return false;
    }
  }
  return true;
}

/**
 * Completa, sin duplicados y con las dadas en su lugar: por unicidad, eso es la solución. Con esto el
 * navegador sabe cuándo enviar sin conocerla.
 */
export function looksSolved(values: string, givens: string): boolean {
  return (
    isSudokuGrid(values) && respectsGivens(values, givens) && sudokuConflicts(values).size === 0
  );
}

export function sudokuReward(difficulty: SudokuDifficulty, assisted: boolean): number {
  return SUDOKU_REWARDS[difficulty][assisted ? 1 : 0];
}

export function isSudokuDifficulty(value: string): value is SudokuDifficulty {
  return (SUDOKU_DIFFICULTIES as readonly string[]).includes(value);
}
