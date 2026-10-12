import ts from "typescript";

// Las lecturas por posición de una lista del catálogo de textos (spec #242, ADR-126 regla 11): la
// etiqueta de un valor de un enum se lee con `tLabels(código, ENUM)[valor]`, y esto encuentra las
// formas viejas, que emparejan dos secuencias por su posición. Lo comparten la prueba
// `tests/unit/label-positions.test.ts`, que las compara con su lista de excepciones, y la fila de
// `npm run audit:metrics`. Solo lee texto, archivo por archivo y sin tipos: quien llama decide qué
// archivos le pasa.
//
// Qué es una lista del catálogo, para lo que sigue: una llamada a `tList(…)`, se importe con el nombre
// que se importe; lo que sale de ella con un método que devuelve otra lista (`map`, `slice`, `filter`,
// `concat`, `toSorted`, `toReversed`, `sort`, `reverse`), con `[...lista]` o con `Array.from(lista)`;
// una variable del archivo que guarda una de esas, al nacer o después; o la propiedad de un objeto
// literal del archivo que la guarda, leída con punto o desestructurada. Una lista que llega por
// parámetro o por props no se sigue, ni un `tList` envuelto en una función propia.

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
const LIST_METHODS = new Set([
  "map",
  "slice",
  "filter",
  "concat",
  "toSorted",
  "toReversed",
  "sort",
  "reverse",
]);
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
  /** Lo que recorre cada índice de recorrido que se pudo seguir. */
  traversed: ts.Expression[];
}

function compact(text: string): string {
  return text.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
}

function isSource(file: TextFile): boolean {
  return /\.tsx?$/.test(file.path) && !file.path.endsWith(".generated.ts");
}

function parse(file: TextFile): ts.SourceFile {
  return ts.createSourceFile(
    file.path,
    file.text,
    ts.ScriptTarget.ES2022,
    true,
    file.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const ALIASES = new WeakMap<ts.SourceFile, Map<string, string>>();

/**
 * Cómo se llama afuera lo que el archivo importa con otro nombre (`import { tList as lista }`): así
 * una función del catálogo no deja de verse por llegar renombrada.
 */
function importedName(identifier: ts.Identifier): string {
  const source = identifier.getSourceFile();
  let aliases = ALIASES.get(source);
  if (!aliases) {
    aliases = new Map();
    for (const statement of source.statements) {
      const bindings = ts.isImportDeclaration(statement)
        ? statement.importClause?.namedBindings
        : undefined;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (element.propertyName) {
            aliases.set(element.name.text, element.propertyName.text);
          }
        }
      }
    }
    ALIASES.set(source, aliases);
  }
  return aliases.get(identifier.text) ?? identifier.text;
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

/** La secuencia que recorre un índice de recorrido: la del callback o la de `.entries()`. */
function traversedBy(declaration: ts.Node): ts.Expression | undefined {
  if (ts.isParameter(declaration)) {
    const call = declaration.parent.parent;
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) {
      return undefined;
    }
    return call.expression.name.text === "from" ? call.arguments[0] : call.expression.expression;
  }
  if (ts.isBindingElement(declaration)) {
    const loop = declaration.parent.parent.parent.parent;
    return ts.isForOfStatement(loop) &&
      ts.isCallExpression(loop.expression) &&
      ts.isPropertyAccessExpression(loop.expression.expression)
      ? loop.expression.expression.expression
      : undefined;
  }
  return undefined;
}

/**
 * Lo que el archivo le asigna a una variable después de declararla, y si además la hace avanzar
 * (`+=`, `++`). Una constante no se busca: su único valor es el de su declaración.
 */
