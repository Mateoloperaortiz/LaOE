import { posix } from "node:path";
import ts from "typescript";
import { parse, type TextFile } from "./test-suite-metrics";

// La lectura de las cargas de `src` que no nombran lo que toman (DT-384, ADR-128 regla 5). No es una
// medida de `npm run audit:metrics`: la usa solo su trinquete,
// `tests/unit/test-named-source-loads.test.ts`, y por eso vive acá y no con las medidas de
// `scripts/lib/test-suite-metrics.ts`, de donde toma cómo se lee un archivo. Solo lee texto: quien
// llama decide qué archivos le pasa.

/** Una carga de un archivo de `src` que no nombra lo que toma. */
export interface UnnamedLoad {
  path: string;
  /**
   * `memberRead` es la lectura: un miembro leído sobre la carga, `(await import("…")).nombre`.
   * `wholeFile` es el archivo entero, la carga que no llega a un nombre: la que algo esparce, devuelve, recibe o guarda sin decir qué toma; el
   * `import * as` al que no se le lee ningún miembro por nombre, y el `export * from`.
   */
  form: "memberRead" | "wholeFile";
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
 * Si una desestructuración nombra cada miembro que toma. Una clave calculada (`{ [clave]: x }`) no
 * nombra nada; entre corchetes y con el texto escrito ahí (`{ ["nombre"]: x }`), sí.
 */
function namesItsKeys(pattern: ts.ObjectBindingPattern): boolean {
  return pattern.elements.every(
    ({ propertyName }) =>
      propertyName === undefined ||
      !ts.isComputedPropertyName(propertyName) ||
      ts.isStringLiteralLike(propertyName.expression),
  );
}

/** Si la variable que guarda la carga sale exportada en su declaración: `export const ruta = await import("…")`. */
function exportedWhereDeclared(declaration: ts.VariableDeclaration): boolean {
  return (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) !== 0;
}

/**
 * Qué hace con una carga guardada un nombre igual al de su variable: le lee un miembro por su
 * nombre o la desestructura (`named`); la usa de tipo (`type`, `typeof ruta`); la pasa entera como
 * argumento de una llamada (`argument`); la usa entera de otra forma (`whole`), o es ajeno
 * (`unrelated`): el nombre de un miembro o de otra declaración (`otro.cargado`, `{ cargado: 1 }`),
 * que no es la variable.
 */
type Use = "named" | "type" | "argument" | "whole" | "unrelated";

function howUsed(use: ts.Identifier): Use {
  const parent = use.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === use) {
    return "named";
  }
  if (ts.isElementAccessExpression(parent) && parent.expression === use) {
    // `ruta["GET"]` nombra. `ruta[metodo]` no: con una clave que no es un texto escrito ahí, knip da
    // por usado todo el archivo, aunque al lado se lea otro miembro por nombre.
    return ts.isStringLiteralLike(parent.argumentExpression) ? "named" : "whole";
  }
  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === use &&
    ts.isObjectBindingPattern(parent.name)
  ) {
    // Con resto (`const { GET, ...otros } = ruta`) knip tampoco sigue. Con una clave calculada
    // (`const { [metodo]: x } = ruta`) sí sigue, pero la prueba no nombra lo que toma.
    return parent.name.elements.some((element) => element.dotDotDotToken) ||
      !namesItsKeys(parent.name)
      ? "whole"
      : "named";
  }
  if (ts.isTypeQueryNode(parent)) {
    return "type";
  }
  if (ts.isExportSpecifier(parent)) {
    // `export { cargado }` y `export { cargado as otro }` la sacan entera. En `export { otro as
    // cargado }` y en un reexporte con `from`, el nombre no es la variable.
    const local = parent.propertyName ?? parent.name;
    return local === use && !parent.parent.parent.moduleSpecifier ? "whole" : "unrelated";
  }
  // `{ cargado }` la mete entera.
  if (ts.isShorthandPropertyAssignment(parent)) {
    return "whole";
  }
  const named = parent as { name?: ts.Node; propertyName?: ts.Node };
  if (named.name === use || named.propertyName === use) {
    return "unrelated";
  }
  return ts.isCallExpression(parent) && parent.arguments.includes(use) ? "argument" : "whole";
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
  return usesOf(variable).every((use) => use !== "whole" && use !== "argument");
}

/**
 * Si un `import * as` nombra lo que toma: se le lee al menos un miembro por nombre y, fuera de eso,
 * entero solo va como argumento de una llamada, que es como lo pide `vi.spyOn(espacio, "nombre")`.
 */
function namespaceReadByName(namespace: ts.Identifier): boolean {
  const uses = usesOf(namespace);
  return uses.includes("named") && !uses.includes("whole");
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
    ts.isObjectBindingPattern(element.name) &&
    namesItsKeys(element.name)
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
    return "memberRead";
  }
  const declaration = declaredFrom(load);
  if (declaration) {
    const named = ts.isIdentifier(declaration.name)
      ? !exportedWhereDeclared(declaration) && readByNameOnly(declaration.name)
      : ts.isObjectBindingPattern(declaration.name) && namesItsKeys(declaration.name);
    return named ? null : "wholeFile";
  }
  if (ts.isArrayLiteralExpression(load.parent) && namedInList(load.parent, load)) {
    return null;
  }
  return "wholeFile";
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
 * - `const { nombre } = await import("…")`, también con resto, con cada clave escrita;
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
 * que no se midió, y lo que knip sí sigue pero no nombra: la variable devuelta o exportada entera, en un `export { … }` o en
 * su declaración; la desestructuración con una clave calculada (`{ [clave]: x }`), y
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
          found.push({ path: file.path, form: "wholeFile", specifier });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  return found;
}
