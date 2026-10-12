import ts from "typescript";

// Las lecturas por posición de una lista del catálogo de textos (spec #242, ADR-126 regla 11): la
// etiqueta de un valor de un enum se lee con `tLabels(código, ENUM)[valor]`, y esto encuentra las
// formas viejas, que emparejan dos secuencias por su posición. Lo comparten la prueba
// `tests/unit/label-positions.test.ts`, que las compara con su lista de excepciones, y la fila de
// `npm run audit:metrics`. Solo lee texto, archivo por archivo y sin tipos: quien llama decide qué
// archivos le pasa.
//
// Qué es una lista del catálogo, para lo que sigue: una llamada a `tList(…)`, lo que sale de ella con
// `map`, `slice` o `filter`, una variable del archivo que guarda una de esas, o la propiedad de un
// objeto literal del archivo que la guarda. Una lista que llega por parámetro o por props no se sigue.

interface TextFile {
  path: string;
  text: string;
}

/**
 * - `indexOf`: el subíndice trae un `indexOf` o un `findIndex` (`lista[ENUM.indexOf(valor)]`).
 * - `traversal`: el subíndice es el índice de un recorrido (`ENUM.map((valor, index) => lista[index])`).
 * - `storedIndex`: el subíndice sale de una constante o de una función que guarda el `indexOf`.
 * - `zip`: una función recibe la lista junto con otro argumento y la empareja ella.
 * - `positionConstant`: el subíndice sale de una constante que guarda a mano la posición de cada valor.
 * - `computedIndex`: cualquier otro subíndice que no sea un número escrito, sobre una lista del catálogo.
 * - `recordByNumber`: un número escrito de subíndice de un `Record` de `tLabels`, que da `undefined`.
 */
export const POSITIONAL_FORMS = [
  "indexOf",
  "traversal",
  "storedIndex",
  "zip",
  "positionConstant",
  "computedIndex",
  "recordByNumber",
] as const;
export type PositionalForm = (typeof POSITIONAL_FORMS)[number];

export interface PositionalRead {
  path: string;
  line: number;
  form: PositionalForm;
  /** La expresión, sin espacios ni comas finales: es lo que nombra una excepción. */
  read: string;
}

const SEARCHES = new Set(["indexOf", "lastIndexOf", "findIndex", "findLastIndex"]);
const ITERATIONS = new Set([
  "map",
  "flatMap",
  "forEach",
  "filter",
  "some",
  "every",
  "find",
  "findLast",
]);
const FOLDS = new Set(["reduce", "reduceRight"]);
const LIST_METHODS = new Set(["map", "slice", "filter"]);
/** Las funciones del catálogo: reciben una lista o un código y no emparejan por su cuenta. */
const CATALOG = new Set(["t", "tList", "tLabels", "pairCopyLabels", "labelsFromProps"]);
const RECORDS = new Set(["tLabels", "labelsFromProps"]);
/** Hasta dónde se sigue una variable que guarda otra. */
const DEPTH = 4;

type Origin = "literal" | "search" | "stored" | "traversal" | "positions" | "param" | "other";

interface Trace {
  origins: Set<Origin>;
  /** De qué lista se buscó la posición, por cada `indexOf` que se pudo seguir. */
  receivers: string[];
  params: ts.ParameterDeclaration[];
}

