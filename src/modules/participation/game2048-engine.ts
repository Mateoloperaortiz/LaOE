import type { Game2048Move, Game2048State } from "./game2048-types";

// Motor del 2048 (ADR-075). Vive en la raíz del módulo, no en `domain/`, porque lo corren igual el
// navegador y el servidor: la regla `componentes-sin-servidor` prohíbe que un componente importe
// dominio. Es la pieza que hace verificable el juego: el servidor reparte la semilla, recibe la
// lista de movimientos y rejuega la partida entera, así que el puntaje nunca lo pone el cliente.
//
// Todo es aritmética entera de 32 bits (sumas truncadas con `| 0`, xor, desplazamientos, una
// rotación y módulo): sin coma flotante, dos motores de JavaScript distintos no pueden divergir.

export const GAME2048_RULES_VERSION = "4x4-sfc32-v1";
export const GAME2048_MAX_MOVES = 4000;
export const GAME2048_SEED_PATTERN = /^[0-9a-f]{16}$/;

/** Umbrales de premio, del más alto al más bajo: paga el primero que alcance el puntaje. */
export const GAME2048_REWARDS: ReadonlyArray<readonly [score: number, points: number]> = [
  [20_000, 6],
  [13_000, 5],
  [9_000, 4],
  [5_000, 3],
  [2_500, 2],
  [1_000, 1],
];

const SIZE = 4;
const CELLS = SIZE * SIZE;
const MOVES = "UDLR";

type Rng = Game2048State["rng"];

// sfc32: cuatro palabras de 32 bits, solo enteros. La semilla son 64 bits del servidor.
function nextRandom(rng: Rng): { value: number; rng: Rng } {
  const [a, b, c, d] = rng;
  const t = (((a + b) | 0) + d) | 0;
  return {
    value: t >>> 0,
    rng: [b ^ (b >>> 9), (c + (c << 3)) | 0, (((c << 21) | (c >>> 11)) + t) | 0 | 0, (d + 1) | 0],
  };
}

function seedRng(seed: string): Rng {
  const hi = Number.parseInt(seed.slice(0, 8), 16) | 0;
  const lo = Number.parseInt(seed.slice(8, 16), 16) | 0;
  let rng: Rng = [hi, lo, (hi ^ lo) | 0, 1];
  for (let round = 0; round < 12; round += 1) {
    rng = nextRandom(rng).rng;
  }
  return rng;
}

/** Entero de 0 a `bound - 1`. El sesgo del módulo frente a 2^32 es despreciable con bounds ≤ 16. */
function nextBelow(rng: Rng, bound: number): { value: number; rng: Rng } {
  const drawn = nextRandom(rng);
  return { value: drawn.value % bound, rng: drawn.rng };
}

/** Índices de las cuatro líneas de cada dirección, en orden de viaje (primero el borde de llegada). */
function linesFor(move: Game2048Move): number[][] {
  const lines: number[][] = [];
  for (let lane = 0; lane < SIZE; lane += 1) {
    const line: number[] = [];
    for (let step = 0; step < SIZE; step += 1) {
      const near = move === "R" || move === "D" ? SIZE - 1 - step : step;
      line.push(move === "U" || move === "D" ? near * SIZE + lane : lane * SIZE + near);
    }
    lines.push(line);
  }
  return lines;
}

const LINES: Record<Game2048Move, number[][]> = {
  U: linesFor("U"),
  D: linesFor("D"),
  L: linesFor("L"),
  R: linesFor("R"),
};

/** Junta una línea contra su borde. Una ficha recién fusionada no vuelve a fusionarse en el mismo movimiento. */
function collapse(line: number[]): { line: number[]; gained: number } {
  const packed = line.filter((value) => value !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let index = 0; index < packed.length; index += 1) {
    const value = packed[index] as number;
    if (value === packed[index + 1]) {
      out.push(value * 2);
      gained += value * 2;
      index += 1;
    } else {
      out.push(value);
    }
  }
  while (out.length < SIZE) {
    out.push(0);
  }
  return { line: out, gained };
}

