import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import {
  looseInserts,
  schemaTables,
  tableNamesWritten,
  unguardedConcurrencyTests,
} from "./lib/test-suite-metrics";

// Línea base de la auditoría de código (docs/auditoria-codigo-2026-09-19.md, tramo V0). Solo lee: imprime
// una tabla Markdown con las métricas que cada tramo de refactor debe mover. Se corre al cerrar un tramo
// y la fila nueva se anota en ese documento.

const GENERATED = "src/shared/copy/textos.generated.ts";
const ACTION_HELPERS = ["requireAdmin", "text", "withQuery", "safeBack", "back", "single"];
const RAW_ELEMENTS = ["input", "select", "table", "button"];
// La base de pruebas (spec #244): dónde se vacía y dónde vive la fábrica que siembra.
const TEST_EMPTYING = "tests/integration/db.ts";
const TEST_FACTORY = "tests/integration/factories.ts";

interface SourceFile {
  path: string;
  text: string;
  lines: number;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|mts)$/.test(name) && full !== GENERATED) {
      out.push(full);
    }
  }
  return out;
}

function load(dir: string): SourceFile[] {
  return walk(dir)
    .sort()
    .map((path) => {
      const text = readFileSync(path, "utf8");
      return { path, text, lines: text.split("\n").length };
    });
}

function count(files: SourceFile[], pattern: RegExp): number {
  return files.reduce((total, file) => total + (file.text.match(pattern)?.length ?? 0), 0);
}