function compact(text: string): string {
  return text.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isFunction(node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

/** El nodo que declara `name` dentro de un patrón: el dueño si es el nombre a secas, o su pieza. */
function bound(pattern: ts.BindingName, name: string, owner: ts.Node): ts.Node | undefined {
  if (ts.isIdentifier(pattern)) {
    return pattern.text === name ? owner : undefined;
  }
  for (const element of pattern.elements) {
    if (ts.isBindingElement(element)) {
      const found = bound(element.name, name, element);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function declaredIn(list: ts.VariableDeclarationList, name: string): ts.Node | undefined {
  for (const declaration of list.declarations) {
    const found = bound(declaration.name, name, declaration);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function importedAs(statement: ts.ImportDeclaration, name: string): ts.Node | undefined {
  const clause = statement.importClause;
  if (clause?.name?.text === name) {
    return clause;
  }
  const bindings = clause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    return bindings.elements.find((element) => element.name.text === name);
  }
  return bindings && bindings.name.text === name ? bindings : undefined;
}

/**
 * Dónde se declara un nombre, subiendo por los ámbitos que lo encierran: un parámetro, una variable,
 * una función o un import. Sin tipos: lo que no se declara en el archivo no se encuentra.
 */
function declarationOf(identifier: ts.Identifier): ts.Node | undefined {
  const name = identifier.text;
  for (let scope: ts.Node | undefined = identifier.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope)) {
      for (const parameter of scope.parameters) {
        const found = bound(parameter.name, name, parameter);
        if (found) {
          return found;
        }
      }
    }
    if (
      (ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) &&
      scope.initializer &&
      ts.isVariableDeclarationList(scope.initializer)
    ) {
      const found = declaredIn(scope.initializer, name);
      if (found) {
        return found;
      }
    }
    if (ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isCaseOrDefaultClause(scope)) {
      for (const statement of scope.statements) {
        let found: ts.Node | undefined;
        if (ts.isVariableStatement(statement)) {
          found = declaredIn(statement.declarationList, name);
        } else if (ts.isFunctionDeclaration(statement)) {
          found = statement.name?.text === name ? statement : undefined;
        } else if (ts.isImportDeclaration(statement)) {
          found = importedAs(statement, name);
        }
        if (found) {
          return found;
        }
      }
    }
  }
  return undefined;
}

/** El índice que una iteración le pasa a su callback, el contador de un `for` o el de `.entries()`. */
function isTraversalIndex(declaration: ts.Node): boolean {
  if (ts.isParameter(declaration)) {
    const callback = declaration.parent;
    const call = callback.parent;
    if (!isFunction(callback) || !ts.isCallExpression(call)) {
      return false;
    }
    const position = callback.parameters.indexOf(declaration);
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee)) {
      return false;
    }
    const method = callee.name.text;
    if (method === "from") {
      return call.arguments[1] === callback && position === 1;
    }
    return (
      call.arguments[0] === callback &&
      ((ITERATIONS.has(method) && position === 1) || (FOLDS.has(method) && position === 2))
    );
  }
  if (ts.isVariableDeclaration(declaration)) {
    return ts.isForStatement(declaration.parent.parent);
  }
  if (ts.isBindingElement(declaration) && ts.isArrayBindingPattern(declaration.parent)) {
    const loop = declaration.parent.parent.parent.parent;
    return (
      declaration.parent.elements[0] === declaration &&
      ts.isForOfStatement(loop) &&
      ts.isCallExpression(loop.expression) &&
      ts.isPropertyAccessExpression(loop.expression.expression) &&
      loop.expression.expression.name.text === "entries"
    );
  }
  return false;
}

function functionOf(
  declaration: ts.Node | undefined,
): ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | undefined {
  if (!declaration) {
    return undefined;
  }
  if (ts.isFunctionDeclaration(declaration)) {
    return declaration;
  }
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    const initializer = unwrap(declaration.initializer);
    return isFunction(initializer) ? initializer : undefined;
  }
  return undefined;
}

/** Lo que devuelve una función: su cuerpo si es una expresión, o lo que sigue a cada `return`. */
function returnsOf(fn: ts.FunctionLikeDeclaration): ts.Expression[] {
  if (!fn.body) {
    return [];
  }
  if (!ts.isBlock(fn.body)) {
    return [fn.body];
  }
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression) {
      found.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return found;
}

/** Una constante que guarda a mano la posición de cada valor: un objeto literal de números. */
function keepsPositions(expression: ts.Expression): boolean {
  const target = unwrap(expression);
  if (!ts.isIdentifier(target)) {
    return false;
  }
  const declaration = declarationOf(target);
  if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer) {
    return false;
  }
  const initializer = unwrap(declaration.initializer);
  return (
    ts.isObjectLiteralExpression(initializer) &&
    initializer.properties.length > 0 &&
    initializer.properties.every(
      (property) => ts.isPropertyAssignment(property) && ts.isNumericLiteral(property.initializer),
    )
  );
}