function slide(board: readonly number[], move: Game2048Move) {
  const next = [...board];
  let gained = 0;
  let changed = false;
  for (const line of LINES[move]) {
    const before = line.map((cell) => board[cell] as number);
    const collapsed = collapse(before);
    gained += collapsed.gained;
    line.forEach((cell, position) => {
      const value = collapsed.line[position] as number;
      if (next[cell] !== value) {
        changed = true;
      }
      next[cell] = value;
    });
  }
  return { board: next, gained, changed };
}

/** Primero la casilla, después el valor: el orden es parte de las reglas y no puede cambiar. */
function spawn(board: readonly number[], rng: Rng): { board: number[]; rng: Rng } {
  const free: number[] = [];
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (board[cell] === 0) {
      free.push(cell);
    }
  }
  const next = [...board];
  if (free.length === 0) {
    return { board: next, rng };
  }
  const slot = nextBelow(rng, free.length);
  const value = nextBelow(slot.rng, 10);
  next[free[slot.value] as number] = value.value === 0 ? 4 : 2;
  return { board: next, rng: value.rng };
}

function isOver(board: readonly number[]): boolean {
  for (let cell = 0; cell < CELLS; cell += 1) {
    const value = board[cell] as number;
    if (value === 0) {
      return false;
    }
    const column = cell % SIZE;
    if (column + 1 < SIZE && board[cell + 1] === value) {
      return false;
    }
    if (cell + SIZE < CELLS && board[cell + SIZE] === value) {
      return false;
    }
  }
  return true;
}

function highest(board: readonly number[]): number {
  return board.reduce((top, value) => (value > top ? value : top), 0);
}

export function isGame2048Seed(value: string): boolean {
  return GAME2048_SEED_PATTERN.test(value);
}

export function isGame2048Moves(value: string): boolean {
  return value.length <= GAME2048_MAX_MOVES && /^[UDLR]*$/.test(value);
}

/** Tablero inicial: dos apariciones por la misma regla que las demás. */
export function newGame2048(seed: string): Game2048State {
  let board: readonly number[] = new Array<number>(CELLS).fill(0);
  let rng = seedRng(seed);
  for (let tile = 0; tile < 2; tile += 1) {
    const spawned = spawn(board, rng);
    board = spawned.board;
    rng = spawned.rng;
  }
  return { board, score: 0, maxTile: highest(board), moves: 0, over: isOver(board), rng };
}

/** `null` si el movimiento no mueve nada: un movimiento inerte no es un movimiento. */
export function applyGame2048Move(state: Game2048State, move: Game2048Move): Game2048State | null {
  if (state.over || state.moves >= GAME2048_MAX_MOVES) {
    return null;
  }
  const slid = slide(state.board, move);
  if (!slid.changed) {
    return null;
  }
  const spawned = spawn(slid.board, state.rng);
  return {
    board: spawned.board,
    score: state.score + slid.gained,
    maxTile: highest(spawned.board),
    moves: state.moves + 1,
    over: isOver(spawned.board),
    rng: spawned.rng,
  };
}

/**
 * Rejuega la partida entera desde la semilla: el puntaje que sale de aquí es el único que vale.
 * `null` si la lista no es reproducible —carácter ajeno, más movimientos que el tope o uno inerte—,
 * así un puntaje inventado no tiene lista de movimientos que lo sostenga.
 */
export function replayGame2048(seed: string, moves: string): Game2048State | null {
  if (!isGame2048Seed(seed) || !isGame2048Moves(moves)) {
    return null;
  }
  let state = newGame2048(seed);
  for (const move of moves) {
    const next = applyGame2048Move(state, move as Game2048Move);
    if (!next) {
      return null;
    }
    state = next;
  }
  return state;
}

/** GH Points del puntaje: el umbral más alto alcanzado, 0 si no llega al primero. */
export function game2048Reward(score: number): number {
  if (!Number.isInteger(score) || score < 0) {
    return 0;
  }
  return GAME2048_REWARDS.find(([threshold]) => score >= threshold)?.[1] ?? 0;
}

export function isGame2048Move(value: string): value is Game2048Move {
  return value.length === 1 && MOVES.includes(value);
}
