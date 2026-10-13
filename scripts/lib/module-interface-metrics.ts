import { posix } from "node:path";
import ts from "typescript";
import type { TextFile } from "./test-suite-metrics";

// La interfaz pública de los módulos (spec #238, DT-012): qué exporta el `index.ts` de cada módulo de
// `src/modules` y quién se lo importa por nombre. La comparten `npm run audit:metrics` y la prueba que
// no deja que un `index.ts` gane un export sin consumidor (`tests/unit/module-public-interface.test.ts`).
// Solo lee texto: quien llama decide qué archivos le pasa, y por eso se puede probar con archivos que
// no existen.
//
// El criterio de uso es el de la spec: un nombre se queda si lo importa por nombre un archivo de
// producción (`src`, `scripts`, `.railway`) de fuera del módulo, o un componente del propio módulo, que
// no puede importar `domain/` (regla `componentes-sin-servidor`). Los tipos siguen el mismo criterio.

interface IndexUse {
  path: string;
  module: string;
  line: number;
}

/** Un archivo que toma el `index.ts` de un módulo de una forma que no dice qué nombres usa. */
export interface OpaqueUse extends IndexUse {
  how: string;
}

/** Un `vi.mock` del `index.ts` de un módulo, con los nombres que su fábrica sobrescribe. */
export interface IndexMock extends IndexUse {
  /**
   * `null` cuando no se puede leer qué sobrescribe: la fábrica no devuelve un objeto literal, o le
   * entra con `...` algo que no es una constante del archivo ni código de verdad del módulo.
   */
  names: string[] | null;
}

export interface ModuleInterface {
  module: string;
  /** Los nombres que exporta su `index.ts`, con los que trae un `export *`. */
  exported: string[];
  /** De esos, los que no importa por nombre nadie de producción de fuera ni un componente propio. */
  unused: string[];
  /** De `unused`, los que importa por nombre algún archivo de pruebas. */
  testOnly: string[];
  /** Los que se quedan solo porque los importa un componente del propio módulo. */
  ownComponentOnly: string[];
}

export interface ModuleInterfaces {
  modules: ModuleInterface[];
  /** Vacío es la condición de la cuenta: un `import *` o un `import()` suelto usa nombres que acá no se ven. */
  opaque: OpaqueUse[];
  mocks: IndexMock[];
}

interface Uses {
  named: (IndexUse & { name: string })[];
  opaque: OpaqueUse[];
  mocks: IndexMock[];
}

const INDEX = /^src\/modules\/([^/]+)\/index\.ts$/;

function parse(file: TextFile): ts.SourceFile {
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.ES2022, true);
}

/** El archivo del repo al que apunta un import, sin extensión ni `/index`; `null` si es un paquete. */
function resolved(from: string, specifier: string): string | null {
  const path = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? posix.join(posix.dirname(from), specifier)
      : null;
  return path === null ? null : path.replace(/\.(ts|tsx|mts)$/, "").replace(/\/index$/, "");
}

/** El módulo cuyo `index.ts` nombra el import: por el alias, con `/index` o por una ruta relativa. */
function moduleBehind(from: string, specifier: string): string | null {
  return /^src\/modules\/([^/]+)$/.exec(resolved(from, specifier) ?? "")?.[1] ?? null;
}

/** El archivo leído al que apunta una ruta sin extensión: el `.ts`, el `.tsx` o el `index.ts` de la carpeta. */
function fileAt(target: string | null, files: ReadonlyMap<string, TextFile>): string | undefined {
  return target === null
    ? undefined
    : [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find((path) => files.has(path));
}

function modifiersOf(statement: ts.Statement): ts.SyntaxKind[] {
  const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
  return modifiers.map((modifier) => modifier.kind);
}

/** El nombre de una declaración exportada que no es una variable; `null` si no tiene uno que se pueda leer. */
function declaredName(statement: ts.Statement): string | null {
  const named =
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement);
  return named && statement.name && ts.isIdentifier(statement.name) ? statement.name.text : null;
}

/**
 * Los nombres que exporta un archivo, con `default` si exporta por defecto. Un `export *` se sigue
 * hasta el archivo que reexporta, sin su `default`, que un `export *` no trae: si ese archivo no está
 * entre los que se le pasaron, falla en vez de contar de menos. También falla ante un export que no
 * sabe nombrar: una forma que no reconoce no se cuenta en cero.
 */
