import { describe, expect, it } from "vitest";
import { SUDOKU_DIFFICULTIES } from "@/modules/participation/sudoku-engine";
import type { SudokuDifficulty } from "@/modules/participation/sudoku-types";
import { type CopyCode, tLabels, tList } from "@/shared/copy";
import { tLabels as tLabelsInBrowser } from "@/shared/copy/client";
import { pairCopyLabels } from "@/shared/copy/format";

// `tLabels(código, ENUM)` da la etiqueta de un valor por valor y no por su posición en la lista
// (DT-011, spec #242, ADR-126 regla 3). Lo que se fija acá es el helper: que el par no compile si la
// lista y el enum no tienen el mismo largo o si el enum no es una tupla, y que un valor que el enum
// no trae dé `undefined`, para que el sitio que lo lee conserve su respaldo de hoy (decisión abierta
// 75). Qué posición lee cada valor de cada par lo fija `enum-label-pairs.test.ts`.

/** Valores que ningún enum trae. Todos menos el primero son propiedades de `Object.prototype`. */
const STRANGERS = [
  "NO_EXISTE",
  "constructor",
  "toString",
  "hasOwnProperty",
  "valueOf",
  "__proto__",
];

function read(labels: object, value: string): unknown {
  return (labels as Record<string, unknown>)[value];
}

describe("tLabels empareja una lista del catálogo con un enum", () => {
  it("cada valor del enum da la pieza de su posición en la lista", () => {
    const [easy, medium, hard] = tList("T-2681");
    const labels = tLabels("T-2681", SUDOKU_DIFFICULTIES);

    expect(labels.EASY).toBe(easy);
    expect(labels.MEDIUM).toBe(medium);
    expect(labels.HARD).toBe(hard);
    expect(Object.keys(labels)).toEqual([...SUDOKU_DIFFICULTIES]);
  });

  it("un valor que el enum no trae no tiene etiqueta, aunque se llame como una propiedad de Object (decisión abierta 75)", () => {
    const labels = tLabels("T-2681", SUDOKU_DIFFICULTIES);

    expect(STRANGERS.map((value) => read(labels, value))).toEqual(STRANGERS.map(() => undefined));
    expect(Object.getPrototypeOf(labels)).toBeNull();
  });

  it("la entrada del navegador devuelve lo mismo que la del servidor", () => {
    const labels = tLabelsInBrowser("T-2681", SUDOKU_DIFFICULTIES);

    expect({ ...labels }).toEqual({ ...tLabels("T-2681", SUDOKU_DIFFICULTIES) });
    expect(STRANGERS.map((value) => read(labels, value))).toEqual(STRANGERS.map(() => undefined));
    expect(Object.getPrototypeOf(labels)).toBeNull();
  });

  it("un enum con un valor que se llama `__proto__` le guarda su etiqueta como a cualquier otro", () => {
    const labels = pairCopyLabels(["Primera", "Segunda"], ["__proto__", "constructor"]);

    expect(read(labels, "__proto__")).toBe("Primera");
    expect(read(labels, "constructor")).toBe("Segunda");
    expect(Object.getPrototypeOf(labels)).toBeNull();
  });
});

describe("tLabels no compila con un par que no es uno a uno", () => {
  const FOUR = ["EASY", "MEDIUM", "HARD", "EXPERT"] as const;
  const TWO = ["EASY", "MEDIUM"] as const;

  it("una lista más corta que el enum no compila; si los tipos se saltan, el valor sin pieza queda sin etiqueta", () => {
    // @ts-expect-error T-2681 trae tres piezas y el enum cuatro valores.
    const labels = tLabels("T-2681", FOUR);
    // @ts-expect-error Lo mismo en la entrada del navegador.
    tLabelsInBrowser("T-2681", FOUR);

    expect(read(labels, "HARD")).toBe(tList("T-2681")[2]);
    expect(read(labels, "EXPERT")).toBeUndefined();
  });

  it("una lista más larga que el enum no compila", () => {
    // @ts-expect-error T-2681 trae tres piezas y el enum dos valores.
    const labels = tLabels("T-2681", TWO);
    // @ts-expect-error Lo mismo en la entrada del navegador.
    tLabelsInBrowser("T-2681", TWO);

    expect(Object.keys(labels)).toEqual([...TWO]);
  });

  it("un enum que no es una tupla no compila: su largo no se puede comparar", () => {
    const typed: readonly SudokuDifficulty[] = SUDOKU_DIFFICULTIES;
    const loose: string[] = [...SUDOKU_DIFFICULTIES];

    // @ts-expect-error Una constante `X[]` no dice cuántos valores trae.
    tLabels("T-2681", typed);
    // @ts-expect-error Una constante `string[]` tampoco.
    tLabels("T-2681", loose);
    // @ts-expect-error Lo mismo en la entrada del navegador.
    tLabelsInBrowser("T-2681", typed);
    // @ts-expect-error Lo mismo en la entrada del navegador.
    tLabelsInBrowser("T-2681", loose);

    expect(tLabels("T-2681", SUDOKU_DIFFICULTIES).EASY).toBe(tList("T-2681")[0]);
  });

  it("un código que no es un literal no compila: el largo de su lista no se conoce", () => {
    const code = "T-2681" as CopyCode;

    // @ts-expect-error Sin el literal no hay tupla con la que comparar el enum.
    const labels = tLabels(code, SUDOKU_DIFFICULTIES);

    expect(read(labels, "EASY")).toBe(tList("T-2681")[0]);
  });
});
