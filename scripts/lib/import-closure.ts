import { posix } from "node:path";
import ts from "typescript";
import { parse, type TextFile } from "./test-suite-metrics";

// La lectura de lo que un grupo de archivos carga al ejecutarse, siguiendo sus `import` (DT-396,
// ADR-129 regla 9). No es una medida de `npm run audit:metrics`: la usa solo
// `tests/unit/module-index-loads-without-next.test.ts`, para saber qué archivos de `src` carga la E2E
// por fuera del `index.ts` de un módulo, y por eso vive acá y no con las medidas de
// `scripts/lib/test-suite-metrics.ts`, de donde toma cómo se lee un archivo. Solo lee texto: quien
// llama decide qué archivos le pasa.
//
// Cuenta lo que queda después de compilar: el `import` y el `export … from` con algún nombre que no
// sea un tipo, el `import "…"` suelto, el `export * from` y el `import("…")` escrito con un texto. No
// cuenta el `import type`, el `export type … from` ni el `import { type A }` que solo trae tipos, que
// el compilador borra, ni un tipo escrito `import("…").Nombre`. Sí cuenta el `import` de un nombre
// que el archivo usa solo como tipo: para saber que se borra hay que resolver los nombres, y contar
// uno de más carga un archivo de más, que no esconde nada.

/** Una carga que la lectura no pudo llevar a un archivo. */
export interface UnreadImport {
  /** El archivo que la escribe. */
  path: string;
  /** Lo que carga, como va escrito; `import(…)` si no es un texto. */
  specifier: string;
}

export interface ImportClosure {
  /** Los archivos recorridos: las entradas y lo que cargan de entre los que se pueden recorrer. */
  walked: string[];
  /** Los archivos que cargan y no se recorren, por su ruta desde la raíz. */
  leaves: string[];
  /** Lo que no se pudo seguir: una ruta de la casa que no lleva a ningún archivo, o una carga armada. */
  unread: UnreadImport[];
}

/** Cómo termina la ruta de un archivo de código escrito sin su extensión, o con ella. */
const ENDINGS = ["", ".ts", ".tsx", ".mts", ".mjs", "/index.ts", "/index.tsx"];
/** Lo que se importa y no es código: no carga nada más. */
const DATA = /\.(?:json|css|svg|png|jpg|webp|txt|md)$/;

/** Si de esos nombres no queda ninguno al compilar: todos son tipos. */
function onlyTypes(names: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>): boolean {
  return names.length > 0 && names.every((name) => name.isTypeOnly);
}

/** Si el compilador borra ese `import`: es de tipos, entero o nombre por nombre. */
function erasedImport(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const { name, namedBindings } = clause;
  return !name && !!namedBindings && ts.isNamedImports(namedBindings)
    ? onlyTypes(namedBindings.elements)
    : false;
}

/** Si el compilador borra ese `export … from`. */
function erasedExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  const { exportClause } = node;
  return !!exportClause && ts.isNamedExports(exportClause) && onlyTypes(exportClause.elements);
}

/** Lo que un archivo carga al ejecutarse, como va escrito; nulo es una carga que no es un texto. */
function runtimeSpecifiers(file: TextFile): (string | null)[] {
  const found: (string | null)[] = [];
  const written = (node: ts.Expression) => (ts.isStringLiteralLike(node) ? node.text : null);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (!erasedImport(node.importClause)) found.push(written(node.moduleSpecifier));
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && !erasedExport(node)) found.push(written(node.moduleSpecifier));
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      found.push(argument ? written(argument) : null);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return found;
}

/** La ruta desde la raíz a la que apunta una carga de la casa; nulo si es un paquete o algo de Node. */
function localTarget(from: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (!specifier.startsWith(".")) return null;
  return posix.normalize(posix.join(posix.dirname(from), specifier));
}

/**
 * Lo que `entries` carga al ejecutarse. Sigue cada `import` de la casa, con `@/` o con una ruta
 * relativa: si lleva a uno de `files`, lo recorre también; si lleva a una de `leaves`, la anota y no
 * sigue por ahí; si no lleva a ninguno, queda en `unread`, igual que la carga que no es un texto.
 * Un paquete, un módulo de Node o un archivo de datos no se siguen. Las rutas van desde la raíz.
 */
export function importClosure(
  files: TextFile[],
  entries: string[],
  leaves: Iterable<string> = [],
): ImportClosure {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const known = new Set(leaves);
  const walked = new Set<string>();
  const reached = new Set<string>();
  const unread: UnreadImport[] = [];
  const queue = [...entries];
  for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
    if (walked.has(path)) continue;
    const file = byPath.get(path);
    if (!file) {
      unread.push({ path, specifier: path });
      continue;
    }
    walked.add(path);
    for (const specifier of runtimeSpecifiers(file)) {
      if (specifier === null) {
        unread.push({ path, specifier: "import(…)" });
        continue;
      }
      const target = localTarget(path, specifier);
      if (target === null || DATA.test(target)) continue;
      const candidates = ENDINGS.map((ending) => `${target}${ending}`);
      const next = candidates.find((candidate) => byPath.has(candidate));
      const leaf = candidates.find((candidate) => known.has(candidate));
      if (next) queue.push(next);
      else if (leaf) reached.add(leaf);
      else unread.push({ path, specifier });
    }
  }
  return { walked: [...walked].sort(), leaves: [...reached].sort(), unread };
}
