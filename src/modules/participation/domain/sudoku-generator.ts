import { SUDOKU_PEERS, SUDOKU_UNITS } from "../sudoku-engine";
import type { SudokuDifficulty } from "../sudoku-types";

// Generador y solver lógico del Sudoku (ADR-078 reglas 3 a 6). Solo corre en el servidor: el
// navegador recibe las dadas y nunca genera ni resuelve. Todo es aritmética entera, y el orden de
// los sorteos es parte de las reglas: cambiarlo es una versión de reglas nueva.
//
// La dificultad es la técnica más cara que el tablero exige. Como las tres técnicas son deducciones
// correctas, que `logicSolve` llegue al final implica que la solución es única: en producción no
// corre ningún backtracking de unicidad, y nunca se exige adivinar.

export const SUDOKU_MAX_ATTEMPTS = 200;

/** 1: único lugar. 2: único candidato. 3: candidatos bloqueados, par desnudo y par oculto. */
export type SudokuTier = 1 | 2 | 3;

const CELLS = 81;
const ALL = 0b111111111;
const SEED_PATTERN = /^[0-9a-f]{16}$/;

const TIER: Record<SudokuDifficulty, SudokuTier> = { EASY: 1, MEDIUM: 2, HARD: 3 };
/** Pisos de dadas: evitan tableros ralos, no definen la dificultad. */
const FLOOR: Record<SudokuDifficulty, number> = { EASY: 36, MEDIUM: 28, HARD: 24 };

const POPCOUNT: number[] = Array.from({ length: 512 }, (_, mask) => {
  let bits = 0;
  for (let rest = mask; rest > 0; rest >>= 1) {
    bits += rest & 1;
  }
  return bits;
});

const ROW_UNITS = SUDOKU_UNITS.slice(0, 9);
const COLUMN_UNITS = SUDOKU_UNITS.slice(9, 18);
const BOX_UNITS = SUDOKU_UNITS.slice(18, 27);
const LINE_UNITS = SUDOKU_UNITS.slice(0, 18);

const rowOf = (cell: number) => Math.floor(cell / 9);
const columnOf = (cell: number) => cell % 9;
const boxOf = (cell: number) => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(columnOf(cell) / 3);

type Draw = (bound: number) => number;

// sfc32 sembrado como el del 2048 (ADR-075, corrección de la regla 3): estado `[hi, lo, hi ^ lo, 1]`
// y doce rondas descartadas. Es una copia privada a propósito: compartirla acoplaría dos versiones
// de reglas, y aquí el estado es un cierre mutable en vez de una tupla que viaja con la partida.
function createDraw(seed: string): Draw {
  let a = Number.parseInt(seed.slice(0, 8), 16) | 0;
  let b = Number.parseInt(seed.slice(8, 16), 16) | 0;
  let c = (a ^ b) | 0;
  let d = 1;
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (((c << 21) | (c >>> 11)) + t) | 0;
    return t >>> 0;
  };
  for (let round = 0; round < 12; round += 1) {
    next();
  }
  // El sesgo del módulo frente a 2^32 es despreciable con bounds ≤ 41.
  return (bound) => next() % bound;
}

/** Fisher–Yates de atrás hacia adelante: `length - 1` sorteos. */
function shuffled(length: number, first: number, draw: Draw): number[] {
  const items = Array.from({ length }, (_, index) => first + index);
  for (let i = length - 1; i >= 1; i -= 1) {
    const j = draw(i + 1);
    const held = items[i] as number;
    items[i] = items[j] as number;
    items[j] = held;
  }
  return items;
}

interface Board {
  grid: number[];
  /** Candidatos por casilla: el bit `d - 1` es el dígito `d`. 0 en una casilla ocupada. */
  candidates: number[];
  empty: number;
}

function place(board: Board, cell: number, digit: number): void {
  board.grid[cell] = digit;
  board.candidates[cell] = 0;
  board.empty -= 1;
  const keep = ~(1 << (digit - 1));
  for (const peer of SUDOKU_PEERS[cell] as readonly number[]) {
    board.candidates[peer] = (board.candidates[peer] as number) & keep;
  }
}

function boardFrom(grid: readonly number[]): Board {
  const board: Board = {
    grid: new Array<number>(CELLS).fill(0),
    candidates: new Array<number>(CELLS).fill(ALL),
    empty: CELLS,
  };
  for (let cell = 0; cell < CELLS; cell += 1) {
    const digit = grid[cell] as number;
    if (digit !== 0) {
      place(board, cell, digit);
    }
  }
  return board;
}

/** Único lugar: un dígito que cabe en una sola casilla de una unidad. */
function placeHiddenSingles(board: Board): boolean {
  let progress = false;
  for (const unit of SUDOKU_UNITS) {
    for (let digit = 1; digit <= 9; digit += 1) {
      const bit = 1 << (digit - 1);
      let where = -1;
      let count = 0;
      for (const cell of unit) {
        if ((board.candidates[cell] as number) & bit) {
          where = cell;
          count += 1;
        }
      }
      if (count === 1) {
        place(board, where, digit);
        progress = true;
      }
    }
  }
  return progress;
}

