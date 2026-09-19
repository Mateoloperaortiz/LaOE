import { describe, expect, it } from "vitest";
import {
  applySudokuAction,
  isSudokuCellLocked,
  newSudokuPlay,
  restoreSudokuPlay,
  sudokuEmptyCells,
  sudokuMistakes,
  sudokuNoteDigits,
} from "@/modules/participation/sudoku-play";
import type { SudokuPlay } from "@/modules/participation/sudoku-types";

// Reductor del estado de juego (ADR-078): lo que la persona escribe, sin navegador.

const GIVENS = "053000610800901030001700409092008300307000906006300840208009700060403008049000520";
const SOLUTION =
  "953284617874961235621735489492658371387142956516397842238519764765423198149876523";

function must(play: SudokuPlay | null): SudokuPlay {
  if (!play) {
    throw new Error("La acción no cambió nada");
  }
  return play;
}

describe("escribir en el tablero", () => {
  it("nace con las dadas, sin notas ni pistas", () => {
    const play = newSudokuPlay(GIVENS);
    expect(play.values).toBe(GIVENS);
    expect(play.notes).toHaveLength(81);
    expect(play.notes.every((mask) => mask === 0)).toBe(true);
    expect(play.hinted).toEqual([]);
    expect(sudokuEmptyCells(play.values)).toBe(45);
  });

  it("pone un dígito en una casilla vacía y lo reemplaza por otro", () => {
    const one = must(
      applySudokuAction(newSudokuPlay(GIVENS), GIVENS, { type: "digit", cell: 0, digit: 9 }),
    );
    expect(one.values[0]).toBe("9");
    expect(sudokuEmptyCells(one.values)).toBe(44);
    const two = must(applySudokuAction(one, GIVENS, { type: "digit", cell: 0, digit: 4 }));
    expect(two.values[0]).toBe("4");
  });

  it("no escribe sobre una dada ni repite el mismo dígito: devuelve null", () => {
    const play = newSudokuPlay(GIVENS);
    expect(isSudokuCellLocked(play, GIVENS, 1)).toBe(true);
    expect(applySudokuAction(play, GIVENS, { type: "digit", cell: 1, digit: 9 })).toBeNull();
    expect(applySudokuAction(play, GIVENS, { type: "erase", cell: 1 })).toBeNull();
    expect(applySudokuAction(play, GIVENS, { type: "note", cell: 1, digit: 2 })).toBeNull();
    const written = must(applySudokuAction(play, GIVENS, { type: "digit", cell: 0, digit: 9 }));
    expect(applySudokuAction(written, GIVENS, { type: "digit", cell: 0, digit: 9 })).toBeNull();
  });

  it("rechaza casillas y dígitos fuera de rango", () => {
    const play = newSudokuPlay(GIVENS);
    expect(applySudokuAction(play, GIVENS, { type: "digit", cell: 81, digit: 1 })).toBeNull();
    expect(applySudokuAction(play, GIVENS, { type: "digit", cell: -1, digit: 1 })).toBeNull();
    expect(applySudokuAction(play, GIVENS, { type: "digit", cell: 0, digit: 0 })).toBeNull();
    expect(applySudokuAction(play, GIVENS, { type: "digit", cell: 0, digit: 10 })).toBeNull();
    expect(applySudokuAction(play, GIVENS, { type: "note", cell: 0, digit: 1.5 })).toBeNull();
  });

  it("borra el dígito de una casilla propia, y no hay nada que borrar en una vacía", () => {
    const written = must(
      applySudokuAction(newSudokuPlay(GIVENS), GIVENS, { type: "digit", cell: 0, digit: 9 }),
    );
    const erased = must(applySudokuAction(written, GIVENS, { type: "erase", cell: 0 }));
    expect(erased.values).toBe(GIVENS);
    expect(applySudokuAction(erased, GIVENS, { type: "erase", cell: 0 })).toBeNull();
  });
});

describe("notas a lápiz", () => {
  it("alterna cada nota y las lista en orden", () => {
    let play = newSudokuPlay(GIVENS);
    for (const digit of [7, 2, 9]) {
      play = must(applySudokuAction(play, GIVENS, { type: "note", cell: 0, digit }));
    }
    expect(sudokuNoteDigits(play.notes[0] as number)).toEqual([2, 7, 9]);
    play = must(applySudokuAction(play, GIVENS, { type: "note", cell: 0, digit: 7 }));
    expect(sudokuNoteDigits(play.notes[0] as number)).toEqual([2, 9]);
    expect(play.values).toBe(GIVENS);
  });

  it("no anota sobre una casilla que ya tiene dígito", () => {
    const written = must(
      applySudokuAction(newSudokuPlay(GIVENS), GIVENS, { type: "digit", cell: 0, digit: 9 }),
    );
    expect(applySudokuAction(written, GIVENS, { type: "note", cell: 0, digit: 2 })).toBeNull();
  });

  it("poner un dígito limpia sus notas y ese dígito en fila, columna y caja, y nada más", () => {
    let play = newSudokuPlay(GIVENS);
    // 0 y 3 comparten fila; 0 y 27 columna; 0 y 19 caja; la 40 no comparte nada con la 0.
    for (const cell of [0, 3, 27, 19, 40]) {
      play = must(applySudokuAction(play, GIVENS, { type: "note", cell, digit: 9 }));
      play = must(applySudokuAction(play, GIVENS, { type: "note", cell, digit: 4 }));
    }
    play = must(applySudokuAction(play, GIVENS, { type: "digit", cell: 0, digit: 9 }));
    expect(play.notes[0]).toBe(0);
    for (const cell of [3, 27, 19]) {
      expect(sudokuNoteDigits(play.notes[cell] as number)).toEqual([4]);
    }
    expect(sudokuNoteDigits(play.notes[40] as number)).toEqual([4, 9]);
  });

  it("borrar una casilla sin dígito le quita las notas", () => {
    const noted = must(
      applySudokuAction(newSudokuPlay(GIVENS), GIVENS, { type: "note", cell: 0, digit: 3 }),
    );
    const erased = must(applySudokuAction(noted, GIVENS, { type: "erase", cell: 0 }));
    expect(erased.notes[0]).toBe(0);
  });
});

