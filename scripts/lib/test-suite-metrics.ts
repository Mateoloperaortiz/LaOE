import { posix } from "node:path";
import ts from "typescript";

// Las tres medidas de la base de pruebas que suma `npm run audit:metrics` (spec #244): cuánto del
// vaciado está escrito a mano, cuánta siembra no pasa por la fábrica y cuántas pruebas de
// simultaneidad no usan un ayudante que fuerce el cruce. Y una lectura que no es medida, la de las
// cargas de `src` que no nombran lo que toman (ADR-128 regla 5), que usa solo su trinquete.
// Solo leen texto: quien llama decide qué archivos les pasa.

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

/**
 * Cuántas escrituras de filas hay en los archivos: llamadas a `.insert(` y `insert into` en SQL crudo.
 * Cuenta lo que nombra `insertTargets`: la fila de las métricas y las listas del trinquete salen de
 * una sola lectura.
 */
export function looseInserts(files: TextFile[]): { calls: number; raw: number } {
  const targets = insertTargets(files);
  const raw = targets.filter(({ target }) => target.startsWith("into ")).length;
  return { calls: targets.length - raw, raw };
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

/** Una carga de un archivo de `src` que no nombra lo que toma. */
export interface UnnamedLoad {
  path: string;
  /**
   * `lectura` es un miembro leído sobre la carga, `(await import("…")).nombre`. `entero` es la carga
   * que no llega a un nombre: la que algo esparce, devuelve, recibe o guarda sin decir qué toma; el
   * `import * as` al que no se le lee ningún miembro por nombre, y el `export * from`.
   */
  form: "lectura" | "entero";
  /** El archivo de `src`, como lo escribe la prueba. */
  specifier: string;
}

/** Si lo que se carga es un archivo de `src`: va con el alias `@/` o con una ruta relativa que cae ahí. */
function pointsToSrc(from: string, specifier: string): boolean {
  if (specifier.startsWith("@/")) {
    return true;
  }
  return (
    specifier.startsWith(".") &&
    posix.normalize(posix.join(posix.dirname(from), specifier)).startsWith("src/")
  );
}

/**
 * Lo cargado, pasando por los paréntesis, un cambio de tipo y el `await`. Sirve solo para saber si
 * encima le leen un miembro, que sale siempre; para pasar, la carga va escrita tal cual
 * (`declaredFrom`).
 */
function loaded(load: ts.Expression): ts.Expression {
  let value = load;
  while (
    ts.isAwaitExpression(value.parent) ||
    ts.isParenthesizedExpression(value.parent) ||
    ts.isAsExpression(value.parent) ||
    ts.isSatisfiesExpression(value.parent) ||
    ts.isNonNullExpression(value.parent)
  ) {
    value = value.parent;
  }
  return value;
}

/**
 * La declaración `const … = await <expresión>`, si la expresión va sola. Con un paréntesis, un
 * `as`, un `satisfies` o un `!` entre la declaración y la carga, knip deja de seguirla.
 */
function declaredFrom(expression: ts.Expression): ts.VariableDeclaration | null {
  const awaited = expression.parent;
  if (!ts.isAwaitExpression(awaited)) {
    return null;
  }
  const declaration = awaited.parent;
  return ts.isVariableDeclaration(declaration) && declaration.initializer === awaited
    ? declaration
    : null;
}

/**
 * Qué hace con una carga guardada un nombre igual al de su variable: le lee un miembro por su
 * `nombre` o la desestructura; la usa de `tipo` (`typeof ruta`); la pasa entera como `argumento` de
 * una llamada; la usa `entera` de otra forma, o es `ajeno`, el nombre de un miembro o de otra
 * declaración (`otro.cargado`, `{ cargado: 1 }`), que no es la variable.
 */
type Use = "nombre" | "tipo" | "argumento" | "entera" | "ajeno";

function howUsed(use: ts.Identifier): Use {
  const parent = use.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === use) {
    return "nombre";
  }
  if (ts.isElementAccessExpression(parent) && parent.expression === use) {
    // `ruta["GET"]` nombra. `ruta[metodo]` no: con una clave que no es un texto escrito ahí, knip da
    // por usado todo el archivo, aunque al lado se lea otro miembro por nombre.
    return ts.isStringLiteralLike(parent.argumentExpression) ? "nombre" : "entera";
  }
  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === use &&
    ts.isObjectBindingPattern(parent.name)
  ) {
    // Con resto (`const { GET, ...otros } = ruta`) knip tampoco sigue.
    return parent.name.elements.some((element) => element.dotDotDotToken) ? "entera" : "nombre";
  }
  if (ts.isTypeQueryNode(parent)) {
    return "tipo";
  }
  if (ts.isExportSpecifier(parent)) {
    // `export { cargado }` y `export { cargado as otro }` la sacan entera. En `export { otro as
    // cargado }` y en un reexporte con `from`, el nombre no es la variable.
    const local = parent.propertyName ?? parent.name;
    return local === use && !parent.parent.parent.moduleSpecifier ? "entera" : "ajeno";
  }
  // `{ cargado }` la mete entera.
  if (ts.isShorthandPropertyAssignment(parent)) {
    return "entera";
  }
  const named = parent as { name?: ts.Node; propertyName?: ts.Node };
  if (named.name === use || named.propertyName === use) {
    return "ajeno";
  }
  return ts.isCallExpression(parent) && parent.arguments.includes(use) ? "argumento" : "entera";
}

