import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countByKey,
  driftByKey,
  expectReasonedOnce,
  presence,
  sourceFiles,
  sourcePaths,
} from "../helpers/ratchet";

// El andamio que comparten los trinquetes (DT-400, ADR-129 regla 12). Cada trinquete prueba lo suyo
// en su archivo; acá queda lo que repetían, para que un cambio en el andamio caiga una vez y con su
// nombre, y no en cinco pruebas que vigilan otra cosa.

const REASON = "Es una razón escrita en una frase, con más de cuarenta letras y su punto.";

describe("la diferencia por clave entre lo hallado y lo listado", () => {
  it("lo que la lista no tiene sale en `unlisted`, lo que le sobra en `stale`, y las dos en orden", () => {
    expect(driftByKey({ b: 1, a: 1 }, {})).toEqual({ unlisted: ["a", "b"], stale: [] });
    expect(driftByKey({}, { b: 1, a: 1 })).toEqual({ unlisted: [], stale: ["a", "b"] });
    expect(driftByKey({ a: 1 }, { a: 1 })).toEqual({ unlisted: [], stale: [] });
    expect(driftByKey({ a: 1, b: 1 }, { b: 1, c: 1 })).toEqual({ unlisted: ["a"], stale: ["c"] });
  });

  it("cuenta por clave: un hallazgo de más no entra con la excepción del primero, y una excepción por más de lo que hay sobra", () => {
    expect(driftByKey({ a: 2 }, { a: 1 })).toEqual({ unlisted: ["a"], stale: [] });
    expect(driftByKey({ a: 1 }, { a: 2 })).toEqual({ unlisted: [], stale: ["a"] });
  });

  it("`countByKey` cuenta cada clave las veces que sale y `presence` una sola", () => {
    const found = [{ path: "a.ts" }, { path: "b.ts" }, { path: "a.ts" }];

    expect(countByKey(found, ({ path }) => path)).toEqual({ "a.ts": 2, "b.ts": 1 });
    expect(countByKey([], String)).toEqual({});
    expect(presence(["a.ts", "b.ts", "a.ts"])).toEqual({ "a.ts": 1, "b.ts": 1 });
    // Con `presence`, dos hallazgos de la misma clave entran con una excepción.
    expect(driftByKey(presence(["a.ts", "a.ts"]), presence(["a.ts"]))).toEqual({
      unlisted: [],
      stale: [],
    });
  });
});

describe("la razón de cada excepción", () => {
  const key = ({ path }: { path: string }) => path;

  it("pasa con cada excepción una sola vez y su razón en una frase, y con la lista vacía", () => {
    expectReasonedOnce([], key);
    expectReasonedOnce(
      [
        { path: "a.ts", reason: REASON },
        { path: "b.ts", reason: REASON },
      ],
      key,
    );
  });

  it.each([
    ["vacía", ""],
    ["corta", "Es corta."],
    ["sin mayúscula al empezar", REASON.toLowerCase()],
    ["sin punto al final", REASON.slice(0, -1)],
    ["partida en dos renglones", REASON.replace(", ", ",\n")],
  ])("cae con una razón %s", (_title, reason) => {
    expect(() => expectReasonedOnce([{ path: "a.ts", reason }], key)).toThrow();
  });

  it("cae con la misma clave dos veces, aunque cada razón esté bien", () => {
    const twice = [
      { path: "a.ts", reason: REASON },
      { path: "a.ts", reason: REASON },
    ];

    expect(() => expectReasonedOnce(twice, key)).toThrow();
  });
});

describe("el lector de una carpeta", () => {
  it("devuelve los archivos de código con su ruta desde la carpeta que le pasan, en orden y con los de sus subcarpetas, o los que cumplen el patrón que le digan", () => {
    const dir = mkdtempSync(join(tmpdir(), "casa-trinquete-"));
    try {
      mkdirSync(join(dir, "sub"));
      writeFileSync(join(dir, "b.test.ts"), "b");
      writeFileSync(join(dir, "a.ts"), "a");
      writeFileSync(join(dir, "sub", "c.tsx"), "c");
      writeFileSync(join(dir, "sub", "d.mjs"), "d");
      writeFileSync(join(dir, "datos.json"), "{}");
      writeFileSync(join(dir, "notas.md"), "#");

      expect(sourceFiles(dir)).toEqual([
        { path: `${dir}/a.ts`, text: "a" },
        { path: `${dir}/b.test.ts`, text: "b" },
        { path: `${dir}/sub/c.tsx`, text: "c" },
        { path: `${dir}/sub/d.mjs`, text: "d" },
      ]);
      expect(sourcePaths(dir)).toEqual(sourceFiles(dir).map(({ path }) => path));
      expect(sourceFiles(dir, /\.test\.ts$/)).toEqual([{ path: `${dir}/b.test.ts`, text: "b" }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