/** Único candidato: una casilla a la que le queda un solo dígito posible. */
function placeNakedSingles(board: Board): boolean {
  let progress = false;
  for (let cell = 0; cell < CELLS; cell += 1) {
    const mask = board.candidates[cell] as number;
    if (mask !== 0 && POPCOUNT[mask] === 1) {
      place(board, cell, 32 - Math.clz32(mask));
      progress = true;
    }
  }
  return progress;
}

function strike(board: Board, cell: number, mask: number): boolean {
  const before = board.candidates[cell] as number;
  if ((before & mask) === 0) {
    return false;
  }
  board.candidates[cell] = before & ~mask;
  return true;
}

/** Candidatos bloqueados: apuntar (de la caja a la línea) y reclamar (de la línea a la caja). */
function strikeLocked(board: Board): boolean {
  let progress = false;
  for (let digit = 1; digit <= 9; digit += 1) {
    const bit = 1 << (digit - 1);
    for (let box = 0; box < 9; box += 1) {
      const cells = (BOX_UNITS[box] as readonly number[]).filter(
        (cell) => (board.candidates[cell] as number) & bit,
      );
      if (cells.length < 2) {
        continue;
      }
      const first = cells[0] as number;
      if (cells.every((cell) => rowOf(cell) === rowOf(first))) {
        for (const cell of ROW_UNITS[rowOf(first)] as readonly number[]) {
          if (boxOf(cell) !== box && strike(board, cell, bit)) {
            progress = true;
          }
        }
      }
      if (cells.every((cell) => columnOf(cell) === columnOf(first))) {
        for (const cell of COLUMN_UNITS[columnOf(first)] as readonly number[]) {
          if (boxOf(cell) !== box && strike(board, cell, bit)) {
            progress = true;
          }
        }
      }
    }
    for (const line of LINE_UNITS) {
      const cells = line.filter((cell) => (board.candidates[cell] as number) & bit);
      if (cells.length < 2) {
        continue;
      }
      const box = boxOf(cells[0] as number);
      if (cells.every((cell) => boxOf(cell) === box)) {
        for (const cell of BOX_UNITS[box] as readonly number[]) {
          if (!line.includes(cell) && strike(board, cell, bit)) {
            progress = true;
          }
        }
      }
    }
  }
  return progress;
}

/** Par desnudo: dos casillas de una unidad con los mismos dos candidatos los quitan del resto. */
function strikeNakedPairs(board: Board): boolean {
  let progress = false;
  for (const unit of SUDOKU_UNITS) {
    for (let i = 0; i < 9; i += 1) {
      const one = unit[i] as number;
      const mask = board.candidates[one] as number;
      if (POPCOUNT[mask] !== 2) {
        continue;
      }
      for (let j = i + 1; j < 9; j += 1) {
        const two = unit[j] as number;
        if (board.candidates[two] !== mask) {
          continue;
        }
        for (const cell of unit) {
          if (cell !== one && cell !== two && strike(board, cell, mask)) {
            progress = true;
          }
        }
      }
    }
  }
  return progress;
}

/** Par oculto: dos dígitos que en una unidad solo caben en las mismas dos casillas las ocupan. */
function strikeHiddenPairs(board: Board): boolean {
  let progress = false;
  for (const unit of SUDOKU_UNITS) {
    const places: number[] = [];
    for (let digit = 1; digit <= 9; digit += 1) {
      const bit = 1 << (digit - 1);
      let where = 0;
      for (let slot = 0; slot < 9; slot += 1) {
        if ((board.candidates[unit[slot] as number] as number) & bit) {
          where |= 1 << slot;
        }
      }
      places.push(where);
    }
    for (let one = 0; one < 9; one += 1) {
      const where = places[one] as number;
      if (POPCOUNT[where] !== 2) {
        continue;
      }
      for (let two = one + 1; two < 9; two += 1) {
        if (places[two] !== where) {
          continue;
        }
        const others = ALL & ~((1 << one) | (1 << two));
        for (let slot = 0; slot < 9; slot += 1) {
          if (where & (1 << slot) && strike(board, unit[slot] as number, others)) {
            progress = true;
          }
        }
      }
    }
  }
  return progress;
}

/**
 * Aplica siempre la técnica más barata primero y vuelve a la primera tras cada avance. Las
 * deducciones son monótonas, así que el nivel usado es el mínimo que el tablero exige y no depende
 * del orden de recorrido dentro de cada nivel.
 */
function solveBoard(board: Board, maxTier: SudokuTier): 0 | SudokuTier {
  let used: 0 | SudokuTier = 0;
  while (board.empty > 0) {
    if (placeHiddenSingles(board)) {
      used = used === 0 ? 1 : used;
      continue;
    }
    if (maxTier >= 2 && placeNakedSingles(board)) {
      used = used < 2 ? 2 : used;
      continue;
    }
    if (maxTier >= 3) {
      const locked = strikeLocked(board);
      const naked = strikeNakedPairs(board);
      const hidden = strikeHiddenPairs(board);
      if (locked || naked || hidden) {
        used = 3;
        continue;
      }
    }
    break;
  }
  return used;
}