function complexityOf(node: ts.Node): number {
  let total = 1;
  const visit = (child: ts.Node) => {
    switch (child.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.CaseClause:
      case ts.SyntaxKind.CatchClause:
      case ts.SyntaxKind.ConditionalExpression:
        total += 1;
        break;
      case ts.SyntaxKind.BinaryExpression: {
        const operator = (child as ts.BinaryExpression).operatorToken.kind;
        if (
          operator === ts.SyntaxKind.AmpersandAmpersandToken ||
          operator === ts.SyntaxKind.BarBarToken ||
          operator === ts.SyntaxKind.QuestionQuestionToken
        ) {
          total += 1;
        }
        break;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return total;
}

interface FunctionStats {
  length: number;
  complexity: number;
}

interface Analysis {
  functions: FunctionStats[];
  /** Nombre de cada función declarada en el nivel superior → archivos que la declaran. */
  topLevelNames: Map<string, Set<string>>;
}

function analyze(files: SourceFile[]): Analysis {
  const functions: FunctionStats[] = [];
  const topLevelNames = new Map<string, Set<string>>();
  for (const file of files) {
    const source = ts.createSourceFile(
      file.path,
      file.text,
      ts.ScriptTarget.ES2022,
      true,
      file.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const lineOf = (position: number) => source.getLineAndCharacterOfPosition(position).line;
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        const owners = topLevelNames.get(statement.name.text) ?? new Set<string>();
        owners.add(file.path);
        topLevelNames.set(statement.name.text, owners);
      }
    }
    const visit = (node: ts.Node) => {
      const isFunction =
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node);
      if (isFunction && node.body) {
        functions.push({
          length: lineOf(node.end) - lineOf(node.getStart(source)) + 1,
          complexity: complexityOf(node.body),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { functions, topLevelNames };
}

function exportsOf(path: string): number {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
  );
  let total = 0;
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      total +=
        statement.exportClause && ts.isNamedExports(statement.exportClause)
          ? statement.exportClause.elements.length
          : 1;
    } else if (
      ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      total += ts.isVariableStatement(statement)
        ? statement.declarationList.declarations.length
        : 1;
    }
  }
  return total;
}

const src = load("src");
const scripts = load("scripts");
const app = src.filter((file) => file.path.startsWith("src/app/"));
const modules = src.filter((file) => file.path.startsWith("src/modules/"));
const clientFiles = src.filter((file) => /^\s*["']use client["']/.test(file.text));
const { functions, topLevelNames } = analyze([...src, ...scripts]);
const longer = (limit: number) => functions.filter((fn) => fn.length > limit).length;
const bigger = (limit: number) => [...src, ...scripts].filter((file) => file.lines > limit).length;
const helperCopies = ACTION_HELPERS.map((name) => {
  // El kit de `src/app/_lib` es la definición; se cuentan las copias fuera de él.
  const owners = [...(topLevelNames.get(name) ?? [])].filter(
    (path) => path.startsWith("src/app/") && !path.startsWith("src/app/_lib/"),
  );
  return `${name} ${owners.length}`;
}).join(" · ");

const integration = load("tests/integration");
const emptying = integration.find((file) => file.path === TEST_EMPTYING);
if (!emptying) {
  throw new Error(`No está ${TEST_EMPTYING}: el vaciado de la base de pruebas se mudó`);
}
const insertsInIntegration = looseInserts(integration.filter((file) => file.path !== TEST_FACTORY));
const insertsInE2e = looseInserts(load("tests/e2e"));
const unguarded = unguardedConcurrencyTests(
  integration.filter((file) => file.path.endsWith(".test.ts")),
);

const rows: [string, string | number][] = [
  [
    "Archivos y líneas en `src` (sin el catálogo de textos)",
    `${src.length} · ${src.reduce((n, f) => n + f.lines, 0)}`,
  ],
  [
    "Líneas en `src/app` · `src/modules`",
    `${app.reduce((n, f) => n + f.lines, 0)} · ${modules.reduce((n, f) => n + f.lines, 0)}`,
  ],
  [
    "Funciones de más de 100 · 200 · 300 líneas (`src` y `scripts`)",
    `${longer(100)} · ${longer(200)} · ${longer(300)}`,
  ],
  ["Funciones con complejidad mayor a 30", functions.filter((fn) => fn.complexity > 30).length],
  ["Archivos de más de 500 · 1000 líneas", `${bigger(500)} · ${bigger(1000)}`],
  [
    "Exports de `participation` · `people` · `crm` (`index.ts`)",
    ["participation", "people", "crm"]
      .map((name) => exportsOf(`src/modules/${name}/index.ts`))
      .join(" · "),
  ],
  [
    "Nombres de función de nivel superior declarados en 2 o más archivos de `src`",
    [...topLevelNames.values()].filter(
      (owners) => [...owners].filter((path) => path.startsWith("src/")).length >= 2,
    ).length,
  ],
  ["Copias locales de helpers de actions en `src/app`", helperCopies],
  ["`as unknown as` en `src`", count(src, /\bas unknown as\b/g)],
  [
    '`tList(` · accesos posicionales `[n] ?? ""` en `src`',
    `${count(src, /\btList\(/g)} · ${count(src, /\[\d+\]\s*\?\?\s*""/g)}`,
  ],
  [
    "Componentes cliente · los que importan `@/shared/copy`",
    `${clientFiles.length} · ${clientFiles.filter((file) => file.text.includes('"@/shared/copy"')).length}`,
  ],
  ["`throw new Error(` en `src`", count(src, /throw new Error\(/g)],
  ["`getDb()` en `src/modules`", count(modules, /\bgetDb\(\)/g)],
  [
    "Eventos de dominio: en el catálogo · todavía emitidos como cadena suelta",
    `${count(load("src/domain-events"), /\bdefineEvent\(/g)} · ${
      new Set(
        [...src, ...scripts].flatMap((file) =>
          [...file.text.matchAll(/\btype: "([a-z0-9-]+\.[a-z0-9.-]+)"/g)].map((match) => match[1]),
        ),
      ).size
    }`,
  ],
  [
    `Elementos crudos en \`src\` (${RAW_ELEMENTS.join(" · ")})`,
    RAW_ELEMENTS.map((tag) => count(src, new RegExp(`<${tag}[\\s>]`, "g"))).join(" · "),
  ],
  [
    `Tablas del esquema nombradas en el vaciado de pruebas (\`${TEST_EMPTYING}\`)`,
    tableNamesWritten(emptying, schemaTables(src)).length,
  ],
  [
    "Insert sueltos, `.insert(` · `insert into`: en `tests/integration` sin la fábrica · en `tests/e2e`",
    `${insertsInIntegration.calls} · ${insertsInIntegration.raw} · ${insertsInE2e.calls} · ${insertsInE2e.raw}`,
  ],
  [
    "Pruebas que nombran una simultaneidad en el título sin `warmPool` ni `helpers/locks` en su archivo · archivos",
    `${unguarded.tests} · ${unguarded.files}`,
  ],
];

process.stdout.write("| Métrica | Valor |\n| --- | --- |\n");
for (const [label, value] of rows) {
  process.stdout.write(`| ${label} | ${value} |\n`);
}
