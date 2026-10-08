import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { textos } from "@/shared/copy/textos.generated";

// DT-122: el push de la respuesta a una solicitud salió con el marcador crudo porque el texto y el
// código que lo usa no nombraban igual la variable. `copy-format.test.ts` comprueba que cada marcador
// tenga una forma que `fillCopy` reconoce; esta prueba mira el otro lado: lee cada llamada `t("T-…",
// { … })` del código y compara las claves que pasa con los marcadores de ese texto. Una clave que el
// texto no trae (`decision` para `{decisión}`) o un marcador que la llamada no pasa dejan el marcador
// a la vista de quien lee.

const ROOT = process.cwd();
const SOURCES = ["src", "scripts"];
/** La misma forma de marcador que reemplaza `fillCopy`. */
const MARKER = /\{([a-zA-Zñáéíóú ]+)\}/g;

interface Mismatch {
  where: string;
  code: string;
  /** Marcadores del texto que la llamada no pasa. */
  missing: string[];
  /** Claves que la llamada pasa y el texto no trae. */
  extra: string[];
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".generated.ts") ? [path] : [];
  });
}

function markersOf(code: string): Set<string> | null {
  const entry = (textos as Record<string, { text: string } | undefined>)[code];
  if (!entry) {
    return null;
  }
  return new Set([...entry.text.matchAll(MARKER)].map(([, name = ""]) => name.trim()));
}

/** Las llamadas `t("T-…", { … })` del archivo: cuántas hay y cuáles no calzan con su texto. */
function callsIn(path: string): { checked: number; mismatches: Mismatch[] } {
  const text = readFileSync(path, "utf8");
  const mismatches: Mismatch[] = [];
  let checked = 0;
  if (!text.includes('"T-')) {
    return { checked, mismatches };
  }
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node: ts.Node): void => {
    ts.forEachChild(node, visit);
    if (
      !ts.isCallExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      node.expression.text !== "t"
    ) {
      return;
    }
    const [code, values] = node.arguments;
    if (
      !code ||
      !ts.isStringLiteralLike(code) ||
      !values ||
      !ts.isObjectLiteralExpression(values)
    ) {
      return;
    }
    const markers = markersOf(code.text);
    if (!markers) {
      return;
    }
    checked += 1;
    const keys = new Set<string>();
    // Con un spread o una clave calculada no se sabe qué más pasa la llamada: solo se miran las de más.
    let open = false;
    for (const property of values.properties) {
      const name = property.name;
      if (
        (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
        name &&
        (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
      ) {
        keys.add(name.text);
      } else {
        open = true;
      }
    }
    const extra = [...keys].filter((key) => !markers.has(key));
    const missing = open ? [] : [...markers].filter((marker) => !keys.has(marker));
    if (extra.length > 0 || missing.length > 0) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      mismatches.push({
        where: `${relative(ROOT, path)}:${line + 1}`,
        code: code.text,
        missing,
        extra,
      });
    }
  };
  visit(source);
  return { checked, mismatches };
}

describe("las variables que el código le pasa a cada texto", () => {
  it("cada llamada a t() pasa los marcadores de su texto, con el mismo nombre", () => {
    const results = SOURCES.flatMap((dir) => sourceFiles(join(ROOT, dir))).map(callsIn);
    const checked = results.reduce((sum, result) => sum + result.checked, 0);
    // Si el recorrido deja de encontrar llamadas, la prueba no puede pasar por vacía.
    expect(checked).toBeGreaterThan(200);
    expect(results.flatMap((result) => result.mismatches)).toEqual([]);
  });
});