function parse(givens: string): number[] {
  return Array.from(givens, (digit) => Number(digit));
}

/** Resuelve solo con lógica hasta el nivel dado. `solved` implica que la solución es única. */
export function logicSolve(
  givens: string,
  maxTier: SudokuTier,
): { solved: boolean; maxTierUsed: 0 | SudokuTier; grid: string } {
  const board = boardFrom(parse(givens));
  const maxTierUsed = solveBoard(board, maxTier);
  return { solved: board.empty === 0, maxTierUsed, grid: board.grid.join("") };
}

/** La casilla vacía con menos candidatos; en empate, la de índice menor. -1 si no queda ninguna. */
function tightestCell(board: Board): number {
  let best = -1;
  let fewest = 10;
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (board.grid[cell] !== 0) {
      continue;
    }
    const count = POPCOUNT[board.candidates[cell] as number] as number;
    if (count < fewest) {
      best = cell;
      fewest = count;
    }
  }
  return best;
}

function copyOf(board: Board): Board {
  return { grid: [...board.grid], candidates: [...board.candidates], empty: board.empty };
}

/** Búsqueda en profundidad sin sorteos: completa la cuadrícula probando los dígitos en `order`. */
function fill(board: Board, order: readonly number[]): Board | null {
  if (board.empty === 0) {
    return board;
  }
  const cell = tightestCell(board);
  const mask = board.candidates[cell] as number;
  for (const digit of order) {
    if (mask & (1 << (digit - 1))) {
      const next = copyOf(board);
      place(next, cell, digit);
      const done = fill(next, order);
      if (done) {
        return done;
      }
    }
  }
  return null;
}

/** Cuenta soluciones hasta `limit`. Solo verificación cruzada de las pruebas: producción no la usa. */
export function countSolutions(givens: string, limit: number): number {
  const walk = (board: Board): number => {
    if (board.empty === 0) {
      return 1;
    }
    const cell = tightestCell(board);
    const mask = board.candidates[cell] as number;
    let found = 0;
    for (let digit = 1; digit <= 9 && found < limit; digit += 1) {
      if (mask & (1 << (digit - 1))) {
        const next = copyOf(board);
        place(next, cell, digit);
        found += walk(next);
      }
    }
    return found;
  };
  return Math.min(limit, walk(boardFrom(parse(givens))));
}

export interface GeneratedSudoku {
  /** 81 dígitos por filas; 0 es una casilla vacía. */
  givens: string;
  solution: string;
  attempts: number;
}

/**
 * Un tablero de la dificultad pedida, o `null` si la semilla agota sus intentos. Cada intento consume
 * 72 sorteos del mismo flujo, en este orden: las cajas diagonales 0, 4 y 8 (8 sorteos cada una), el
 * orden de dígitos (8) y el orden de cavado de los 41 pares `{i, 80 - i}` (40).
 */
export function generateSudoku(
  seed: string,
  difficulty: SudokuDifficulty,
  options: { maxAttempts?: number } = {},
): GeneratedSudoku | null {
  if (!SEED_PATTERN.test(seed)) {
    return null;
  }
  const draw = createDraw(seed);
  const tier = TIER[difficulty];
  const floor = FLOOR[difficulty];
  const maxAttempts = options.maxAttempts ?? SUDOKU_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const start = new Array<number>(CELLS).fill(0);
    for (const box of [0, 4, 8]) {
      const digits = shuffled(9, 1, draw);
      (BOX_UNITS[box] as readonly number[]).forEach((cell, slot) => {
        start[cell] = digits[slot] as number;
      });
    }
    const order = shuffled(9, 1, draw);
    const pairs = shuffled(41, 0, draw);
    // Tres cajas diagonales no comparten fila ni columna: siempre se pueden completar.
    const solved = fill(boardFrom(start), order);
    if (!solved) {
      continue;
    }

    const givens = [...solved.grid];
    let left = CELLS;
    for (const pair of pairs) {
      const mirror = 80 - pair;
      const removed = pair === mirror ? 1 : 2;
      if (left - removed < floor) {
        continue;
      }
      const held = [givens[pair] as number, givens[mirror] as number];
      givens[pair] = 0;
      givens[mirror] = 0;
      const probe = boardFrom(givens);
      solveBoard(probe, tier);
      if (probe.empty === 0) {
        left -= removed;
      } else {
        givens[pair] = held[0] as number;
        givens[mirror] = held[1] as number;
      }
    }

    const graded = boardFrom(givens);
    if (solveBoard(graded, tier) === tier && graded.empty === 0) {
      return { givens: givens.join(""), solution: solved.grid.join(""), attempts: attempt };
    }
  }
  return null;
}