function namesExported(
  path: string,
  files: ReadonlyMap<string, TextFile>,
  trail: readonly string[] = [],
): string[] {
  const file = files.get(path);
  if (!file) {
    throw new Error(`No está ${path} entre los archivos leídos: no se pueden contar sus exports`);
  }
  const names: string[] = [];
  const source = parse(file);
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        names.push(...clause.elements.map((element) => element.name.text));
      } else if (clause) {
        names.push(clause.name.text);
      } else {
        const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
        const next = fileAt(resolved(path, specifier), files);
        if (!next || trail.includes(next)) {
          throw new Error(
            `${path} reexporta con \`export *\` de "${specifier}", que no se pudo seguir`,
          );
        }
        names.push(
          ...namesExported(next, files, [...trail, path]).filter((name) => name !== "default"),
        );
      }
      continue;
    }
    const modifiers = modifiersOf(statement);
    if (!ts.isExportAssignment(statement) && !modifiers.includes(ts.SyntaxKind.ExportKeyword)) {
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const { name } of statement.declarationList.declarations) {
        if (!ts.isIdentifier(name)) {
          throw new Error(`${path} exporta una desestructuración: no se pueden contar sus nombres`);
        }
        names.push(name.text);
      }
      continue;
    }
    // Un `export default …` es el nombre `default`; un `export =` no tiene nombre que alguien importe.
    const byDefault = ts.isExportAssignment(statement)
      ? !statement.isExportEquals
      : modifiers.includes(ts.SyntaxKind.DefaultKeyword);
    const name = byDefault ? "default" : declaredName(statement);
    if (name === null) {
      const [how = ""] = statement.getText(source).split("\n");
      throw new Error(`${path} exporta algo que la cuenta no sabe nombrar: \`${how.trim()}\``);
    }
    names.push(name);
  }
  return names;
}

/** Los nombres de un `import { … }` o de un `export { … } from`; `null` si trae otra cosa. */
function namedBindings(node: ts.ImportDeclaration | ts.ExportDeclaration): string[] | null {
  if (ts.isExportDeclaration(node)) {
    const clause = node.exportClause;
    return clause && ts.isNamedExports(clause)
      ? clause.elements.map((element) => (element.propertyName ?? element.name).text)
      : null;
  }
  const clause = node.importClause;
  const bindings = clause?.namedBindings;
  return clause && !clause.name && bindings && ts.isNamedImports(bindings)
    ? bindings.elements.map((element) => (element.propertyName ?? element.name).text)
    : null;
}

/** Los nombres de `const { a, b: c } = await import(…)`; `null` si el módulo se guarda entero. */
function destructured(call: ts.CallExpression): string[] | null {
  let value: ts.Node = call;
  while (ts.isAwaitExpression(value.parent) || ts.isParenthesizedExpression(value.parent)) {
    value = value.parent;
  }
  const declaration = value.parent;
  if (
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer !== value ||
    !ts.isObjectBindingPattern(declaration.name)
  ) {
    return null;
  }
  const names: string[] = [];
  for (const element of declaration.name.elements) {
    const key = element.propertyName ?? element.name;
    if (element.dotDotDotToken || !(ts.isIdentifier(key) || ts.isStringLiteralLike(key))) {
      return null;
    }
    names.push(key.text);
  }
  return names;
}

function unwrapped(expression: ts.Expression): ts.Expression {
  let inner = expression;
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isAwaitExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner)
  ) {
    inner = inner.expression;
  }
  return inner;
}

function isViCall(call: ts.CallExpression, ...methods: string[]): boolean {
  const callee = call.expression;
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "vi" &&
    methods.includes(callee.name.text)
  );
}

/** Lo que devuelve una función flecha o una `function`, sin entrar a las funciones que tenga adentro. */
function returnedBy(fn: ts.Expression | undefined): (ts.Expression | undefined)[] | null {
  if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) {
    return null;
  }
  if (!ts.isBlock(fn.body)) {
    return [fn.body];
  }
  const returned: (ts.Expression | undefined)[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isFunctionLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node)) {
      returned.push(node.expression);
    }
    ts.forEachChild(node, collect);
  };
  ts.forEachChild(fn.body, collect);
  return returned.length > 0 ? returned : null;
}

type MockFactory = ts.ArrowFunction | ts.FunctionExpression;

/** Dónde se lee la fábrica de un `vi.mock`: su archivo, el módulo que simula y los archivos que hay. */
interface MockSite {
  source: ts.SourceFile;
  module: string;
  factory: MockFactory;
  files: ReadonlyMap<string, TextFile>;
}

function declaredIn(
  statements: readonly ts.Statement[],
  name: string,
): ts.VariableDeclaration | undefined {
  return statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name);
}

