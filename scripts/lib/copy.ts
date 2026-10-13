import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { splitCopyList } from "@/shared/copy/format";

// Lectura de docs/14-copy-y-textos.md y escritura de los dos catálogos generados. Lo comparten
// `npm run copy:sync` y la prueba que vigila que lo generado no se quede atrás (ADR-079, ADR-081).

export const COPY_SOURCE = "docs/14-copy-y-textos.md";
export const COPY_TARGET = "src/shared/copy/textos.generated.ts";
export const CLIENT_COPY_TARGET = "src/shared/copy/textos.client.generated.ts";
const CLIENT_COPY_MODULE = '"@/shared/copy/client"';

export interface CopyEntry {
  where: string;
  text: string;
  owner: string;
  status: string;
}

function cleanCell(cell: string): string {
  return cell.trim().replace(/\\\|/g, "|");
}

export function parseCopy(markdown: string): Record<string, CopyEntry> {
  const entries: Record<string, CopyEntry> = {};
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("| T-")) {
      continue;
    }
    const cells = line
      .slice(1, line.endsWith("|") ? -1 : undefined)
      .split(/(?<!\\)\|/)
      .map(cleanCell);
    const [code, where, text, owner, status] = cells;
    if (!code || !where || text === undefined || !owner || !status) {
      throw new Error(`Fila de copy incompleta: ${line}`);
    }
    if (entries[code]) {
      throw new Error(`Código repetido en ${COPY_SOURCE}: ${code}`);
    }
    entries[code] = { where, text, owner, status };
  }
  return entries;
}

