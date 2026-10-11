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

/**
 * Cada escritura de filas de los archivos, con lo que escribe y su línea: la tabla que recibe
 * `.insert(` o, con `into ` delante, el nombre que sigue a `insert into` en SQL crudo, sin comillas y
 * con `<nombre>` donde el SQL lo arma (`into public.<table>`). Son las que cuenta `looseInserts`, una
 * por una: quien lleva una lista de excepciones la compara con esto.
 */
export function insertTargets(files: TextFile[]): { path: string; target: string; line: number }[] {
  const patterns: [RegExp, (written: string) => string][] = [
    [/\.insert\(\s*([A-Za-z0-9_$.]*)/g, (written) => written],
    [
      /\binsert\s+into\b[ \t]*((?:"[^"\n]*"|[^\s("])*)/gi,
      (written) => `into ${written.replaceAll('"', "").replace(/\$\{([^}]*)\}/g, "<$1>")}`,
    ],
  ];
  return files.flatMap((file) =>
    patterns
      .flatMap(([pattern, target]) =>
        [...file.text.matchAll(pattern)].map((match) => ({
          path: file.path,
          target: target(match[1] ?? ""),
          line: file.text.slice(0, match.index).split("\n").length,
        })),
      )
      .sort((a, b) => a.line - b.line),
  );
}

/**
 * Dónde escribe a mano un archivo una fila de una de `tables`: `.insert(tabla)` de Drizzle o `insert
 * into tabla` en SQL crudo, con su línea. Mira el nombre que el archivo le pasa a `insert`: no ve una
 * tabla importada con otro nombre ni un SQL que arma el nombre de la tabla.
 */
export function insertsInto(
  files: TextFile[],
  tables: readonly string[],
): { path: string; table: string; line: number }[] {
  const names = tables.join("|");
  const patterns = [
    new RegExp(`\\.insert\\(\\s*(${names})\\s*\\)`, "g"),
    new RegExp(`\\binsert\\s+into\\s+"?(${names})"?(?![A-Za-z0-9_])`, "gi"),
  ];
  return files.flatMap((file) =>
    patterns
      .flatMap((pattern) => [...file.text.matchAll(pattern)])
      .map((match) => ({
        path: file.path,
        table: (match[1] ?? "").toLowerCase(),
        line: file.text.slice(0, match.index).split("\n").length,
      }))
      .sort((a, b) => a.line - b.line),
  );
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

// Lo que fuerza un cruce, por el módulo de `tests/helpers` que lo exporta: `warmPool` abre las
// conexiones antes de lanzar, y los de candados retienen, ponen el orden o le preguntan a PostgreSQL
// quién hace cola. `deferred`, `backendPid`, `outcome` y el tipo `Held` salen del mismo módulo y no
// fuerzan nada. Un ayudante nuevo se suma acá: mientras no esté, el archivo que solo lo usa a él cae.
const CROSSING_HELPERS: [module: RegExp, names: ReadonlySet<string>][] = [
  [/(^|\/)helpers\/pool$/, new Set(["warmPool"])],
  [
    /(^|\/)helpers\/locks$/,
    new Set([
      "holdTransaction",
      "holdCommand",
      "firstThenSecond",
      "whileHeld",
      "heldThenSettled",
      "waitingOn",
      "waitingForLock",
    ]),
  ],
];

/** Los nombres locales con que el archivo importa algo que fuerza un cruce. */
function crossingHelperNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const from = statement.moduleSpecifier.text;
    const helpers = CROSSING_HELPERS.find(([module]) => module.test(from))?.[1];
    const bindings = statement.importClause?.namedBindings;
    if (!helpers || !bindings || !ts.isNamedImports(bindings)) {
      continue;
    }
    for (const element of bindings.elements) {
      if (helpers.has((element.propertyName ?? element.name).text)) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

/**
 * Si el archivo llama a algo que fuerza un cruce. Importarlo y no llamarlo no cuenta, ni nombrarlo en
 * un comentario. Lo que no se sigue (`import * as`, un import dinámico, el ayudante que se pasa sin
 * llamarlo) tampoco: cae hacia pedir una excepción.
 */
function callsCrossingHelper(source: ts.SourceFile): boolean {
  const names = crossingHelperNames(source);
  const calls = (node: ts.Node): boolean =>
    (ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      names.has(node.expression.text)) ||
    (ts.forEachChild(node, calls) ?? false);
  return names.size > 0 && calls(source);
}

/**
 * Las pruebas que nombran una simultaneidad en el título y viven en un archivo que no llama a
 * `warmPool` ni a un ayudante de candados, cada una con su archivo. Por archivo y sobre el título,
 * como la midió la spec: ni condena ni absuelve a una prueba, da un techo.
 */
export function unguardedConcurrencyTitles(files: TextFile[]): { path: string; title: string }[] {
  return files.flatMap((file) => {
    const source = parse(file);
    return callsCrossingHelper(source)
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
