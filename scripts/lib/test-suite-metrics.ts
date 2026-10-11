import ts from "typescript";

// Las tres medidas de la base de pruebas que suma `npm run audit:metrics` (spec #244): cuánto del
// vaciado está escrito a mano, cuánta siembra no pasa por la fábrica y cuántas pruebas de
// simultaneidad no usan un ayudante que fuerce el cruce. Solo leen texto: quien llama decide qué
// archivos les pasa.

interface TextFile {
  path: string;
  text: string;
}

// Las palabras con las que un título nombra una simultaneidad: las de la spec, más «al tiempo» y
// «simultáne» sin su tilde, que entraron con el trinquete (#301) sin mover la cuenta de ese día.
const CONCURRENCY =
  /simult[aá]ne|a la vez|al mismo tiempo|al tiempo|concurren|en paralelo|carrera/iu;
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

function testTitles(source: ts.SourceFile): string[] {
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
 * Si el archivo importa lo que fuerza un cruce: `warmPool`, con el nombre local que sea, o el módulo
 * de los ayudantes de candados (`tests/helpers/locks.ts`). Nombrarlos en un comentario no cuenta.
 */
function importsCrossingHelper(source: ts.SourceFile): boolean {
  return source.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      return false;
    }
    if (/(^|\/)helpers\/locks$/.test(statement.moduleSpecifier.text)) {
      return true;
    }
    const bindings = statement.importClause?.namedBindings;
    return (
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.some(
        (element) => (element.propertyName ?? element.name).text === "warmPool",
      )
    );
  });
}

/**
 * Las pruebas que nombran una simultaneidad en el título y viven en un archivo que no importa
 * `warmPool` ni los ayudantes de candados, cada una con su archivo. Por archivo y sobre el título,
 * como la midió la spec: ni condena ni absuelve a una prueba, da un techo.
 */
export function unguardedConcurrencyTitles(files: TextFile[]): { path: string; title: string }[] {
  return files.flatMap((file) => {
    const source = parse(file);
    return importsCrossingHelper(source)
      ? []
      : testTitles(source)
          .filter((title) => CONCURRENCY.test(title))
          .map((title) => ({ path: file.path, title }));
  });
}

/** Cuántas son y en cuántos archivos están: la fila de `npm run audit:metrics`. */
export function unguardedConcurrencyTests(files: TextFile[]): { tests: number; files: number } {
  const found = unguardedConcurrencyTitles(files);
  return { tests: found.length, files: new Set(found.map((test) => test.path)).size };
}