export function renderCopy(entries: Record<string, CopyEntry>): string {
  const body = Object.keys(entries)
    .sort()
    .map((code) => {
      const entry = entries[code] as CopyEntry;
      return `  ${JSON.stringify(code)}: {\n    where: ${JSON.stringify(entry.where)},\n    text: ${JSON.stringify(entry.text)},\n    owner: ${JSON.stringify(entry.owner)},\n    status: ${JSON.stringify(entry.status)},\n  },`;
    })
    .join("\n");
  return `// Generado por scripts/copy-sync.ts desde ${COPY_SOURCE}. No editar a mano: corré npm run copy:sync.
// Catálogo completo, con sus metadatos editoriales: solo servidor (ADR-081).
import "server-only";

export const textos = {
${body}
} as const;
`;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Códigos que necesita el navegador: todo `T-…` escrito como literal en un archivo que importa
 * `@/shared/copy/client`. Sobra alguno de vez en cuando (un literal que no es una llamada), nunca falta.
 */
export function collectClientCodes(root = "src"): string[] {
  const codes = new Set<string>();
  for (const file of sourceFiles(root)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(CLIENT_COPY_MODULE)) {
      continue;
    }
    for (const match of text.matchAll(/["'`](T-\d+)["'`]/g)) {
      codes.add(match[1] as string);
    }
  }
  return [...codes].sort();
}

/** Subconjunto para el navegador: solo el texto, sin dónde, dueño ni estado. */
export function clientCopyOf(
  entries: Record<string, CopyEntry>,
  codes: readonly string[],
): Record<string, string> {
  const subset: Record<string, string> = {};
  for (const code of codes) {
    const entry = entries[code];
    if (!entry) {
      throw new Error(`Un archivo de cliente usa ${code}, que no está en ${COPY_SOURCE}`);
    }
    subset[code] = entry.text;
  }
  return subset;
}

export function renderClientCopy(subset: Record<string, string>): string {
  const body = Object.keys(subset)
    .sort()
    .map((code) => `  ${JSON.stringify(code)}: ${JSON.stringify(subset[code])},`)
    .join("\n");
  return `// Generado por scripts/copy-sync.ts: los textos que usan los archivos que importan @/shared/copy/client.
// No editar a mano: corré npm run copy:sync.
export const textosCliente = {
${body}
} as const;
`;
}

/**
 * Los textos del catálogo generado, por código, leídos de su fuente: el archivo lleva `server-only`
 * y un script no lo puede importar. Lanza si lo que le pasan no trae el catálogo.
 */
export function generatedTexts(source: string): Record<string, string> {
  const file = ts.createSourceFile(COPY_TARGET, source, ts.ScriptTarget.ES2022, false);
  for (const statement of file.statements) {
    const [declaration] = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
      : [];
    let catalog = declaration?.initializer;
    while (catalog && (ts.isAsExpression(catalog) || ts.isSatisfiesExpression(catalog))) {
      catalog = catalog.expression;
    }
    if (
      !declaration ||
      !ts.isIdentifier(declaration.name) ||
      declaration.name.text !== "textos" ||
      !catalog ||
      !ts.isObjectLiteralExpression(catalog)
    ) {
      continue;
    }
    const texts: Record<string, string> = {};
    for (const entry of catalog.properties) {
      if (
        !ts.isPropertyAssignment(entry) ||
        !ts.isStringLiteralLike(entry.name) ||
        !ts.isObjectLiteralExpression(entry.initializer)
      ) {
        throw new Error(`${COPY_TARGET} trae una entrada que no se pudo leer`);
      }
      const text = entry.initializer.properties.find(
        (property): property is ts.PropertyAssignment =>
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === "text",
      );
      if (!text || !ts.isStringLiteralLike(text.initializer)) {
        throw new Error(`${COPY_TARGET} trae ${entry.name.text} sin su texto`);
      }
      texts[entry.name.text] = text.initializer.text;
    }
    return texts;
  }
  throw new Error(`${COPY_TARGET} no trae el catálogo \`textos\``);
}

/**
 * Los códigos cuyo texto trae las mismas piezas que antes en otro orden (DT-365, ADR-128 regla 9).
 * El código lee cada pieza de una lista por su posición: `tLabels` y la tabla de pares comparan
 * largos y posiciones, no redacciones, así que una lista reordenada le cambia la etiqueta a cada
 * valor sin que nada falle. No ve el reorden que además cambia una redacción o suma una pieza.
 */
export function reorderedLists(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(after)
    .filter((code) => {
      const previousPieces = splitCopyList(before[code] ?? "");
      const currentPieces = splitCopyList(after[code] ?? "");
      if (
        previousPieces.length !== currentPieces.length ||
        previousPieces.every((piece, index) => piece === currentPieces[index])
      ) {
        return false;
      }
      const sorted = [...currentPieces].sort();
      return [...previousPieces].sort().every((piece, index) => piece === sorted[index]);
    })
    .sort();
}

/** La variable de entorno con la que se confirma un reorden: los códigos, separados por comas. */
export const REORDER_CONFIRMATION = "COPY_SYNC_REORDERED";

export interface CopySync {
  /** Las listas reordenadas que nadie confirmó. Con una sola no se escribe ningún generado. */
  reordered: string[];
  /** Por qué no se pudo leer el generado anterior; ahí el orden no se comparó. Nulo si se leyó. */
  unreadReason: string | null;
  /** Cuántos textos trae el inventario. */
  totalCount: number;
  /** Cuántos de esos quedaron en el subconjunto de cliente; cero si no se escribió nada. */
  clientCount: number;
}

/**
 * Lo que hace `npm run copy:sync`: lee el inventario y escribe los dos generados, salvo que una lista
 * traiga las mismas piezas que en el generado anterior en otro orden y nadie lo haya confirmado.
 * `confirmed` es el valor de `COPY_SYNC_REORDERED`: los códigos confirmados, separados por comas.
 */
export function syncCopy(
  options: { root?: string; confirmed?: string | undefined } = {},
): CopySync {
  const root = options.root ?? ".";
  const entries = parseCopy(readFileSync(join(root, COPY_SOURCE), "utf8"));
  const totalCount = Object.keys(entries).length;
  let before: Record<string, string> = {};
  let unreadReason: string | null = null;
  try {
    before = generatedTexts(readFileSync(join(root, COPY_TARGET), "utf8"));
  } catch (error) {
    unreadReason = error instanceof Error ? error.message : String(error);
  }
  const confirmed = new Set((options.confirmed ?? "").split(",").map((code) => code.trim()));
  const after = Object.fromEntries(
    Object.entries(entries).map(([code, entry]) => [code, entry.text]),
  );
  const reordered = reorderedLists(before, after).filter((code) => !confirmed.has(code));
  if (reordered.length > 0) {
    return { reordered, unreadReason, totalCount, clientCount: 0 };
  }
  writeFileSync(join(root, COPY_TARGET), renderCopy(entries));
  const clientCopy = clientCopyOf(entries, collectClientCodes(join(root, "src")));
  writeFileSync(join(root, CLIENT_COPY_TARGET), renderClientCopy(clientCopy));
  return { reordered, unreadReason, totalCount, clientCount: Object.keys(clientCopy).length };
}

/** Lo que `copy:sync` dice y con qué código termina: uno distinto de cero si no escribió nada. */
export function copySyncReport(result: CopySync): { code: 0 | 1; out: string; err: string } {
  if (result.reordered.length > 0) {
    const codes = result.reordered;
    return {
      code: 1,
      out: "",
      err: [
        `copy:sync no escribió nada. En ${COPY_SOURCE} hay listas con las mismas piezas que antes en otro orden: ${codes.join(", ")}.`,
        "El código lee cada pieza por su posición: con otro orden, cada valor pasa a mostrar la etiqueta de otro.",
        "Si el orden nuevo es a propósito, revisá el enum que lee cada lista y confirmalo:",
        `  ${REORDER_CONFIRMATION}=${codes.join(",")} npm run copy:sync`,
        "",
      ].join("\n"),
    };
  }
  return {
    code: 0,
    out: `${result.totalCount} textos en ${COPY_TARGET}; ${result.clientCount} en ${CLIENT_COPY_TARGET}\n`,
    err: result.unreadReason
      ? `copy:sync no pudo leer el generado anterior (${result.unreadReason}): no comparó el orden de las listas con el de antes.\n`
      : "",
  };
}