/** De dónde sale un subíndice. Un número escrito, o una condición que elige entre números, es `literal`. */
function originsOf(
  expression: ts.Expression,
  source: ts.SourceFile,
  depth = 0,
  trace: Trace = { origins: new Set(), receivers: [], params: [] },
): Trace {
  const node = unwrap(expression);
  const again = (inner: ts.Expression) => originsOf(inner, source, depth, trace);
  if (ts.isNumericLiteral(node)) {
    trace.origins.add("literal");
  } else if (ts.isPrefixUnaryExpression(node)) {
    again(node.operand);
  } else if (ts.isConditionalExpression(node)) {
    again(node.whenTrue);
    again(node.whenFalse);
  } else if (ts.isBinaryExpression(node)) {
    again(node.left);
    again(node.right);
  } else if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isPropertyAccessExpression(callee) && SEARCHES.has(callee.name.text)) {
      trace.origins.add("search");
      trace.receivers.push(compact(callee.expression.getText(source)));
    } else {
      const fn = ts.isIdentifier(callee) ? functionOf(declarationOf(callee)) : undefined;
      const returned =
        fn && depth < DEPTH
          ? returnsOf(fn).map((value) => originsOf(value, source, depth + 1).origins)
          : [];
      if (returned.some((origins) => origins.has("search") || origins.has("stored"))) {
        trace.origins.add("stored");
        trace.receivers.push("?");
      } else {
        trace.origins.add("other");
      }
    }
  } else if (ts.isElementAccessExpression(node)) {
    trace.origins.add(keepsPositions(node.expression) ? "positions" : "other");
  } else if (ts.isIdentifier(node)) {
    const declaration = declarationOf(node);
    if (declaration && isTraversalIndex(declaration)) {
      trace.origins.add("traversal");
    } else if (declaration && ts.isParameter(declaration)) {
      trace.origins.add("param");
      trace.params.push(declaration);
    } else if (
      declaration &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      !isFunction(unwrap(declaration.initializer)) &&
      depth < DEPTH
    ) {
      const inner = originsOf(declaration.initializer, source, depth + 1);
      if (inner.origins.has("search") || inner.origins.has("stored")) {
        trace.origins.add("stored");
        trace.receivers.push(...inner.receivers);
      } else {
        for (const origin of inner.origins) {
          trace.origins.add(origin);
        }
        trace.params.push(...inner.params);
      }
    } else {
      trace.origins.add("other");
    }
  } else {
    trace.origins.add("other");
  }
  return trace;
}

function called(expression: ts.Expression, names: ReadonlySet<string>): boolean {
  const node = unwrap(expression);
  return (
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)
  );
}

/** Si la expresión es una lista del catálogo de textos, hasta donde se puede seguir en el archivo. */
function isLabelList(expression: ts.Expression, depth = 0): boolean {
  const node = unwrap(expression);
  if (depth > DEPTH) {
    return false;
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
      return callee.text === "tList";
    }
    return (
      ts.isPropertyAccessExpression(callee) &&
      LIST_METHODS.has(callee.name.text) &&
      isLabelList(callee.expression, depth)
    );
  }
  if (ts.isConditionalExpression(node)) {
    return isLabelList(node.whenTrue, depth) || isLabelList(node.whenFalse, depth);
  }
  if (ts.isBinaryExpression(node)) {
    return isLabelList(node.left, depth) || isLabelList(node.right, depth);
  }
  if (ts.isIdentifier(node)) {
    const declaration = declarationOf(node);
    return (
      !!declaration &&
      ts.isVariableDeclaration(declaration) &&
      !!declaration.initializer &&
      isLabelList(declaration.initializer, depth + 1)
    );
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const declaration = declarationOf(node.expression);
    const holder =
      declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
        ? unwrap(declaration.initializer)
        : undefined;
    if (!holder || !ts.isObjectLiteralExpression(holder)) {
      return false;
    }
    return holder.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
        property.name.text === node.name.text &&
        isLabelList(property.initializer, depth + 1),
    );
  }
  return false;
}

/** Si la expresión es un `Record` de `tLabels`, o la variable del archivo que lo guarda. */
function isLabelRecord(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  if (called(node, RECORDS)) {
    return true;
  }
  if (!ts.isIdentifier(node)) {
    return false;
  }
  const declaration = declarationOf(node);
  return (
    !!declaration &&
    ts.isVariableDeclaration(declaration) &&
    !!declaration.initializer &&
    called(declaration.initializer, RECORDS)
  );
}

