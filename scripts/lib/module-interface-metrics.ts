import { posix } from "node:path";
import ts from "typescript";

// La interfaz pública de los módulos (spec #238, DT-012): qué exporta el `index.ts` de cada módulo de
// `src/modules` y quién se lo importa por nombre. La comparten `npm run audit:metrics` y la prueba que
// no deja que un `index.ts` gane un export sin consumidor (`tests/unit/module-public-interface.test.ts`).
// Solo lee texto: quien llama decide qué archivos le pasa, y por eso se puede probar con archivos que
// no existen.
//
// El criterio de uso es el de la spec: un nombre se queda si lo importa por nombre un archivo de
// producción (`src`, `scripts`, `.railway`) de fuera del módulo, o un componente del propio módulo, que
// no puede importar `domain/` (regla `componentes-sin-servidor`). Los tipos siguen el mismo criterio.

interface TextFile {
  path: string;
  text: string;
}

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
  /** `null` cuando la fábrica no devuelve un objeto literal y no se puede leer qué sobrescribe. */
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

function isExported(statement: ts.Statement): boolean {
  const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
  return (
    modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
    !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
  );
}

/**
 * Los nombres que exporta un archivo. Un `export *` se sigue hasta el archivo que reexporta: si no
 * está entre los que se le pasaron, falla en vez de contar de menos.
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
  for (const statement of parse(file).statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        names.push(...clause.elements.map((element) => element.name.text));
      } else if (clause) {
        names.push(clause.name.text);
      } else {
        const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
        const target = resolved(path, specifier);
        const next = [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find(
          (candidate) => files.has(candidate) && !trail.includes(candidate),
        );
        if (!next) {
          throw new Error(
            `${path} reexporta con \`export *\` de "${specifier}", que no se pudo seguir`,
          );
        }
        names.push(...namesExported(next, files, [...trail, path]));
      }
    } else if (isExported(statement)) {
      if (ts.isVariableStatement(statement)) {
        for (const { name } of statement.declarationList.declarations) {
          if (!ts.isIdentifier(name)) {
            throw new Error(
              `${path} exporta una desestructuración: no se pueden contar sus nombres`,
            );
          }
          names.push(name.text);
        }
      } else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        statement.name
      ) {
        names.push(statement.name.text);
      }
    }
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

/**
 * Las claves de un objeto literal, o del que guarda una constante del archivo, sola o dentro de
 * `vi.hoisted(() => ({ … }))`. Lo que llega con `...` no cuenta: es el módulo de verdad.
 */
function keysOf(
  expression: ts.Expression | undefined,
  source: ts.SourceFile,
  hops = 0,
): string[] | null {
  const value = expression && unwrapped(expression);
  if (!value || hops > 2) {
    return null;
  }
  if (ts.isIdentifier(value)) {
    const declared = source.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations)
      .find(({ name }) => ts.isIdentifier(name) && name.text === value.text);
    return keysOf(declared?.initializer, source, hops + 1);
  }
  if (ts.isCallExpression(value) && isViCall(value, "hoisted")) {
    return keysOfAll(returnedBy(value.arguments[0]), source, hops + 1);
  }
  if (!ts.isObjectLiteralExpression(value)) {
    return null;
  }
  const names: string[] = [];
  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) {
      continue;
    }
    if (!ts.isIdentifier(property.name) && !ts.isStringLiteralLike(property.name)) {
      return null;
    }
    names.push(property.name.text);
  }
  return names;
}

function keysOfAll(
  expressions: (ts.Expression | undefined)[] | null,
  source: ts.SourceFile,
  hops = 0,
): string[] | null {
  const keys = expressions?.map((expression) => keysOf(expression, source, hops)) ?? [null];
  return keys.some((names) => names === null) ? null : keys.flatMap((names) => names ?? []);
}

/** Los nombres que sobrescribe la fábrica de un `vi.mock`; sin fábrica, el automock no nombra ninguno. */
function mockedNames(factory: ts.Expression | undefined, source: ts.SourceFile): string[] | null {
  return factory ? keysOfAll(returnedBy(factory), source) : [];
}

function isModuleLoad(call: ts.CallExpression): boolean {
  return (
    call.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(call.expression) && call.expression.text === "require")
  );
}

/**
 * Cómo usa un archivo los `index.ts` de los módulos. Solo mira donde se carga un módulo (import,
 * `export … from`, `import()`, `require`, `typeof import()` y `vi.mock`): una cadena suelta que
 * diga `@/modules/people` no es un uso. Lo que queda dentro de un `vi.mock` de un `index.ts` es del
 * mock y no cuenta como import.
 */
function usesOf(file: TextFile, modules: ReadonlySet<string>): Uses {
  const source = parse(file);
  const uses: Uses = { named: [], opaque: [], mocks: [] };
  const moduleAt = (node: ts.Node | undefined): string | null => {
    const module = node && ts.isStringLiteralLike(node) ? moduleBehind(file.path, node.text) : null;
    return module && modules.has(module) ? module : null;
  };
  const take = (node: ts.Node, module: string, names: string[] | null) => {
    const start = node.getStart(source);
    const use = {
      path: file.path,
      module,
      line: source.getLineAndCharacterOfPosition(start).line + 1,
    };
    if (names) {
      uses.named.push(...names.map((name) => ({ ...use, name })));
    } else {
      const [how = ""] = source.text.slice(start, node.end).split("\n");
      uses.opaque.push({ ...use, how: how.trim() });
    }
    return use;
  };
  const visit = (node: ts.Node, mocked: boolean): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const module = moduleAt(node.moduleSpecifier);
      if (module) {
        take(node, module, namedBindings(node));
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
        uses.mocks.push({ ...take(node, module, []), names: mockedNames(factory, source) });
        ts.forEachChild(node, (child) => visit(child, true));
        return;
      }
    } else if (ts.isCallExpression(node) && isModuleLoad(node)) {
      const module = moduleAt(node.arguments[0]);
      if (module && !mocked) {
        take(node, module, destructured(node));
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const module = moduleAt(node.argument.literal);
      if (module && !mocked) {
        // `import("@/modules/x").Nombre` usa un nombre; `typeof import("@/modules/x")`, el módulo entero.
        let name = node.isTypeOf ? undefined : node.qualifier;
        while (name && ts.isQualifiedName(name)) {
          name = name.left;
        }
        take(node, module, name ? [name.text] : null);
      }
    }
    ts.forEachChild(node, (child) => visit(child, mocked));
  };
  visit(source, false);
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
      .map((file) => usesOf(file, modules));
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
