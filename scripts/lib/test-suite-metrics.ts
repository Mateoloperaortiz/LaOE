import ts from "typescript";

// Las tres medidas de la base de pruebas que suma `npm run audit:metrics` (spec #244): cuánto del
// vaciado está escrito a mano, cuánta siembra no pasa por la fábrica y cuántas pruebas de
// simultaneidad no usan un ayudante que fuerce el cruce. Solo leen texto: quien llama decide qué
// archivos les pasa.

interface TextFile {
  path: string;
  text: string;
}

const CONCURRENCY = /simultáne|a la vez|al mismo tiempo|concurren|en paralelo|carrera/iu;
// Por archivo y sobre el texto, como la midió la spec: ni condena ni absuelve a una prueba, da un techo.
const CROSSING_HELPERS = /warmPool|helpers\/locks/;
// Una palabra entera: `person_id`, `termId` y `long-term` no nombran a `person` ni a `term`.
const WORD = /(?<![A-Za-z0-9_-])[a-z][a-z0-9_]*(?![A-Za-z0-9_-])/g;

function parse(file: TextFile): ts.SourceFile {
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.ES2022, true);
}

/** El texto de cada cadena del código, con los tramos fijos de las plantillas; los imports no cuentan. */
function stringsOf(file: TextFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      return;
    }
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddleOrTemplateTail(node)
    ) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return found;
}

/** Las tablas que declaran los `schema.ts` de los módulos, por su nombre en PostgreSQL. */
export function schemaTables(files: TextFile[]): Set<string> {
  return new Set(
    files.flatMap((file) =>
      [...file.text.matchAll(/pgTable\(\s*"([a-z0-9_]+)"/g)].map((match) => match[1] ?? ""),
    ),
  );
}

/** Las tablas del esquema que el archivo nombra en una cadena, sea una lista o una consulta. */
export function tableNamesWritten(file: TextFile, tables: ReadonlySet<string>): string[] {
  const written = new Set<string>();
  for (const text of stringsOf(file)) {
    for (const [word] of text.matchAll(WORD)) {
      if (tables.has(word)) {
        written.add(word);
      }
    }
  }
  return [...written].sort();
}

/** Las escrituras de filas que hay en los archivos: llamadas a `.insert(` y `insert into` en SQL crudo. */
export function looseInserts(files: TextFile[]): { calls: number; raw: number } {
  const count = (pattern: RegExp) =>
    files.reduce((total, file) => total + (file.text.match(pattern)?.length ?? 0), 0);
  return { calls: count(/\.insert\(/g), raw: count(/\binsert\s+into\b/gi) };
}

/** `it` o `test`, solos o con lo que cuelgue de ellos: `it.each(casos)`, `test.each` con plantilla. */
function isTestCall(callee: ts.Expression): boolean {
  let root = callee;
  for (;;) {
    if (ts.isPropertyAccessExpression(root) || ts.isCallExpression(root)) {
      root = root.expression;
    } else if (ts.isTaggedTemplateExpression(root)) {
      root = root.tag;
    } else {
      return ts.isIdentifier(root) && (root.text === "it" || root.text === "test");
    }
  }
}

function testTitles(file: TextFile): string[] {
  const source = parse(file);
  const titles: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && isTestCall(node.expression)) {
      const [title] = node.arguments;
      if (title && ts.isStringLiteralLike(title)) {
        titles.push(title.text);
      } else if (title && ts.isTemplateExpression(title)) {
        titles.push(title.getText(source));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return titles;
}

/**
 * Las pruebas que nombran una simultaneidad en el título y viven en un archivo que no importa
 * `warmPool` ni los ayudantes de candados, y en cuántos archivos están.
 */
export function unguardedConcurrencyTests(files: TextFile[]): { tests: number; files: number } {
  const perFile = files
    .filter((file) => !CROSSING_HELPERS.test(file.text))
    .map((file) => testTitles(file).filter((title) => CONCURRENCY.test(title)).length)
    .filter((named) => named > 0);
  return { tests: perFile.reduce((total, named) => total + named, 0), files: perFile.length };
}
