import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
