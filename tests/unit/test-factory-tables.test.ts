import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { insertsInto } from "../../scripts/lib/test-suite-metrics";

// La siembra de `person`, `permission`, `membership` y `term` pasa por la fábrica de
// `tests/factories`, que comparten integración y E2E (DT-013, ADR-124 regla 5). Una fila de esas
// tablas escrita a mano en una prueba puede armar un estado que ningún comando deja, y la prueba
// queda en verde sobre algo imposible. Por eso esta prueba lee el código.
//
// Es el primer corte: cuatro tablas. Las demás y el `insert into` de cualquier tabla son del
// trinquete general (#303). Mira el nombre que el archivo le pasa a `insert`, así que no ve una
// tabla importada con otro nombre ni un SQL que arma el nombre.

const FACTORY_TABLES = ["person", "permission", "membership", "term"];
const SEEDED = ["tests/integration", "tests/e2e", "tests/helpers"];

interface Exception {
  path: string;
  table: string;
  /** Cuántos insert sueltos de esa tabla quedan en el archivo. */
  inserts: number;
  /** Por qué no pasan por la fábrica, en una frase. */
  reason: string;
}

// Los únicos insert sueltos de las cuatro tablas. Antes de sumar uno acá, sembralo con la fábrica:
// la lista es para el estado que ningún comando produce y que la prueba arma a propósito.
const EXCEPTIONS: Exception[] = [
  {
    path: "tests/integration/schema-constraints.test.ts",
    table: "membership",
    inserts: 1,
    reason:
      "Es la segunda membresía de una misma persona, que la prueba espera ver rechazada por `membership_person_unique`: ningún comando llega a escribirla.",
  },
  {
    path: "tests/integration/schema-constraints.test.ts",
    table: "permission",
    inserts: 4,
    reason:
      "Son el permiso repetido, el de líder sin comité y el ADMIN con comité que la prueba espera ver rechazados por los índices únicos y por `permission_committee_scope`: la fábrica devuelve el permiso que ya está en vez de chocar.",
  },
  {
    path: "tests/integration/schema-constraints.test.ts",
    table: "person",
    inserts: 2,
    reason:
      "Es la mutación de un comando de prueba: tiene que ir por `ctx.tx` para afirmar que mutación, auditoría y evento se confirman y se deshacen en la misma transacción.",
  },
];

/** Los archivos TypeScript de una carpeta de pruebas: los casos, su preparación y sus ayudantes. */
function sources(dir: string) {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .sort()
    .map((file) => ({ path: `${dir}/${file}`, text: readFileSync(join(dir, file), "utf8") }));
}

const named = (insert: { path: string; table: string }) => `${insert.path} › ${insert.table}`;

/** Cuántos insert sueltos de cada tabla hay en cada archivo. */
function loose(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const insert of insertsInto(SEEDED.flatMap(sources), FACTORY_TABLES)) {
    counts[named(insert)] = (counts[named(insert)] ?? 0) + 1;
  }
  return counts;
}

describe("la siembra de person, permission, membership y term", () => {
  it("pasa por la fábrica: fuera de ella quedan solo los insert de la lista de excepciones, ni uno más ni uno menos", () => {
    expect(loose()).toEqual(
      Object.fromEntries(EXCEPTIONS.map((exception) => [named(exception), exception.inserts])),
    );
  });

  it("cada excepción está una vez y trae su razón en una frase", () => {
    expect(new Set(EXCEPTIONS.map(named)).size).toBe(EXCEPTIONS.length);
    for (const exception of EXCEPTIONS) {
      expect(exception.reason, named(exception)).toMatch(/^\p{Lu}[^\n]{40,}\.$/u);
    }
  });

  it("la fábrica es la que escribe las cuatro tablas", () => {
    const written = insertsInto(sources("tests/factories"), FACTORY_TABLES).map(
      (insert) => insert.table,
    );

    expect([...new Set(written)].sort()).toEqual([...FACTORY_TABLES].sort());
  });
});
