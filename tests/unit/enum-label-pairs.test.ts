import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tList } from "@/shared/copy";
import {
  type LabelPair,
  PAIRS,
  UNEVEN_PAIRS,
  UNSEEN_PAIRS,
  ZIP_PAIRS,
} from "./enum-label-pairs.table";

// La red de la migración de las etiquetas por valor (DT-011, spec #242, ADR-126 regla 1). Hoy el
// código lee la etiqueta de un valor por su posición en una lista del catálogo de textos: el
// `indexOf` del valor en su enum va de subíndice de la lista. Esta prueba fija, par por par, qué
// posición literal le toca a cada valor, para que pasar a leer por valor no cambie ninguna
// etiqueta. Compara posiciones y no redacciones: lo que no puede ver es que alguien reordene las
// piezas de una lista en docs/14-copy-y-textos.md, porque la prueba y el código leen la misma
// lista (DT-365). La fila que una migración deja sin copia local pierde ese archivo de `copies`.

const ONE_TO_ONE = [...PAIRS, ...UNSEEN_PAIRS];
const JOBS = "src/modules/crm/jobs.ts";

/** Los valores de un par, en el orden de sus posiciones. */
function valuesOf(pair: { positions: Record<string, number> }): string[] {
  return Object.entries(pair.positions)
    .sort(([, a], [, b]) => a - b)
    .map(([value]) => value);
}

/** El texto sin espacios ni la coma final de un arreglo, para buscar un literal como esté partido. */
function squash(text: string): string {
  return text.replace(/\s+/g, "").replace(/,\]/g, "]");
}

function sourceOf(file: string): string {
  return squash(readFileSync(path.resolve(file), "utf8"));
}

function literal(values: readonly string[]): string {
  return squash(JSON.stringify(values));
}

const withCanonical = ONE_TO_ONE.filter(
  (pair): pair is LabelPair & { canonical: readonly string[] } => pair.canonical !== undefined,
);
const withLabel = ONE_TO_ONE.filter(
  (pair): pair is LabelPair & { label: (value: string) => string } => pair.label !== undefined,
);
const copies = ONE_TO_ONE.flatMap((pair) =>
  (pair.copies ?? []).map((file) => ({ file, code: pair.code, order: pair.order, pair })),
);

