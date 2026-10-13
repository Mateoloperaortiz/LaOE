import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "../helpers/ratchet";

// El saneo de errores salió de `src/shared/log.ts` a su propio archivo (DT-312 inciso 2, ADR-129
// regla 8). Esta prueba lee `src` y fija el corte por sus tres bordes: el registro exporta solo el
// registro, el saneo no conoce al registro ni a la casa, y el saneo no exporta nada que no le pida
// código de producción. Lo que hace cada función lo fijan las demás pruebas `log-*`.

const root = fileURLToPath(new URL("../../", import.meta.url));
const LOG = "src/shared/log.ts";
const SANITIZER = "src/shared/lib/error-sanitizer.ts";
const SANITIZER_SPECIFIER = "@/shared/lib/error-sanitizer";

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

/** Los nombres que un archivo exporta donde los declara, que es como exportan estos dos. */
function exportedNames(source: string): string[] {
  const declared = source.matchAll(
    /^export (?:async )?(?:function|const|let|class|type|interface) (\w+)/gm,
  );
  return [...declared].map((match) => match[1] ?? "").sort();
}

/**
 * Un export que no está donde se declara el nombre: un `export { … }`, un `export *` o un
 * `export default`. `exportedNames` no los ve, así que ninguno de los dos archivos puede traer uno.
 */
const LOOSE_EXPORT = /^export (?:\*|\{|default)/m;

/** De dónde importa un archivo, sin repetir: con `from`, con `import(…)` o con un `import "…"` suelto. */
function importedFrom(source: string): string[] {
  const specifiers = source.matchAll(/(?:\bfrom|\bimport\(|^import)\s*["']([^"']+)["']/gm);
  return [...new Set([...specifiers].map((match) => match[1] ?? ""))].sort();
}

/** Lo que `source` le pide por nombre al saneo: con `import { … } from` o con `await import(…)`. */
function askedOfSanitizer(source: string): string[] {
  const asked = source.matchAll(/\{([^{}]*)\}\s*(?:from|=\s*await import\()\s*["']([^"']+)["']/g);
  return [...asked]
    .filter((match) => match[2] === SANITIZER_SPECIFIER)
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

describe("el registro y el saneo de errores viven cada uno en su archivo", () => {
  it("`src/shared/log.ts` exporta solo el registro", () => {
    expect(exportedNames(read(LOG))).toEqual(["logger"]);
    // Tampoco reexporta: lo que era suyo se pide donde vive.
    expect(read(LOG)).not.toMatch(LOOSE_EXPORT);
  });

  it("el saneo no importa el registro ni nada de la casa: solo pino, por su serializador de errores", () => {
    expect(importedFrom(read(SANITIZER))).toEqual(["pino"]);
  });

  it("el saneo exporta solo lo que le pide por nombre algún archivo de `src`", () => {
    const asked = new Set(
      sourceFiles("src")
        .filter(({ path }) => path !== SANITIZER)
        .flatMap(({ text }) => askedOfSanitizer(text)),
    );
    const exported = exportedNames(read(SANITIZER));
    expect(exported).toEqual([...asked].sort());
    // Exporta donde declara, como el registro: un `export { nombre }` suelto pasaría sin consumidor,
    // y a `npm run deadcode` le alcanza con que lo importe una prueba.
    expect(read(SANITIZER)).not.toMatch(LOOSE_EXPORT);
    // Los cinco que piden el pool, el poller, la reconciliación, la billetera y `onRequestError`, y
    // la copia imprimible; los demás son del registro.
    expect(exported).toEqual(
      expect.arrayContaining([
        "carriesQueryError",
        "errorCode",
        "markConnectionFailure",
        "printableError",
        "withoutQueryValues",
      ]),
    );
  });
});
