import { describe, expect, it } from "vitest";
import { SUDOKU_DIFFICULTIES } from "@/modules/participation/sudoku-engine";
import type { SudokuDifficulty } from "@/modules/participation/sudoku-types";
import { type CopyCode, tLabels, tList } from "@/shared/copy";
import { labelsFromProps, tLabels as tLabelsInBrowser } from "@/shared/copy/client";
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

  it("un código en unión no compila aunque una de sus listas tenga el largo del enum", () => {
    // T-2681 trae tres piezas; T-381 y T-2639, cuatro. Con el código en unión el largo de la lista
    // es `3 | 4`, y tres valores o cuatro caben en uno de los dos: en la otra lista quedaría un
    // valor sin etiqueta o una pieza sin leer.
    const code = "T-2681" as "T-2681" | "T-381";
    const inBrowser = "T-2681" as "T-2681" | "T-2639";

    // @ts-expect-error Tres valores no son el par de T-381, que trae cuatro piezas.
    const labels = tLabels(code, SUDOKU_DIFFICULTIES);
    // @ts-expect-error Cuatro valores no son el par de T-2681, que trae tres.
    tLabels(code, FOUR);
    // @ts-expect-error Lo mismo en la entrada del navegador.
    tLabelsInBrowser(inBrowser, SUDOKU_DIFFICULTIES);
    // @ts-expect-error Lo mismo en la entrada del navegador.
    tLabelsInBrowser(inBrowser, FOUR);

    expect(read(labels, "EASY")).toBe(tList("T-2681")[0]);
  });
});

describe("las etiquetas que llegan por props a un componente de cliente", () => {
  // React solo deja pasar objetos llanos del servidor al navegador: un objeto sin prototipo lanza
  // «Only plain objects… Classes or null prototypes are not supported» al serializar las props.
  const labels = tLabels("T-2681", SUDOKU_DIFFICULTIES);
  const arrived: Record<string, string> = JSON.parse(JSON.stringify({ ...labels }));

  it("llegan como un objeto llano, que sí hereda de Object.prototype", () => {
    expect(Object.getPrototypeOf({ ...labels })).toBe(Object.prototype);
    expect(Object.getPrototypeOf(arrived)).toBe(Object.prototype);
    expect(typeof read(arrived, "constructor")).toBe("function");
  });

  it("labelsFromProps les vuelve a quitar el prototipo sin cambiar ninguna etiqueta", () => {
    const received = labelsFromProps(arrived);

    expect({ ...received }).toEqual({ ...labels });
    expect(STRANGERS.map((value) => read(received, value))).toEqual(STRANGERS.map(() => undefined));
    expect(Object.getPrototypeOf(received)).toBeNull();
  });
});
