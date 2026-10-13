import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type ImportClosure, importClosure } from "../../scripts/lib/import-closure";
import {
  driftByKey,
  expectReasonedOnce,
  presence,
  sourceFiles,
  sourcePaths,
} from "../helpers/ratchet";

// El `index.ts` de un módulo no lo carga solo Next. También lo carga, en Node y sin Next, la E2E
// entera: `scripts/test-e2e.ts` lanza Playwright con `node --conditions=react-server` y sin tsx, y
// las pruebas llegan a los módulos por la fábrica. El cargador de Playwright resuelve los paquetes
// con la regla de Node para ESM, y `next` no trae mapa `exports`: un `import` estático de
// `next/headers` no resuelve, la E2E se queda sin pruebas que correr, y ni el lint, ni los tipos, ni
// las unitarias lo ven, porque Vitest sí lo resuelve (DT-379, ADR-128 regla 6). Lo que necesita Next
// se importa dentro de la función que lo usa, como `writeSessionCookie` (ADR-127 regla 6).
//
// La E2E no llega a `src` solo por los `index.ts`: sus archivos, la fábrica y los ayudantes que usan
// importan además los `schema.ts`, `@/db/client`, `@/shared/copy` y archivos de dominio (DT-396,
// ADR-129 regla 9). Esos se cargan también, y la lista sale del código: `importClosure` sigue los
// `import` de `playwright.config.ts` y de cada archivo de `tests/e2e`, pasa por lo que importan de
// `tests/` y anota cada archivo de `src` al que llegan. Medido el 2026-10-13: 41 archivos, cuatro de
// ellos un `index.ts`. De los otros 37, a 35 los carga también algún `index.ts` y a dos no
// (`src/jobs/backoff.ts` y `src/jobs/testing.ts`). Se cargan los 37: que hoy a uno lo alcance un
// `index.ts` no dice que mañana también.
//
// Esta prueba los carga de verdad: un solo proceso hijo importa el `index.ts` de cada módulo de
// `src/modules` y cada archivo de `src` que importa la E2E, y dice cuál falló y con qué error, que
// nombra el import que no resolvió y el archivo que lo pide. El hijo usa tsx, como los scripts de
// `package.json`, y debajo un paso que deja en firme la respuesta de Node. Hace falta porque tsx la
// relaja: cuando Node dice que un paquete no resuelve, tsx vuelve a pedirlo con la extensión puesta,
// y con tsx solo esta prueba no cae (medido con tsx 4.23: por eso los scripts de `package.json` sí
// cargan con ese import). Con el `import` sembrado arriba de `session-cookie.ts`, este hijo y el
// cargador de Playwright 1.62 dieron lo mismo el 2026-10-13: caen `identity` y `wallet`, que lo carga
// por `identity`, con el mismo error. Sembrado arriba de `src/jobs/backoff.ts`, que solo importa una
// spec, cae ese archivo y ningún `index.ts`.
//
// El hijo no recibe `DATABASE_URL`: no hay base que abrir, y nada de lo que carga abre una conexión
// al importarse (medido también con la base escrita). Tarda menos de dos segundos.
//
// `EXCEPTIONS` es para lo que no carga sin Next a propósito, con su razón. Nace vacía: cargan todos.
// Antes de sumar uno, mirá si el import puede ir dentro de la función.

interface Exception {
  /** El módulo, por su carpeta, o el archivo de `src` que importa la E2E, por su ruta. */
  entry: string;
  /** Por qué necesita Next al cargarse, en una frase. */
  reason: string;
}

const EXCEPTIONS: Exception[] = [];

const root = process.cwd();
const MARK = "@@carga@@";
const CONTROL = "control";
const PLAYWRIGHT_CONFIG = "playwright.config.ts";
const E2E = "tests/e2e/";

