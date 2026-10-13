import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// El `index.ts` de un módulo no lo carga solo Next. También lo carga, en Node y sin Next, la E2E
// entera: `scripts/test-e2e.ts` lanza Playwright con `node --conditions=react-server` y sin tsx, y
// las pruebas llegan a los módulos por la fábrica. El cargador de Playwright resuelve los paquetes
// con la regla de Node para ESM, y `next` no trae mapa `exports`: un `import` estático de
// `next/headers` no resuelve, la E2E se queda sin pruebas que correr, y ni el lint, ni los tipos, ni
// las unitarias lo ven, porque Vitest sí lo resuelve (DT-379, ADR-128 regla 6). Lo que necesita Next
// se importa dentro de la función que lo usa, como `writeSessionCookie` (ADR-127 regla 6).
//
// Esta prueba los carga de verdad: un solo proceso hijo importa el `index.ts` de cada módulo de
// `src/modules` y dice cuál falló y con qué error, que nombra el import que no resolvió y el archivo
// que lo pide. El hijo usa tsx, como los scripts de `package.json`, y debajo un paso que deja en
// firme la respuesta de Node. Hace falta porque tsx la relaja: cuando Node dice que un paquete no
// resuelve, tsx vuelve a pedirlo con la extensión puesta, y con tsx solo esta prueba no cae (medido
// con tsx 4.23: por eso los scripts de `package.json` sí cargan con ese import). Con el `import`
// sembrado arriba de `session-cookie.ts`, este hijo y el cargador de Playwright 1.62 dieron lo mismo
// el 2026-10-13: caen `identity` y `wallet`, que lo carga por `identity`, con el mismo error.
//
// El hijo no recibe `DATABASE_URL`: no hay base que abrir, y ningún `index.ts` abre una conexión al
// importarse (medido también con la base escrita). Tarda menos de un segundo.
//
// `EXCEPTIONS` es para el `index.ts` que no carga sin Next a propósito, con su razón. Nace vacía:
// los catorce cargan. Antes de sumar uno, mirá si el import puede ir dentro de la función.

interface Exception {
  module: string;
  /** Por qué ese `index.ts` necesita Next al cargarse, en una frase. */
  reason: string;
}

const EXCEPTIONS: Exception[] = [];

const root = process.cwd();
const MARK = "@@carga@@";
const CONTROL = "control";

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

beforeAll(() => {
  modules = moduleNames();
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
      ...modules.map((name): [string, string] => [name, `src/modules/${name}/index.ts`]),
      [CONTROL, control],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90_000);

describe("el index.ts de cada módulo, cargado en Node sin Next", () => {
  it("carga: fuera de la lista de excepciones ninguno falla, y la excepción que ya carga sobra", () => {
    const failed = Object.fromEntries(
      run.loaded.flatMap(({ name, error }) =>
        name === CONTROL || error === null ? [] : [[name, readable(error)]],
      ),
    );
    const listed = EXCEPTIONS.map(({ module }) => module);

    expect({
      noCargan: Object.fromEntries(
        Object.entries(failed).filter(([name]) => !listed.includes(name)),
      ),
      sobran: listed.filter((name) => !(name in failed)).sort(),
    }).toEqual({ noCargan: {}, sobran: [] });
  });

  it("se cargan todos los módulos de `src/modules`, uno por uno y sin saltarse ninguno", () => {
    expect(modules.length).toBeGreaterThan(0);
    expect(run.loaded.map(({ name }) => name)).toEqual([...modules, CONTROL]);
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

  it("cada excepción nombra un módulo una sola vez y trae su razón en una frase", () => {
    expect(new Set(EXCEPTIONS.map(({ module }) => module)).size).toBe(EXCEPTIONS.length);
    for (const exception of EXCEPTIONS) {
      expect(modules, exception.module).toContain(exception.module);
      expect(exception.reason, exception.module).toMatch(/^\p{Lu}[^\n]{40,}\.$/u);
    }
  });
});