function reassigned(
  declaration: ts.VariableDeclaration,
  source: ts.SourceFile,
): { values: ts.Expression[]; stepped: boolean } {
  const values: ts.Expression[] = [];
  let stepped = false;
  if (
    !ts.isVariableDeclarationList(declaration.parent) ||
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  ) {
    return { values, stepped };
  }
  const targets = (expression: ts.Expression) => {
    const target = unwrap(expression);
    return ts.isIdentifier(target) && declarationOf(target) === declaration;
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      targets(node.left)
    ) {
      if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        values.push(node.right);
      } else {
        stepped = true;
      }
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      targets(node.operand)
    ) {
      stepped = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { values, stepped };
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
  trace: Trace = { origins: new Set(), receivers: [], params: [], traversed: [] },
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
        // Una búsqueda envuelta en otra llamada (`Math.max(0, ORDER.indexOf(valor))`) sigue siendo
        // la posición de un valor: cuenta como si estuviera sola en el subíndice.
        const searched = node.arguments
          .map((argument) => originsOf(argument, source, depth))
          .filter((inner) => inner.origins.has("search") || inner.origins.has("stored"));
        for (const inner of searched) {
          trace.origins.add(inner.origins.has("search") ? "search" : "stored");
          trace.receivers.push(...inner.receivers);
        }
        if (searched.length === 0) {
          trace.origins.add("other");
        }
      }
    }
  } else if (ts.isElementAccessExpression(node)) {
    trace.origins.add(keepsPositions(node.expression) ? "positions" : "other");
  } else if (ts.isIdentifier(node)) {
    const declaration = declarationOf(node);
    if (declaration && isTraversalIndex(declaration)) {
      trace.origins.add("traversal");
      const sequence = traversedBy(declaration);
      if (sequence) {
        trace.traversed.push(sequence);
      }
    } else if (declaration && ts.isParameter(declaration)) {
      trace.origins.add("param");
      trace.params.push(declaration);
    } else if (
      declaration &&
      ts.isVariableDeclaration(declaration) &&
      !(declaration.initializer && isFunction(unwrap(declaration.initializer))) &&
      depth < DEPTH
    ) {
      // El valor con el que nació y los que el archivo le asigna después: un `let index = -1` que
      // más abajo recibe un `indexOf` guarda esa búsqueda igual que una constante.
      const { values, stepped } = reassigned(declaration, source);
      const written = declaration.initializer ? [declaration.initializer, ...values] : values;
      if (written.length === 0 || stepped) {
        trace.origins.add("other");
      }
      for (const value of written) {
        const inner = originsOf(value, source, depth + 1);
        if (inner.origins.has("search") || inner.origins.has("stored")) {
          trace.origins.add("stored");
          trace.receivers.push(...inner.receivers);
        } else {
          for (const origin of inner.origins) {
            trace.origins.add(origin);
          }
          trace.params.push(...inner.params);
          trace.traversed.push(...inner.traversed);
        }
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
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    names.has(importedName(node.expression))
  );
}

function isArrayFrom(callee: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "Array" &&
    callee.name.text === "from"
  );
}