/** Lo que hace con la variable cada nombre igual al suyo, en el bloque donde se declara. */
function usesOf(variable: ts.Identifier): Use[] {
  let scope: ts.Node = variable;
  while (!ts.isBlock(scope) && !ts.isSourceFile(scope)) {
    scope = scope.parent;
  }
  const uses: Use[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node !== variable && node.text === variable.text) {
      uses.push(howUsed(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return uses;
}

/** Si a la variable que guarda una carga solo se le leen miembros por nombre o se la desestructura. */
function readByNameOnly(variable: ts.Identifier): boolean {
  return usesOf(variable).every((use) => use !== "entera" && use !== "argumento");
}

/**
 * Si un `import * as` nombra lo que toma: se le lee al menos un miembro por nombre y, fuera de eso,
 * entero solo va como argumento de una llamada, que es como lo pide `vi.spyOn(espacio, "nombre")`.
 */
function namespaceReadByName(namespace: ts.Identifier): boolean {
  const uses = usesOf(namespace);
  return uses.includes("nombre") && !uses.includes("entera");
}

/** Si la carga es un elemento de `const [{ a }, { b }] = await Promise.all([…])` y el suyo nombra lo que toma. */
function namedInList(list: ts.ArrayLiteralExpression, load: ts.Expression): boolean {
  const call = list.parent;
  if (
    !ts.isCallExpression(call) ||
    call.arguments[0] !== list ||
    call.expression.getText() !== "Promise.all"
  ) {
    return false;
  }
  const declaration = declaredFrom(call);
  if (!declaration || !ts.isArrayBindingPattern(declaration.name)) {
    return false;
  }
  const element = declaration.name.elements[list.elements.indexOf(load)];
  return (
    element !== undefined &&
    ts.isBindingElement(element) &&
    !element.dotDotDotToken &&
    ts.isObjectBindingPattern(element.name)
  );
}

/** En cuál de las dos formas queda un `import("…")`, mirando qué se hace con lo que carga. */
function unnamedForm(load: ts.CallExpression): UnnamedLoad["form"] | null {
  const value = loaded(load);
  const holder = value.parent;
  if (
    (ts.isPropertyAccessExpression(holder) || ts.isElementAccessExpression(holder)) &&
    holder.expression === value
  ) {
    return "lectura";
  }
  const declaration = declaredFrom(load);
  if (declaration) {
    const named = ts.isIdentifier(declaration.name)
      ? readByNameOnly(declaration.name)
      : ts.isObjectBindingPattern(declaration.name);
    return named ? null : "entero";
  }
  if (ts.isArrayLiteralExpression(load.parent) && namedInList(load.parent, load)) {
    return null;
  }
  return "entero";
}

/** Si un `import` o un `export` estático toma el archivo sin nombrar nada de él. */
function takesWholeFile(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node)) {
    // `export * from "…"` y `export * as nombre from "…"`.
    return !node.exportClause || ts.isNamespaceExport(node.exportClause);
  }
  const bindings = node.importClause?.namedBindings;
  return (
    bindings !== undefined && ts.isNamespaceImport(bindings) && !namespaceReadByName(bindings.name)
  );
}

/** El archivo de `src` que una carga nombra con un texto, o nada si no cae en `src`. */
function srcSpecifier(from: string, specifier: ts.Expression | undefined): string | null {
  return specifier && ts.isStringLiteralLike(specifier) && pointsToSrc(from, specifier.text)
    ? specifier.text
    : null;
}

/**
 * Las cargas de un archivo de `src` que no nombran lo que toman (DT-384, ADR-128 regla 5). Deja pasar
 * solo las formas con las que knip sigue marcando un export sin uso del archivo, medidas con knip
 * 6.34 y un export sembrado por archivo:
 *
 * - `const { nombre } = await import("…")`, también con resto;
 * - la carga con `await` guardada en una variable a la que después solo se le leen miembros por
 *   nombre (`ruta.GET`, `ruta?.GET`, `ruta["GET"]`) o que se desestructura sin resto;
 * - la de una lista `const [{ a }, { b }] = await Promise.all([…])`;
 * - el `import * as` al que se le lee al menos un miembro por nombre, o que se desestructura sin
 *   resto, aunque además vaya entero como argumento de una llamada: `vi.spyOn(espacio, "nombre")`.
 *
 * Las tres primeras, escritas tal cual: `await import("…")` va solo a la derecha del `=`.
 * `vi.importActual` y el `importOriginal` de una fábrica no son un `import("…")` y no pasan por
 * acá; knip marca también con ellos.
 *
 * Lo demás sale. Con esto knip dejó de marcar el sembrado: un miembro leído sobre la carga (con
 * `await` o sin él, por punto, por corchetes o por `then`); la carga esparcida, devuelta por una
 * función, pasada como argumento (ella o su promesa), asignada a una variable ya declarada,
 * guardada sin `await` o suelta, que solo corre el archivo; la que lleva un paréntesis, un `as`, un
 * `satisfies` o un `!` entre la declaración y el `import("…")`; la variable que la guarda,
 * esparcida, pasada como argumento, leída con una clave que no es un texto (`ruta[metodo]`, aunque
 * al lado se lea otro miembro por nombre) o desestructurada con resto; el `import * as` sin ningún
 * miembro leído por nombre (solo de argumento, esparcido, guardado en otra variable o usado solo de
 * tipo), o con uno y además leído con una clave que no es un texto, guardado en otra variable o
 * desestructurado con resto; y el `export * from` de una prueba, con `as` o sin él. Sale además lo
 * que no se midió, y lo que knip sí sigue pero no nombra: la variable devuelta o exportada entera y
 * el `import * as` que, con un miembro leído, además se esparce o pasa por un `satisfies`. La regla
 * es nombrar.
 */
export function unnamedSourceLoads(files: TextFile[]): UnnamedLoad[] {
  const found: UnnamedLoad[] = [];
  for (const file of files) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = srcSpecifier(file.path, node.arguments[0]);
        const form = specifier === null ? null : unnamedForm(node);
        if (specifier !== null && form) {
          found.push({ path: file.path, form, specifier });
        }
      } else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = srcSpecifier(file.path, node.moduleSpecifier);
        if (specifier !== null && takesWholeFile(node)) {
          found.push({ path: file.path, form: "entero", specifier });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  return found;
}
