import { readdirSync, readFileSync } from "node:fs";
import { expect } from "vitest";
import type { TextFile } from "../../scripts/lib/test-suite-metrics";

// El andamio que comparten los trinquetes de `tests/unit`: las pruebas que leen el código, cuentan lo
// que una regla no admite y lo comparan con una lista de excepciones, donde una excepción que sobra
// también las pone en rojo (ADR-124 regla 4; DT-400, ADR-129 regla 12). Acá vive lo que repetían: el
// lector de una carpeta, la cuenta y la diferencia por clave, y la aserción de la razón. Cada
// trinquete se queda con lo suyo: qué busca, la forma de su excepción y su lista, que sigue escrita
// en su archivo, junto a la regla que vigila.

export type { TextFile };

/** Los archivos de código: TypeScript y JavaScript, con sus variantes. */
const CODE_FILE = /\.[cm]?[jt]sx?$/;

/** Una razón en una frase: empieza con mayúscula, va en un renglón, pasa de cuarenta letras y termina en punto. */
const SENTENCE = /^\p{Lu}[^\n]{40,}\.$/u;

/** Las rutas, desde la raíz y en orden, de los archivos de una carpeta cuyo nombre cumple `pattern`: los de código si no se dice. */
export function sourcePaths(dir: string, pattern: RegExp = CODE_FILE): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => pattern.test(file))
    .sort()
    .map((file) => `${dir}/${file}`);
}

/** Esos mismos archivos, con su texto. */
export function sourceFiles(dir: string, pattern: RegExp = CODE_FILE): TextFile[] {
  return sourcePaths(dir, pattern).map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

/** Cuántas veces sale cada clave. */
export function countByKey<T>(
  items: readonly T[],
  key: (item: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const name = key(item);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

/** Cada clave una vez, salga las veces que salga: para el trinquete que mira si algo está, no cuántas veces. */
export function presence(keys: Iterable<string>): Record<string, number> {
  return Object.fromEntries([...new Set(keys)].map((key) => [key, 1]));
}

/**
 * La diferencia por clave entre lo hallado y lo listado: `unlisted` es lo que hay de más sobre lo que
 * la lista admite, y `stale` lo que la lista admite y ya no está. Una clave con dos hallazgos y una
 * excepción por uno sale en `unlisted`; con un hallazgo y una excepción por dos, en `stale`.
 */
export function driftByKey(
  found: Record<string, number>,
  listed: Record<string, number>,
): { unlisted: string[]; stale: string[] } {
  const more = (a: Record<string, number>, b: Record<string, number>) =>
    Object.keys(a)
      .filter((key) => (a[key] ?? 0) > (b[key] ?? 0))
      .sort();
  return { unlisted: more(found, listed), stale: more(listed, found) };
}

/** Cada excepción está una sola vez en la lista, por su clave, y trae su razón en una frase. */
export function expectReasonedOnce<T extends { reason: string }>(
  exceptions: readonly T[],
  key: (exception: T) => string,
): void {
  expect(new Set(exceptions.map(key)).size).toBe(exceptions.length);
  for (const exception of exceptions) {
    expect(exception.reason, key(exception)).toMatch(SENTENCE);
  }
}
