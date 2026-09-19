// Lectura de docs/14-copy-y-textos.md y escritura de src/shared/copy/textos.generated.ts. Lo comparten
// `npm run copy:sync` y la prueba que vigila que el generado no se quede atrás del documento (ADR-079).

export const COPY_SOURCE = "docs/14-copy-y-textos.md";
export const COPY_TARGET = "src/shared/copy/textos.generated.ts";

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
export const textos = {
${body}
} as const;
`;
}