/** Lo que guarda una constante que se nombra en la fábrica: primero las de la fábrica, después las del archivo. */
function initializerOf(name: string, site: MockSite): ts.Expression | undefined {
  const body = site.factory.body;
  const local = ts.isBlock(body) ? declaredIn(body.statements, name) : undefined;
  return (local ?? declaredIn(site.source.statements, name))?.initializer;
}

function isImportCall(call: ts.CallExpression): boolean {
  return call.expression.kind === ts.SyntaxKind.ImportKeyword;
}

/**
 * Si una llamada trae el código de verdad del módulo que se simula, que no sobrescribe nada: el
 * `importOriginal()` de la fábrica, o un `import()` o `vi.importActual()` de su `index.ts` o de un
 * archivo suyo que esté entre los leídos. Un archivo de otro lado no lo es.
 */
function loadsOwnCode(call: ts.CallExpression, site: MockSite): boolean {
  const [original] = site.factory.parameters;
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return (
      original !== undefined && ts.isIdentifier(original.name) && callee.text === original.name.text
    );
  }
  const [specifier] = call.arguments;
  if (
    !(isImportCall(call) || isViCall(call, "importActual")) ||
    !specifier ||
    !ts.isStringLiteralLike(specifier)
  ) {
    return false;
  }
  const target = resolved(site.source.fileName, specifier.text) ?? "";
  const own = `src/modules/${site.module}`;
  return (
    target === own || (target.startsWith(`${own}/`) && fileAt(target, site.files) !== undefined)
  );
}

/**
 * Las claves que escribe un objeto literal, o el que guarda una constante, sola o dentro de
 * `vi.hoisted(() => ({ … }))`. Lo que le entra con `...` se sigue: una constante o un `vi.hoisted`
 * suman sus claves; el código de verdad del módulo no sobrescribe nada y no suma; lo demás no se puede
 * leer y deja todo en `null`.
 */
function keysOf(expression: ts.Expression | undefined, site: MockSite, hops = 0): string[] | null {
  const value = expression && unwrapped(expression);
  if (!value || hops > 5) {
    return null;
  }
  if (ts.isIdentifier(value)) {
    return keysOf(initializerOf(value.text, site), site, hops + 1);
  }
  if (ts.isCallExpression(value)) {
    if (isViCall(value, "hoisted")) {
      return keysOfAll(returnedBy(value.arguments[0]), site, hops + 1);
    }
    return loadsOwnCode(value, site) ? [] : null;
  }
  if (!ts.isObjectLiteralExpression(value)) {
    return null;
  }
  const names: string[] = [];
  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = keysOf(property.expression, site, hops + 1);
      if (spread === null) {
        return null;
      }
      names.push(...spread);
    } else if (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) {
      names.push(property.name.text);
    } else {
      return null;
    }
  }
  return names;
}

function keysOfAll(
  expressions: (ts.Expression | undefined)[] | null,
  site: MockSite,
  hops = 0,
): string[] | null {
  const keys = expressions?.map((expression) => keysOf(expression, site, hops)) ?? [null];
  return keys.some((names) => names === null) ? null : keys.flatMap((names) => names ?? []);
}

/** Los nombres que sobrescribe la fábrica de un `vi.mock`; sin fábrica, el automock no nombra ninguno. */
function mockedNames(
  factory: ts.Expression | undefined,
  site: Omit<MockSite, "factory">,
): string[] | null {
  if (!factory) {
    return [];
  }
  return ts.isArrowFunction(factory) || ts.isFunctionExpression(factory)
    ? keysOfAll(returnedBy(factory), { ...site, factory })
    : null;
}

/** Una carga de módulo en ejecución: `import()`, `require()`, `vi.importActual()` o `vi.importMock()`. */
function isModuleLoad(call: ts.CallExpression): boolean {
  return (
    isImportCall(call) ||
    (ts.isIdentifier(call.expression) && call.expression.text === "require") ||
    isViCall(call, "importActual", "importMock")
  );
}

/**
 * Cómo usa un archivo los `index.ts` de los módulos. Solo mira donde se carga un módulo (import,
 * `export … from`, `import()`, `require`, `vi.importActual`, `vi.importMock`, `typeof import()` y
 * `vi.mock`): una cadena suelta que diga `@/modules/people` no es un uso. Dentro de un `vi.mock` de
 * un `index.ts`, cargar ese mismo módulo es del mock y no cuenta como import; cargar otro sí cuenta.
 */