describe("ayudas", () => {
  it("una pista escribe el dígito y deja la casilla fija", () => {
    const hinted = must(
      applySudokuAction(newSudokuPlay(GIVENS), GIVENS, { type: "hint", cell: 0, digit: 9 }),
    );
    expect(hinted.values[0]).toBe("9");
    expect(hinted.hinted).toEqual([0]);
    expect(isSudokuCellLocked(hinted, GIVENS, 0)).toBe(true);
    expect(applySudokuAction(hinted, GIVENS, { type: "digit", cell: 0, digit: 4 })).toBeNull();
    expect(applySudokuAction(hinted, GIVENS, { type: "erase", cell: 0 })).toBeNull();
    expect(applySudokuAction(hinted, GIVENS, { type: "hint", cell: 0, digit: 9 })).toBeNull();
  });

  it("una pista reemplaza un dígito equivocado", () => {
    const wrong = must(
      applySudokuAction(newSudokuPlay(GIVENS), GIVENS, { type: "digit", cell: 0, digit: 4 }),
    );
    const hinted = must(applySudokuAction(wrong, GIVENS, { type: "hint", cell: 0, digit: 9 }));
    expect(hinted.values[0]).toBe("9");
  });

  it("marca como error solo lo escrito que no coincide con la solución", () => {
    let play = newSudokuPlay(GIVENS);
    expect(sudokuMistakes(play.values, SOLUTION).size).toBe(0);
    play = must(applySudokuAction(play, GIVENS, { type: "digit", cell: 0, digit: 4 }));
    play = must(applySudokuAction(play, GIVENS, { type: "digit", cell: 3, digit: 2 }));
    expect([...sudokuMistakes(play.values, SOLUTION)]).toEqual([0]);
    expect(sudokuMistakes(SOLUTION, SOLUTION).size).toBe(0);
  });
});

describe("partida guardada en el navegador", () => {
  const saved = () => {
    let play = newSudokuPlay(GIVENS);
    play = must(applySudokuAction(play, GIVENS, { type: "digit", cell: 0, digit: 9 }));
    play = must(applySudokuAction(play, GIVENS, { type: "note", cell: 3, digit: 2 }));
    play = must(applySudokuAction(play, GIVENS, { type: "hint", cell: 4, digit: 8 }));
    return JSON.parse(JSON.stringify(play)) as SudokuPlay;
  };

  it("recupera una partida bien formada de este tablero", () => {
    expect(restoreSudokuPlay(saved(), GIVENS)).toEqual(saved());
  });

  it("descarta lo que no tiene forma de partida", () => {
    expect(restoreSudokuPlay(null, GIVENS)).toBeNull();
    expect(restoreSudokuPlay("x", GIVENS)).toBeNull();
    expect(restoreSudokuPlay({}, GIVENS)).toBeNull();
    expect(restoreSudokuPlay({ ...saved(), values: GIVENS.slice(1) }, GIVENS)).toBeNull();
    expect(restoreSudokuPlay({ ...saved(), notes: [1, 2] }, GIVENS)).toBeNull();
    expect(restoreSudokuPlay({ ...saved(), notes: new Array(81).fill(512) }, GIVENS)).toBeNull();
    expect(restoreSudokuPlay({ ...saved(), notes: new Array(81).fill(-1) }, GIVENS)).toBeNull();
    expect(restoreSudokuPlay({ ...saved(), hinted: "4" }, GIVENS)).toBeNull();
  });

  it("descarta la partida de otro tablero: una dada cambiada", () => {
    const moved = `${saved().values.slice(0, 1)}9${saved().values.slice(2)}`;
    expect(restoreSudokuPlay({ ...saved(), values: moved }, GIVENS)).toBeNull();
  });

  it("descarta pistas imposibles: repetidas, sobre una dada, vacías o fuera del tablero", () => {
    expect(restoreSudokuPlay({ ...saved(), hinted: [4, 4] }, GIVENS)).toBeNull();
    expect(restoreSudokuPlay({ ...saved(), hinted: [1] }, GIVENS)).toBeNull();
    expect(restoreSudokuPlay({ ...saved(), hinted: [5] }, GIVENS)).toBeNull();
    expect(restoreSudokuPlay({ ...saved(), hinted: [81] }, GIVENS)).toBeNull();
  });
});