describe("la tabla de los pares", () => {
  it("trae los 85 pares que salen de las expresiones de la spec y 18 que esas expresiones no ven", () => {
    expect(PAIRS).toHaveLength(81);
    expect(UNEVEN_PAIRS.filter((pair) => pair.seen)).toHaveLength(4);
    expect(UNSEEN_PAIRS).toHaveLength(17);
    expect(UNEVEN_PAIRS.filter((pair) => !pair.seen)).toHaveLength(1);
  });

  it("no repite un par", () => {
    const keys = [
      ...ONE_TO_ONE.map((pair) => `${pair.code} × ${valuesOf(pair).join(",")}`),
      ...UNEVEN_PAIRS.map((pair) => `${pair.code} × ${pair.tuple.join(",")}`),
    ];
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it("dice de dónde sale el orden de cada par: una tupla exportada o una copia escrita en un archivo", () => {
    expect(
      ONE_TO_ONE.filter((pair) => !pair.canonical && !pair.copies?.length).map((pair) => pair.code),
    ).toEqual([]);
  });
});

describe("cada valor lee una posición literal de su lista", () => {
  it.each(ONE_TO_ONE)("$code trae una pieza por cada valor de $order", (pair) => {
    const positions = Object.values(pair.positions).sort((a, b) => a - b);
    expect(positions).toEqual(positions.map((_, index) => index));
    expect(tList(pair.code)).toHaveLength(positions.length);
  });

  it.each(withCanonical)("$order sigue en el orden que $code lee por posición", (pair) => {
    expect(Object.fromEntries(pair.canonical.map((value, index) => [value, index]))).toEqual(
      pair.positions,
    );
  });

  it.each(copies)("$file escribe el orden de $order que $code lee por posición", ({
    file,
    pair,
  }) => {
    expect(sourceOf(file)).toContain(literal(valuesOf(pair)));
  });

  it.each(
    withLabel,
  )("la etiqueta de cada valor de $order es la pieza de $code de su posición", (pair) => {
    const list: readonly string[] = tList(pair.code);
    const values = valuesOf(pair);
    expect(Object.fromEntries(values.map((value) => [value, pair.label(value)]))).toEqual(
      Object.fromEntries(values.map((value) => [value, list[pair.positions[value] ?? -1]])),
    );
  });

  // Lo que ve la persona cuando no hay etiqueta espera la decisión abierta 75: hasta entonces el
  // respaldo es el de hoy, el valor crudo. Un `Record` literal que herede de `Object.prototype`
  // devolvería una función para `constructor` o `toString` y el respaldo no entraría.
  it.each(
    withLabel,
  )("un valor que $order no trae sale tal cual, sin etiqueta de $code (decisión abierta 75)", (pair) => {
    const strangers = ["NO_EXISTE", "constructor", "toString", "hasOwnProperty", "__proto__"];
    expect(strangers.map((value) => pair.label(value))).toEqual(strangers);
  });
});

describe("los pares que no son uno a uno", () => {
  it.each(
    UNEVEN_PAIRS,
  )("$code trae $pieces piezas y $order de $file no tiene ese largo", (pair) => {
    expect(tList(pair.code)).toHaveLength(pair.pieces);
    expect(pair.tuple.length).not.toBe(pair.pieces);
    const source = sourceOf(pair.file);
    expect(source).toContain(literal(pair.tuple));
    expect(source).toContain(squash(pair.read));
    for (const [value, position] of Object.entries(pair.positions)) {
      expect(pair.tuple).toContain(value);
      expect(position).toBeLessThan(pair.pieces);
    }
  });

  it("donde la misma lista tiene un par uno a uno, cada valor lee la misma posición en los dos", () => {
    const shared = UNEVEN_PAIRS.flatMap((uneven) =>
      ONE_TO_ONE.filter((pair) => pair.code === uneven.code).map((pair) => ({ uneven, pair })),
    );
    expect(shared.map(({ uneven }) => `${uneven.code} × ${uneven.order}`)).toEqual([
      "T-791 × FINAL_STATES",
      "T-597 × STATUS_ORDER",
      "T-566 × CATEGORIES",
    ]);
    for (const { uneven, pair } of shared) {
      expect(pair.positions).toMatchObject(uneven.positions);
    }
  });
});

describe("el zip de crm/jobs.ts", () => {
  it("arma diez pares con siete órdenes propios", () => {
    const source = readFileSync(path.resolve(JOBS), "utf8");
    expect(source.match(/: zip\(/g)).toHaveLength(ZIP_PAIRS.length);
    expect(source.match(/^const [A-Z_]+ = \[/gm)).toHaveLength(
      ZIP_PAIRS.filter((pair) => pair.own).length,
    );
    expect(ZIP_PAIRS).toHaveLength(10);
    expect(ZIP_PAIRS.filter((pair) => pair.own)).toHaveLength(7);
  });

  it.each(ZIP_PAIRS)("$key empareja $order con $code, en el orden de la tabla", ({
    key,
    order,
    code,
    own,
  }) => {
    const source = sourceOf(JOBS);
    expect(source).toContain(squash(`${key}: zip(${order}, tList("${code}"))`));
    const uneven = UNEVEN_PAIRS.find((pair) => pair.code === code && pair.file === JOBS);
    const pair = ONE_TO_ONE.find((item) => item.code === code);
    const values = uneven ? [...uneven.tuple] : pair ? valuesOf(pair) : [];
    expect(values.length).toBeGreaterThan(0);
    if (own) {
      expect(source).toContain(`const${order}=${literal(values)}asconst;`);
    } else {
      // El orden es la tupla que exporta `people`: la fila de la tabla lo compara con ella.
      expect(pair?.canonical).toBeDefined();
      expect(source).not.toContain(`const${order}=`);
    }
  });
});