function usesOf(
  file: TextFile,
  modules: ReadonlySet<string>,
  files: ReadonlyMap<string, TextFile>,
): Uses {
  const source = parse(file);
  const uses: Uses = { named: [], opaque: [], mocks: [] };
  const moduleAt = (node: ts.Node | undefined): string | null => {
    const module = node && ts.isStringLiteralLike(node) ? moduleBehind(file.path, node.text) : null;
    return module && modules.has(module) ? module : null;
  };
  /** Dónde está escrito un uso del `index.ts` de un módulo. */
  const locate = (node: ts.Node, module: string) => ({
    path: file.path,
    module,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  });
  /** Anota un uso: con sus nombres o, si no se pueden leer (`null`), como opaco con su renglón. */
  const record = (node: ts.Node, module: string, names: string[] | null) => {
    const use = locate(node, module);
    if (names) {
      uses.named.push(...names.map((name) => ({ ...use, name })));
    } else {
      const [how = ""] = source.text.slice(node.getStart(source), node.end).split("\n");
      uses.opaque.push({ ...use, how: how.trim() });
    }
  };
  // `mocked` es el módulo cuya carga no cuenta en este tramo: el que simula el `vi.mock` de afuera.
  const visit = (node: ts.Node, mocked: string | null): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const module = moduleAt(node.moduleSpecifier);
      if (module) {
        record(node, module, namedBindings(node));
      }
      return;
    }
    if (ts.isCallExpression(node) && isViCall(node, "mock", "doMock")) {
      const [first, factory] = node.arguments;
      const module =
        moduleAt(first) ??
        (first && ts.isCallExpression(first) && isModuleLoad(first)
          ? moduleAt(first.arguments[0])
          : null);
      if (module) {
        const names = mockedNames(factory, { source, module, files });
        uses.mocks.push({ ...locate(node, module), names });
        ts.forEachChild(node, (child) => visit(child, module));
        return;
      }
    } else if (ts.isCallExpression(node) && isModuleLoad(node)) {
      const module = moduleAt(node.arguments[0]);
      if (module) {
        if (module !== mocked) {
          record(node, module, destructured(node));
        }
        // El tipo que acompaña a la carga (`vi.importActual<typeof import("…")>("…")`) no es otro uso.
        ts.forEachChild(node, (child) => visit(child, module));
        return;
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const module = moduleAt(node.argument.literal);
      if (module && module !== mocked) {
        // `import("@/modules/x").Nombre` usa un nombre; `typeof import("@/modules/x")`, el módulo entero.
        let name = node.isTypeOf ? undefined : node.qualifier;
        while (name && ts.isQualifiedName(name)) {
          name = name.left;
        }
        record(node, module, name ? [name.text] : null);
      }
    }
    ts.forEachChild(node, (child) => visit(child, mocked));
  };
  visit(source, null);
  return uses;
}

/**
 * Por módulo, qué exporta su `index.ts` y qué de eso no tiene consumidor de producción. `production`
 * son los archivos de `src`, `scripts` y `.railway`, con los de los propios módulos; `tests`, los de
 * pruebas, que no salvan un nombre: solo dicen cuáles de los que sobran usa alguna prueba.
 */
export function moduleInterfaces(production: TextFile[], tests: TextFile[]): ModuleInterfaces {
  const byPath = new Map(production.map((file) => [file.path, file]));
  const modules = new Set(production.flatMap((file) => INDEX.exec(file.path)?.[1] ?? []));
  // Un import que llegue a un `index.ts` lo nombra con `modules/` en la ruta o sale de adentro de un módulo.
  const read = (files: TextFile[]) =>
    files
      .filter((file) => file.text.includes("modules/") || file.path.startsWith("src/modules/"))
      .map((file) => usesOf(file, modules, byPath));
  const inProduction = read(production);
  const inTests = read(tests);
  const importedBy = (uses: Uses[], module: string, counts: (path: string) => boolean) =>
    new Set(
      uses
        .flatMap((use) => use.named)
        .filter((use) => use.module === module && counts(use.path))
        .map((use) => use.name),
    );
  return {
    modules: [...modules].sort().map((module) => {
      const own = `src/modules/${module}/`;
      const outside = importedBy(inProduction, module, (path) => !path.startsWith(own));
      const components = importedBy(inProduction, module, (path) =>
        path.startsWith(`${own}components/`),
      );
      const tested = importedBy(inTests, module, () => true);
      const exported = [...new Set(namesExported(`${own}index.ts`, byPath))].sort();
      const unused = exported.filter((name) => !outside.has(name) && !components.has(name));
      return {
        module,
        exported,
        unused,
        testOnly: unused.filter((name) => tested.has(name)),
        ownComponentOnly: exported.filter((name) => !outside.has(name) && components.has(name)),
      };
    }),
    opaque: [...inProduction, ...inTests].flatMap((use) => use.opaque),
    mocks: [...inProduction, ...inTests].flatMap((use) => use.mocks),
  };
}