/** La forma de un subíndice que no es un número escrito, por lo más grave que traiga. */
function formOf(origins: ReadonlySet<Origin>): PositionalForm {
  if (origins.has("search")) {
    return "indexOf";
  }
  if (origins.has("stored")) {
    return "storedIndex";
  }
  if (origins.has("positions")) {
    return "positionConstant";
  }
  return origins.has("traversal") ? "traversal" : "computedIndex";
}

function onlyLiteral(origins: ReadonlySet<Origin>): boolean {
  return origins.size === 1 && origins.has("literal");
}

function readsIn(file: TextFile): PositionalRead[] {
  const source = ts.createSourceFile(
    file.path,
    file.text,
    ts.ScriptTarget.ES2022,
    true,
    file.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: PositionalRead[] = [];
  const report = (node: ts.Node, form: PositionalForm) => {
    found.push({
      path: file.path,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      form,
      read: compact(node.getText(source)),
    });
  };
  const calls: ts.CallExpression[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      calls.push(node);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  /**
   * Un ayudante que recibe la posición por parámetro (`const label = (index: number) => lista[index]`)
   * no empareja nada mientras sus llamadas le pasen un número escrito. Se mira cada llamada: la que le
   * pasa otra cosa cae ahí, con su forma. Si no se puede seguir (sale del archivo, no tiene nombre),
   * cae la lectura.
   */
  const throughHelper = (
    access: ts.ElementAccessExpression,
    parameter: ts.ParameterDeclaration,
  ) => {
    const helper = parameter.parent;
    const named = ts.isFunctionDeclaration(helper)
      ? helper
      : isFunction(helper) && ts.isVariableDeclaration(helper.parent)
        ? helper.parent
        : undefined;
    const statement = named && ts.isVariableDeclaration(named) ? named.parent.parent : named;
    const exported =
      !!statement &&
      ts.canHaveModifiers(statement) &&
      !!ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!named || exported) {
      report(access, "computedIndex");
      return;
    }
    const position = helper.parameters.indexOf(parameter);
    for (const call of calls) {
      const argument = call.arguments[position];
      if (
        argument &&
        ts.isIdentifier(call.expression) &&
        declarationOf(call.expression) === named
      ) {
        const { origins } = originsOf(argument, source);
        if (!onlyLiteral(origins)) {
          report(call, formOf(origins));
        }
      }
    }
  };

  const visit = (node: ts.Node) => {
    ts.forEachChild(node, visit);
    if (ts.isElementAccessExpression(node)) {
      const { origins, receivers, params } = originsOf(node.argumentExpression, source);
      const list = isLabelList(node.expression);
      if (onlyLiteral(origins)) {
        if (isLabelRecord(node.expression)) {
          report(node, "recordByNumber");
        }
        return;
      }
      const form = formOf(origins);
      if (form === "indexOf" || form === "storedIndex") {
        // Buscar una posición en una lista y leer esa misma lista no empareja dos secuencias.
        const target = compact(node.expression.getText(source));
        if (!receivers.every((receiver) => receiver === target)) {
          report(node, form);
        }
      } else if (form === "positionConstant") {
        report(node, form);
      } else if (list && form === "computedIndex" && params.length > 0) {
        for (const parameter of params) {
          throughHelper(node, parameter);
        }
      } else if (list) {
        report(node, form);
      }
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      !CATALOG.has(node.expression.text) &&
      node.arguments.length > 1 &&
      node.arguments.some((argument) => isLabelList(argument))
    ) {
      report(node, "zip");
    }
  };
  visit(source);
  return found.sort((a, b) => a.line - b.line);
}

/** Cada lectura por posición de los archivos, con su forma y su línea. Los generados no se leen. */
export function positionalLabelReads(files: TextFile[]): PositionalRead[] {
  return files
    .filter((file) => /\.tsx?$/.test(file.path) && !file.path.endsWith(".generated.ts"))
    .flatMap(readsIn);
}

/** Cuántas hay de cada forma: la fila de `npm run audit:metrics`. */
export function positionalLabelCounts(files: TextFile[]): Record<PositionalForm, number> {
  const counts = Object.fromEntries(POSITIONAL_FORMS.map((form) => [form, 0])) as Record<
    PositionalForm,
    number
  >;
  for (const read of positionalLabelReads(files)) {
    counts[read.form] += 1;
  }
  return counts;
}