/** Si `holder` es un objeto literal, o la variable del archivo que lo guarda, con una lista en `key`. */
function holdsLabelList(holder: ts.Expression, key: string, depth: number): boolean {
  let literal = unwrap(holder);
  if (ts.isIdentifier(literal)) {
    const declaration = declarationOf(literal);
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      literal = unwrap(declaration.initializer);
    }
  }
  return (
    ts.isObjectLiteralExpression(literal) &&
    literal.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) &&
        property.name.text === key &&
        isLabelList(property.initializer, depth),
    )
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
      return importedName(callee) === "tList";
    }
    if (isArrayFrom(callee)) {
      const [copied] = node.arguments;
      return !!copied && isLabelList(copied, depth);
    }
    return (
      ts.isPropertyAccessExpression(callee) &&
      LIST_METHODS.has(callee.name.text) &&
      isLabelList(callee.expression, depth)
    );
  }
  if (ts.isArrayLiteralExpression(node)) {
    // `[...lista]` sigue siendo la lista, con las piezas en su posición o corridas.
    return node.elements.some(
      (element) => ts.isSpreadElement(element) && isLabelList(element.expression, depth),
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
    if (declaration && ts.isVariableDeclaration(declaration)) {
      // El valor con el que nació y los que el archivo le asigna después.
      const { values } = reassigned(declaration, declaration.getSourceFile());
      const written = declaration.initializer ? [declaration.initializer, ...values] : values;
      return written.some((value) => isLabelList(value, depth + 1));
    }
    if (
      declaration &&
      ts.isBindingElement(declaration) &&
      ts.isObjectBindingPattern(declaration.parent)
    ) {
      // `const { kinds } = { kinds: tList(…) }`: la propiedad de un objeto literal, desestructurada.
      const holder = declaration.parent.parent;
      const key = declaration.propertyName ?? declaration.name;
      return (
        ts.isVariableDeclaration(holder) &&
        !!holder.initializer &&
        (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) &&
        holdsLabelList(holder.initializer, key.text, depth + 1)
      );
    }
    return false;
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    return holdsLabelList(node.expression, node.name.text, depth + 1);
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

/**
 * Una función que puede emparejar por su cuenta lo que recibe: cualquiera que no sea del catálogo,
 * se llame suelta (`zip(…)`) o como método (`util.zip(…)`). `Array.from(lista, fn)` solo recorre la
 * lista: si su función lee otra secuencia con el índice, cae como recorrido.
 */
function pairsByItself(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) {
    return !CATALOG.has(importedName(callee));
  }
  return ts.isPropertyAccessExpression(callee) && !isArrayFrom(callee);
}

function readsIn(file: TextFile): PositionalRead[] {
  const source = parse(file);
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
  const throughHelper = (access: ts.Expression, parameter: ts.ParameterDeclaration) => {
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

  /** Una lectura de `target` en la posición `subscript`: `target[subscript]` o `target.at(subscript)`. */
  const read = (node: ts.Expression, target: ts.Expression, subscript: ts.Expression) => {
    const { origins, receivers, params, traversed } = originsOf(subscript, source);
    const list = isLabelList(target);
    if (onlyLiteral(origins)) {
      if (ts.isElementAccessExpression(node) && isLabelRecord(target)) {
        report(node, "recordByNumber");
      }
      return;
    }
    const form = formOf(origins);
    if (form === "indexOf" || form === "storedIndex") {
      // Buscar una posición en una lista y leer esa misma lista no empareja dos secuencias.
      const name = compact(target.getText(source));
      if (!receivers.every((receiver) => receiver === name)) {
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
    } else if (form === "traversal" && traversed.some((sequence) => isLabelList(sequence))) {
      // El recorrido inverso: recorre las etiquetas y lee con su índice el orden, que no es del catálogo.
      report(node, form);
    }
  };

  const visit = (node: ts.Node) => {
    ts.forEachChild(node, visit);
    if (ts.isElementAccessExpression(node)) {
      read(node, node.expression, node.argumentExpression);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "at" &&
      node.arguments.length === 1
    ) {
      const [subscript] = node.arguments;
      if (subscript) {
        read(node, node.expression.expression, subscript);
      }
      return;
    }
    if (
      ts.isCallExpression(node) &&
      node.arguments.length > 1 &&
      pairsByItself(node.expression) &&
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
  return files.filter(isSource).flatMap(readsIn);
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

export interface LabelCall {
  path: string;
  line: number;
  /** El código de la lista, si está escrito en la llamada. */
  code: string | null;
  /** Cómo nombra la llamada su orden, sin espacios. */
  order: string;
  /** Los valores del orden, cuando están escritos en el archivo; si se importa, no se saben. */
  values: string[] | null;
}

/** Los valores de un arreglo literal de textos, o de la variable del archivo que lo guarda. */
function writtenValues(expression: ts.Expression, depth = 0): string[] | null {
  const node = unwrap(expression);
  if (ts.isArrayLiteralExpression(node)) {
    const values: string[] = [];
    for (const element of node.elements) {
      if (!ts.isStringLiteralLike(element)) {
        return null;
      }
      values.push(element.text);
    }
    return values;
  }
  if (!ts.isIdentifier(node) || depth > DEPTH) {
    return null;
  }
  const declaration = declarationOf(node);
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer
    ? writtenValues(declaration.initializer, depth + 1)
    : null;
}

/**
 * Cómo se llama el orden donde se declaró: el nombre de afuera si el import lo renombra, o el de la
 * tupla que una constante del archivo solo guarda. Así un orden no pasa por otro con llamarse igual.
 */
function declaredOrder(expression: ts.Expression, source: ts.SourceFile, depth = 0): string {
  const node = unwrap(expression);
  if (ts.isIdentifier(node) && depth <= DEPTH) {
    const declaration = declarationOf(node);
    if (declaration && ts.isImportSpecifier(declaration) && declaration.propertyName) {
      return declaration.propertyName.text;
    }
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const initializer = unwrap(declaration.initializer);
      if (ts.isIdentifier(initializer) || ts.isPropertyAccessExpression(initializer)) {
        return declaredOrder(initializer, source, depth + 1);
      }
    }
  }
  return compact(node.getText(source));
}

/**
 * Cada llamada a `tLabels` de los archivos: qué lista lee y con qué orden. `tLabels` compara largos,
 * no pares: con otra lista del mismo largo compila igual. Quien llama compara esto con la tabla de
 * pares (`tests/unit/enum-label-pairs.table.ts`).
 */
export function labelCalls(files: TextFile[]): LabelCall[] {
  return files.filter(isSource).flatMap((file) => {
    const source = parse(file);
    const found: LabelCall[] = [];
    const visit = (node: ts.Node) => {
      ts.forEachChild(node, visit);
      if (
        !ts.isCallExpression(node) ||
        !ts.isIdentifier(node.expression) ||
        importedName(node.expression) !== "tLabels"
      ) {
        return;
      }
      const [code, order] = node.arguments;
      if (order) {
        found.push({
          path: file.path,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          code: code && ts.isStringLiteralLike(code) ? code.text : null,
          order: declaredOrder(order, source),
          values: writtenValues(order),
        });
      }
    };
    visit(source);
    return found;
  });
}

/**
 * - `raw`: cae al valor con el que se leyó (`etiquetas[valor] ?? valor`).
 * - `empty`: cae a una cadena vacía (`?? ""`).
 * - `other`: cae a otra cosa (la primera etiqueta, un texto del catálogo).
 * - `none`: no tiene respaldo.
 */
export const FALLBACK_SHAPES = ["raw", "empty", "other", "none"] as const;
export type FallbackShape = (typeof FALLBACK_SHAPES)[number];

export interface LabelFallback {
  path: string;
  line: number;
  shape: FallbackShape;
  /** La lectura, sin espacios. */
  read: string;
}

/**
 * El respaldo de cada lectura por valor de un `Record` de `tLabels` o de `labelsFromProps`: lo que
 * el sitio muestra cuando el valor no tiene etiqueta. La migración de la spec #242 no cambió ninguno
 * y qué se muestra ahí espera una decisión (ADR-126 regla 3): quien llama los compara con su cuenta
 * por archivo. Como lo demás, lee sin tipos: ve el `Record` leído en la llamada o en la variable del
 * archivo que lo guarda, no el que llega por parámetro, por props o en la propiedad de un objeto.
 */
export function labelFallbacks(files: TextFile[]): LabelFallback[] {
  return files.filter(isSource).flatMap((file) => {
    const source = parse(file);
    const found: LabelFallback[] = [];
    const visit = (node: ts.Node) => {
      ts.forEachChild(node, visit);
      if (!ts.isElementAccessExpression(node) || !isLabelRecord(node.expression)) {
        return;
      }
      let outer: ts.Node = node;
      while (
        ts.isParenthesizedExpression(outer.parent) ||
        ts.isNonNullExpression(outer.parent) ||
        ts.isAsExpression(outer.parent)
      ) {
        outer = outer.parent;
      }
      const parent = outer.parent;
      const fallback =
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
        parent.left === outer
          ? unwrap(parent.right)
          : undefined;
      const key = compact(unwrap(node.argumentExpression).getText(source));
      let shape: FallbackShape = "other";
      if (!fallback) {
        shape = "none";
      } else if (ts.isStringLiteralLike(fallback) && fallback.text === "") {
        shape = "empty";
      } else if (compact(fallback.getText(source)) === key) {
        shape = "raw";
      }
      found.push({
        path: file.path,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        shape,
        read: compact(node.getText(source)),
      });
    };
    visit(source);
    return found;
  });
}
