import { isSudokuGivens, respectsGivens, SUDOKU_PEERS } from "./sudoku-engine";
import type { SudokuPlay } from "./sudoku-types";

// Estado de juego del Sudoku (ADR-078): lo que la persona lleva escrito, como reductor puro. Vive
// fuera del componente porque las unitarias corren sin navegador: lo que quedara adentro solo lo
// cubriría el E2E. Nada de aquí conoce la solución salvo quien la pasa: una pista llega con su dígito.

const CELLS = 81;
const ALL_NOTES = 0b111111111;

export type SudokuAction =
  | { type: "digit"; cell: number; digit: number }
  | { type: "note"; cell: number; digit: number }
  | { type: "erase"; cell: number }
  /** Solo con ayudas: quien llama conoce la solución y pasa el dígito de esa casilla. */
  | { type: "hint"; cell: number; digit: number };

export function newSudokuPlay(givens: string): SudokuPlay {
  return { values: givens, notes: new Array<number>(CELLS).fill(0), hinted: [] };
}

function isCell(cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < CELLS;
}

function isDigit(digit: number): boolean {
  return Number.isInteger(digit) && digit >= 1 && digit <= 9;
}

/** Una dada o una casilla revelada por pista: no se escribe encima. */
export function isSudokuCellLocked(play: SudokuPlay, givens: string, cell: number): boolean {
  return givens[cell] !== "0" || play.hinted.includes(cell);
}

/** Poner un dígito borra las notas de su casilla y ese dígito de las notas de sus pares. */
function write(
  play: SudokuPlay,
  cell: number,
  digit: number,
): Pick<SudokuPlay, "values" | "notes"> {
  const notes = [...play.notes];
  notes[cell] = 0;
  const keep = ~(1 << (digit - 1));
  for (const peer of SUDOKU_PEERS[cell] as readonly number[]) {
    notes[peer] = (notes[peer] as number) & keep;
  }
  return {
    values: play.values.slice(0, cell) + String(digit) + play.values.slice(cell + 1),
    notes,
  };
}

/** El estado siguiente, o `null` si la acción no cambia nada: así la pila de deshacer no se infla. */
export function applySudokuAction(
  play: SudokuPlay,
  givens: string,
  action: SudokuAction,
): SudokuPlay | null {
  const { cell } = action;
  if (!isCell(cell) || isSudokuCellLocked(play, givens, cell)) {
    return null;
  }
  const current = play.values[cell];
  switch (action.type) {
    case "digit":
      if (!isDigit(action.digit) || current === String(action.digit)) {
        return null;
      }
      return { ...play, ...write(play, cell, action.digit) };
    case "hint":
      if (!isDigit(action.digit)) {
        return null;
      }
      return { ...write(play, cell, action.digit), hinted: [...play.hinted, cell] };
    case "note": {
      if (!isDigit(action.digit) || current !== "0") {
        return null;
      }
      const notes = [...play.notes];
      notes[cell] = (notes[cell] as number) ^ (1 << (action.digit - 1));
      return { ...play, notes };
    }
    case "erase": {
      if (current === "0" && play.notes[cell] === 0) {
        return null;
      }
      const notes = [...play.notes];
      notes[cell] = 0;
      return {
        ...play,
        values: `${play.values.slice(0, cell)}0${play.values.slice(cell + 1)}`,
        notes,
      };
    }
  }
}

/** Los dígitos anotados en una casilla, en orden. */
export function sudokuNoteDigits(mask: number): number[] {
  const digits: number[] = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    if (mask & (1 << (digit - 1))) {
      digits.push(digit);
    }
  }
  return digits;
}

/** Con ayudas: las casillas escritas cuyo dígito no es el de la solución. */
export function sudokuMistakes(values: string, solution: string): Set<number> {
  const mistakes = new Set<number>();
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (values[cell] !== "0" && values[cell] !== solution[cell]) {
      mistakes.add(cell);
    }
  }
  return mistakes;
}

export function sudokuEmptyCells(values: string): number {
  return values.split("0").length - 1;
}

/**
 * Lo guardado en el navegador no es de fiar: se acepta solo si tiene forma de partida y conserva las
 * dadas de este tablero. Cualquier otra cosa se descarta y se empieza desde las dadas.
 */
export function restoreSudokuPlay(raw: unknown, givens: string): SudokuPlay | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { values, notes, hinted } = raw as Record<string, unknown>;
  if (typeof values !== "string" || !isSudokuGivens(values) || !respectsGivens(values, givens)) {
    return null;
  }
  if (
    !Array.isArray(notes) ||
    notes.length !== CELLS ||
    !notes.every((mask) => Number.isInteger(mask) && mask >= 0 && mask <= ALL_NOTES)
  ) {
    return null;
  }
  if (
    !Array.isArray(hinted) ||
    new Set(hinted).size !== hinted.length ||
    !hinted.every((cell) => isCell(cell) && givens[cell] === "0" && values[cell] !== "0")
  ) {
    return null;
  }
  return { values, notes: notes as number[], hinted: hinted as number[] };
}