// La respuesta de Node, en firme: si Node dice que un paquete que importa el código de la casa no
// resuelve, ese es el error de la carga. Con otro código, para que tsx no lo tome por uno de los que
// reintenta. Lo relativo y el alias `@/` no pasan por acá: ahí probar extensiones es lo que hacen
// también Playwright y Next.
const strictHook = String.raw`
const PACKAGE = /^(?:@[^/]+\/)?[^@./#][^/:]*(?:\/|$)/;

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const parent = context.parentURL ?? "";
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      PACKAGE.test(specifier) &&
      parent.startsWith("file:") &&
      !parent.includes("/node_modules/")
    ) {
      throw Object.assign(new Error(error.message), { code: "ERR_NODE_DOES_NOT_RESOLVE" });
    }
    throw error;
  }
}
`;

// El paso se registra con su propio `--import`, antes que tsx: así queda entre tsx y Node sea cual
// sea la forma en que tsx registre lo suyo, recibe lo que tsx le pide a Node y ve lo que Node
// contesta. El control de más abajo dice en cada corrida si sigue ahí.
const registerStrictHook = `data:text/javascript,${encodeURIComponent(
  `import { register } from "node:module"; register(${JSON.stringify(
    `data:text/javascript,${encodeURIComponent(strictHook)}`,
  )});`,
)}`;

// Importa cada archivo y anota el error del que no carga. Termina solo: no llama a `process.exit`,
// así que algo que quedara vivo (una conexión, un temporizador) lo deja colgado hasta el límite.
const script = `
import { pathToFileURL } from "node:url";
const loaded = [];
for (const [name, file] of JSON.parse(process.env.LOAD_ENTRIES)) {
  try {
    await import(pathToFileURL(file).href);
    loaded.push({ name, error: null });
  } catch (error) {
    loaded.push({ name, error: error instanceof Error ? error.message : String(error) });
  }
}
console.log(${JSON.stringify(MARK)} + JSON.stringify({ loaded, database: "DATABASE_URL" in process.env }));
`;

interface Run {
  loaded: { name: string; error: string | null }[];
  /** Si el hijo recibió la base. */
  database: boolean;
  status: number | null;
  signal: string | null;
  timedOut: boolean;
}

/** Los módulos de `src/modules`, por el nombre de su carpeta. */
function moduleNames(): string[] {
  return readdirSync("src/modules", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const indexFileOf = (module: string) => `src/modules/${module}/index.ts`;

/**
 * Lo que la E2E carga de `src`, leído de sus `import`: parte de la configuración de Playwright y de
 * cada archivo de `tests/e2e`, y sigue por lo que importan de `tests/`, la fábrica y los ayudantes.
 */
function e2eImports(): ImportClosure {
  const tests = [
    ...sourceFiles("tests"),
    { path: PLAYWRIGHT_CONFIG, text: readFileSync(PLAYWRIGHT_CONFIG, "utf8") },
  ];
  return importClosure(
    tests,
    [PLAYWRIGHT_CONFIG, ...tests.map(({ path }) => path).filter((path) => path.startsWith(E2E))],
    sourcePaths("src"),
  );
}

/** Carga cada archivo en un proceso de Node sin Next, con la condición `react-server` de la E2E. */
function loadInNode(entries: [name: string, file: string][]): Run {
  // Lo que un `node` corrido a mano trae del entorno, con el `NODE_ENV` de la corrida, y nada del
  // `.env`: una variable sin valor no se le pasa al hijo.
  const { NODE_ENV, PATH, HOME, TMPDIR } = process.env;
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      registerStrictHook,
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      script,
    ],
    {
      cwd: root,
      env: { NODE_ENV, PATH, HOME, TMPDIR, LOAD_ENTRIES: JSON.stringify(entries) },
      encoding: "utf8",
      timeout: 60_000,
      killSignal: "SIGKILL",
    },
  );
  const line = result.stdout.split("\n").find((item) => item.startsWith(MARK));
  if (!line) {
    throw new Error(
      `la carga no terminó (salida ${result.status}): ${result.error?.message ?? result.stderr}`,
    );
  }
  return {
    ...(JSON.parse(line.slice(MARK.length)) as Pick<Run, "loaded" | "database">),
    status: result.status,
    signal: result.signal,
    timedOut: result.error !== undefined,
  };
}

/** El error en un renglón y con las rutas desde la raíz del repo. */
function readable(error: string): string {
  return error.replaceAll(`${root}/`, "").replace(/\s+/g, " ").trim();
}

