import { readFileSync, writeFileSync } from "node:fs";

// Lee docs/14-copy-y-textos.md y genera src/shared/copy/textos.generated.ts.
// El código no inventa textos: cada cadena visible sale de ahí por su código T-…

const SOURCE = "docs/14-copy-y-textos.md";
const TARGET = "src/shared/copy/textos.generated.ts";

interface Entry {
  where: string;
  text: string;
  owner: string;
  status: string;
}

function cleanCell(cell: string): string {
  return cell.trim().replace(/\\\|/g, "|");
}

function parse(markdown: string): Record<string, Entry> {
  const entries: Record<string, Entry> = {};
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
      throw new Error(`Código repetido en ${SOURCE}: ${code}`);
    }
    entries[code] = { where, text, owner, status };
  }
  return entries;
}

const entries = parse(readFileSync(SOURCE, "utf8"));
const codes = Object.keys(entries).sort();
const body = codes
  .map((code) => {
    const entry = entries[code] as Entry;
    return `  ${JSON.stringify(code)}: {\n    where: ${JSON.stringify(entry.where)},\n    text: ${JSON.stringify(entry.text)},\n    owner: ${JSON.stringify(entry.owner)},\n    status: ${JSON.stringify(entry.status)},\n  },`;
  })
  .join("\n");

const output = `// Generado por scripts/copy-sync.ts desde ${SOURCE}. No editar a mano: corré npm run copy:sync.
export const textos = {
${body}
} as const;
`;

writeFileSync(TARGET, output);
process.stdout.write(`${codes.length} textos escritos en ${TARGET}\n`);