let run: Run;
let modules: string[];
let e2e: ImportClosure;
/** Los archivos de `src` que importa la E2E y no son el `index.ts` de un módulo, que ya se carga. */
let sources: string[];

beforeAll(() => {
  modules = moduleNames();
  e2e = e2eImports();
  const indexes = new Set(modules.map(indexFileOf));
  sources = e2e.leaves.filter((file) => !indexes.has(file));
  // El control es un archivo con el `import` estático arriba, en una carpeta temporal que ve los
  // paquetes del repo y es ESM como la casa: dice que eso es justo lo que no carga, y que la prueba
  // se entera.
  const dir = mkdtempSync(join(tmpdir(), "carga-sin-next-"));
  try {
    symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "dir");
    writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
    const control = join(dir, "con-next-arriba.ts");
    writeFileSync(
      control,
      'import { cookies } from "next/headers";\nexport const read = cookies;\n',
    );
    run = loadInNode([
      ...modules.map((name): [string, string] => [name, indexFileOf(name)]),
      ...sources.map((file): [string, string] => [file, file]),
      [CONTROL, control],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90_000);

describe("el index.ts de cada módulo y lo que la E2E importa de src, cargados en Node sin Next", () => {
  it("carga: fuera de la lista de excepciones ninguno falla, y la excepción que ya carga sobra", () => {
    const failed = Object.fromEntries(
      run.loaded.flatMap(({ name, error }) =>
        name === CONTROL || error === null ? [] : [[name, readable(error)]],
      ),
    );
    const { unlisted, stale } = driftByKey(
      presence(Object.keys(failed)),
      presence(EXCEPTIONS.map(({ entry }) => entry)),
    );

    expect({
      failing: Object.fromEntries(unlisted.map((name) => [name, failed[name]])),
      stale,
    }).toEqual({ failing: {}, stale: [] });
  });

  it("se cargan todos los módulos de `src/modules` y todo lo que la E2E importa de `src`, uno por uno y sin saltarse ninguno", () => {
    expect(modules.length).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThan(0);
    expect(run.loaded.map(({ name }) => name)).toEqual([...modules, ...sources, CONTROL]);
  });

  it("lo que la E2E importa de `src` sale del código: la lectura parte de la configuración de Playwright y de cada archivo de `tests/e2e`, pasa por la fábrica y los ayudantes que usan, y no deja ninguna carga sin seguir", () => {
    const specs = sourcePaths("tests/e2e");

    expect(e2e.unread).toEqual([]);
    expect(specs.length).toBeGreaterThan(0);
    expect(e2e.walked).toEqual(expect.arrayContaining([PLAYWRIGHT_CONFIG, ...specs]));
    // La fábrica y algún ayudante: la E2E los importa, y por ellos llega a más archivos de `src`.
    expect(e2e.walked).toContain("tests/factories/index.ts");
    expect(e2e.walked.some((path) => path.startsWith("tests/helpers/"))).toBe(true);
    // Nada de lo recorrido es una prueba de otra suite, y nada de lo anotado está fuera de `src`.
    expect(e2e.walked.filter((path) => /^tests\/(?:unit|integration)\//.test(path))).toEqual([]);
    expect(e2e.leaves.filter((path) => !path.startsWith("src/"))).toEqual([]);
  });

  it("un `import` estático de `next/headers` es lo que ahí no carga: el control falla, y su error nombra el import y el archivo que lo pide", () => {
    const control = run.loaded.find(({ name }) => name === CONTROL);

    expect(control?.error).toMatch(
      /Cannot find module .*node_modules\/next\/headers.* imported from .*con-next-arriba\.ts/s,
    );
  });

  it("el proceso que los carga termina solo y sin la base: no recibe `DATABASE_URL` y nada lo deja vivo", () => {
    expect({
      database: run.database,
      status: run.status,
      signal: run.signal,
      timedOut: run.timedOut,
    }).toEqual({ database: false, status: 0, signal: null, timedOut: false });
  });

  it("cada excepción nombra una sola vez algo de lo que se carga y trae su razón en una frase", () => {
    expectReasonedOnce(EXCEPTIONS, ({ entry }) => entry);
    for (const exception of EXCEPTIONS) {
      expect([...modules, ...sources], exception.entry).toContain(exception.entry);
    }
  });
});

describe("lo que la lectura de los `import` sigue desde una entrada", () => {
  const file = (path: string, ...lines: string[]) => ({ path, text: lines.join("\n") });
  const SRC = [
    "src/db/client.ts",
    "src/jobs/backoff.ts",
    "src/modules/alpha/index.ts",
    "src/modules/alpha/schema.ts",
    "src/modules/alpha/ui/panel.tsx",
    "src/shared/copy/index.ts",
  ];

  it('anota cada archivo de `src` que una entrada carga: con `@/` o con una ruta relativa, con su extensión o sin ella, por un `index`, por un `export … from`, por un `import` suelto o por un `import("…")`', () => {
    const spec = file(
      "tests/e2e/a.spec.ts",
      'import { test } from "@playwright/test";',
      'import { readFileSync } from "node:fs";',
      'import { getDb } from "@/db/client";',
      'import { alpha } from "@/modules/alpha";',
      'import { t } from "../../src/shared/copy";',
      'import "@/modules/alpha/ui/panel.tsx";',
      'export * from "@/modules/alpha/schema";',
      'test("x", async () => {',
      '  const { MAX_ATTEMPTS } = await import("@/jobs/backoff");',
      "});",
    );

    expect(importClosure([spec], [spec.path], SRC)).toEqual({
      walked: [spec.path],
      leaves: SRC,
      unread: [],
    });
  });

  it("pasa por lo que la entrada importa de `tests/`, una sola vez por archivo aunque se importen en círculo, y no recorre lo que nadie importa", () => {
    const files = [
      file("playwright.config.ts", 'import { mode } from "./tests/e2e/server-mode";'),
      file("tests/e2e/server-mode.ts", 'export { seed } from "../factories";'),
      file(
        "tests/factories/index.ts",
        'import { getDb } from "@/db/client";',
        'import { mode } from "../e2e/server-mode";',
        'import data from "../fixtures/datos.json";',
      ),
      file("tests/integration/otra.test.ts", 'import { alpha } from "@/modules/alpha";'),
    ];

    expect(importClosure(files, ["playwright.config.ts"], SRC)).toEqual({
      walked: ["playwright.config.ts", "tests/e2e/server-mode.ts", "tests/factories/index.ts"],
      leaves: ["src/db/client.ts"],
      unread: [],
    });
  });

  it('no cuenta lo que el compilador borra: el `import type`, el `export type … from`, el `import` que solo trae tipos y el tipo escrito con `import("…")`', () => {
    const spec = file(
      "tests/e2e/a.spec.ts",
      'import type { Alpha } from "@/modules/alpha";',
      'import { type Row, type Table } from "@/modules/alpha/schema";',
      'export type { Panel } from "@/modules/alpha/ui/panel";',
      'export { type Copy } from "@/shared/copy";',
      'const db: import("@/db/client").Db = open();',
      // Con un nombre que no es un tipo, el `import` queda.
      'import { type Attempt, MAX_ATTEMPTS } from "@/jobs/backoff";',
    );

    expect(importClosure([spec], [spec.path], SRC).leaves).toEqual(["src/jobs/backoff.ts"]);
  });

  it("deja dicho lo que no pudo seguir: la ruta de la casa que no lleva a ningún archivo, la carga que no es un texto y la entrada que no le pasaron", () => {
    const spec = file(
      "tests/e2e/a.spec.ts",
      'import { gone } from "@/modules/alpha/domain/gone";',
      'import { helper } from "./no-existe";',
      "const loaded = await import(route);",
    );

    expect(importClosure([spec], [spec.path, "tests/e2e/b.spec.ts"], SRC)).toEqual({
      walked: [spec.path],
      leaves: [],
      unread: [
        { path: spec.path, specifier: "@/modules/alpha/domain/gone" },
        { path: spec.path, specifier: "./no-existe" },
        { path: spec.path, specifier: "import(…)" },
        { path: "tests/e2e/b.spec.ts", specifier: "tests/e2e/b.spec.ts" },
      ],
    });
  });
});
