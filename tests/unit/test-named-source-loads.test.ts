import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type UnnamedLoad, unnamedSourceLoads } from "../../scripts/lib/test-suite-metrics";

// Una prueba que carga un archivo de `src` con `import("…")` nombra lo que toma:
// `const { nombre } = await import("…")`. Si no, knip da por usado el archivo entero y deja de avisar
// de un export sin uso (DT-384, ADR-128 regla 5): así se quedó `NotAuthenticatedError` (ADR-127
// regla 12). Por eso esta prueba lee el código de `tests/` y no admite, fuera de su lista de
// excepciones:
//
// - la `lectura`: un miembro leído sobre la carga, `(await import("…")).nombre`;
// - el archivo `entero`: la carga que no llega a un nombre. La que algo esparce,
//   `...(await import("…"))`; la que una función devuelve, como la fábrica de
//   `vi.mock("…", async () => await import("…"))`; la que se pasa como argumento, se asigna, se
//   guarda sin `await` o queda suelta; la que no va escrita tal cual, con un paréntesis o un cambio
//   de tipo de por medio, y la variable que la guarda si después se usa entera, se le lee un miembro
//   con una clave que no es un texto (`ruta[metodo]`) o se desestructura con resto.
//
// Lo mismo vale para el `import` estático, que es otro camino al mismo efecto: sale como `entero` el
// `import * as` al que no se le lee ningún miembro por nombre, y el `export * from`.
//
// Pasan solo las formas con las que knip sigue marcando: `unnamedSourceLoads` las enumera, con lo
// que se midió. La lectura es sobre el árbol que arma el compilador: una forma escrita dentro de una
// cadena, como las de más abajo, no cuenta.
//
// `EXCEPTIONS` nace con una, la carga que solo corre el archivo que registra los handlers. Antes de
// sumar otra, nombrá lo que la prueba toma; la lista es para la carga que de verdad no puede, con su
// razón.

interface Exception {
  path: string;
  form: UnnamedLoad["form"];
  /** El archivo de `src`, como lo escribe la prueba. */
  specifier: string;
  /** Cuántas cargas de esa forma y de ese archivo quedan en la prueba. */
  loads: number;
  /** Por qué no puede nombrar lo que toma, en una frase. */
  reason: string;
}

const EXCEPTIONS: Exception[] = [
  {
    path: "tests/integration/outbox.test.ts",
    form: "entero",
    specifier: "@/jobs/handlers",
    loads: 1,
    reason:
      "Carga el archivo para que corra y registre los handlers de cada módulo: no toma nada de él y no hay nombre que escribir.",
  },
];

/** Los archivos de código de `tests/`: los casos, su preparación y sus ayudantes. */
function sources(dir: string) {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
    .sort()
    .map((file) => ({ path: `${dir}/${file}`, text: readFileSync(join(dir, file), "utf8") }));
}

const named = ({ path, form, specifier }: Omit<Exception, "loads" | "reason">) =>
  `${path} › ${form} › ${specifier}`;

/** Lo que la lista no tiene y lo que le sobra, contando cada forma de cada archivo. */
function drift(found: UnnamedLoad[], exceptions: Exception[]) {
  const counted: Record<string, number> = {};
  for (const load of found) {
    counted[named(load)] = (counted[named(load)] ?? 0) + 1;
  }
  const listed = Object.fromEntries(exceptions.map((item) => [named(item), item.loads]));
  const more = (a: Record<string, number>, b: Record<string, number>) =>
    Object.keys(a)
      .filter((key) => (a[key] ?? 0) > (b[key] ?? 0))
      .sort();
  return { sinNombrar: more(counted, listed), sobran: more(listed, counted) };
}

/** Lo que la lectura encuentra en una prueba de unitarias con ese texto. */
function loadsIn(text: string, path = "tests/unit/sintetica.test.ts") {
  return unnamedSourceLoads([{ path, text }]).map(({ form, specifier }) => `${form} ${specifier}`);
}

describe("lo que las pruebas cargan de src", () => {
  it("va con nombre: fuera de la lista de excepciones no queda una lectura sobre la carga ni un archivo esparcido o devuelto entero", () => {
    expect(drift(unnamedSourceLoads(sources("tests")), EXCEPTIONS)).toEqual({
      sinNombrar: [],
      sobran: [],
    });
  });

  it("cada excepción está una sola vez en la lista y trae su razón en una frase", () => {
    expect(new Set(EXCEPTIONS.map(named)).size).toBe(EXCEPTIONS.length);
    for (const exception of EXCEPTIONS) {
      expect(exception.reason, named(exception)).toMatch(/^\p{Lu}[^\n]{40,}\.$/u);
    }
  });

  it("una carga que la lista no tiene la pone en rojo, y una excepción que sobra también", () => {
    const load = {
      path: "tests/unit/a.test.ts",
      form: "lectura" as const,
      specifier: "@/shared/a",
    };
    const exception = { ...load, loads: 1, reason: "" };

    expect(drift([load], [])).toEqual({ sinNombrar: [named(load)], sobran: [] });
    expect(drift([], [exception])).toEqual({ sinNombrar: [], sobran: [named(load)] });
    expect(drift([load], [exception])).toEqual({ sinNombrar: [], sobran: [] });
    // La cuenta es por forma y por archivo: una segunda lectura no entra con la excepción de la primera.
    expect(drift([load, load], [exception])).toEqual({ sinNombrar: [named(load)], sobran: [] });
    expect(drift([load], [{ ...exception, loads: 2 }])).toEqual({
      sinNombrar: [],
      sobran: [named(load)],
    });
  });

  it("rechaza el miembro leído sobre la carga: con await o sin él, por punto, por corchetes o por then", () => {
    expect(
      loadsIn(
        [
          'vi.mock("@/modules/alpha", async () => ({',
          '  used: (await import("@/modules/alpha/domain/things")).used,',
          "}));",
          'const viaBrackets = (await import("@/shared/kit"))["used"];',
          'const viaThen = await import("@/shared/lib/dates").then((dates) => dates.addDays);',
          'const typed = ((await import("@/shared/log")) as { logger: unknown }).logger;',
        ].join("\n"),
      ),
    ).toEqual([
      "lectura @/modules/alpha/domain/things",
      "lectura @/shared/kit",
      "lectura @/shared/lib/dates",
      "lectura @/shared/log",
    ]);
  });

  it("rechaza el archivo entero: el que algo esparce y el que una función devuelve, sea o no la fábrica de un vi.mock y con await o sin él", () => {
    expect(
      loadsIn(
        [
          'vi.mock("@/modules/alpha", async () => ({',
          '  ...(await import("@/modules/alpha/domain/things")),',
          "  other: 1,",
          "}));",
          'vi.mock("@/shared/kit", async () => await import("@/shared/kit/types"));',
          'vi.mock("@/shared/brand", () => import("@/shared/brand/feed"));',
          'vi.doMock("@/modules/beta", async () => {',
          '  return await import("@/modules/beta/domain/things");',
          "});",
          'const copy = { ...(await import("@/shared/lib/dates")) };',
          'const load = () => import("@/shared/log");',
        ].join("\n"),
      ),
    ).toEqual([
      "entero @/modules/alpha/domain/things",
      "entero @/shared/kit/types",
      "entero @/shared/brand/feed",
      "entero @/modules/beta/domain/things",
      "entero @/shared/lib/dates",
      "entero @/shared/log",
    ]);
  });

  it("rechaza la carga que no llega a un nombre: la que se pasa como argumento, ella o su promesa; la que se asigna a una variable ya declarada; la que se guarda sin await; la suelta, que solo corre el archivo, y la de una lista que no se desestructura con nombres", () => {
    expect(
      loadsIn(
        [
          'const keys = Object.keys(await import("@/shared/kit/types"));',
          'await expect(import("@/modules/alpha/domain/things")).resolves.toBeDefined();',
          'let later: typeof import("@/modules/beta/domain/pure");',
          'later = await import("@/modules/beta/domain/pure");',
          'const pending = import("@/shared/log");',
          'await import("@/jobs/handlers");',
          'const [first] = await Promise.all([import("@/shared/lib/dates")]);',
          'const all = await Promise.all([import("@/db/client")]);',
        ].join("\n"),
      ),
    ).toEqual([
      "entero @/shared/kit/types",
      "entero @/modules/alpha/domain/things",
      "entero @/modules/beta/domain/pure",
      "entero @/shared/log",
      "entero @/jobs/handlers",
      "entero @/shared/lib/dates",
      "entero @/db/client",
    ]);
  });

  it("rechaza la carga guardada en una variable que después se usa entera: esparcida, pasada como argumento, también desde un bloque de adentro, devuelta o metida en un objeto", () => {
    expect(
      loadsIn(
        [
          'vi.mock("@/shared/kit", async () => {',
          '  const types = await import("@/shared/kit/types");',
          "  return { ...types, Pagination: () => null };",
          "});",
          'const dates = await import("@/shared/lib/dates");',
          'it("la usa adentro", () => {',
          "  expect(Object.keys(dates)).toEqual([]);",
          "});",
          'vi.mock("@/shared/brand", async () => {',
          '  const feed = await import("@/shared/brand/feed");',
          "  return feed;",
          "});",
          'const log = await import("@/shared/log");',
          "const held = { log };",
        ].join("\n"),
      ),
    ).toEqual([
      "entero @/shared/kit/types",
      "entero @/shared/lib/dates",
      "entero @/shared/brand/feed",
      "entero @/shared/log",
    ]);
  });

  it("no rechaza la carga que nombra lo que toma: la desestructuración, también con resto; la variable a la que solo se le leen miembros o que se desestructura después; la lista desestructurada con nombres, y vi.importActual o importOriginal", () => {
    expect(
      loadsIn(
        [
          'vi.mock("@/modules/alpha", async (importOriginal) => {',
          '  const { used } = await import("@/modules/alpha/domain/things");',
          '  const { first, ...rest } = await import("@/modules/alpha/domain/more");',
          '  return { ...(await importOriginal<typeof import("@/modules/alpha")>()), used, first, rest };',
          "});",
          'const route = await import("@/app/api/v1/the-games/hub/route");',
          'const response = await route.GET(new Request("http://casa.test"));',
          'const viaBrackets = route["POST"];',
          "const viaTemplate = route[`PUT`];",
          "const optional = route?.DELETE;",
          "const { OPTIONS } = route;",
          "let same: typeof route;",
          'const annotated: typeof import("@/shared/kit") = await import("@/shared/kit");',
          "annotated.used;",
          // El nombre de un miembro que se llama igual no es la variable.
          "const other = { route: 1 }.route;",
          'const [{ getPool }, { logger }] = await Promise.all([import("@/db/client"), import("@/shared/log")]);',
          'const pure = await vi.importActual<typeof import("@/modules/beta/domain/pure")>(',
          '  "@/modules/beta/domain/pure",',
          ");",
          'const spread = { ...(await vi.importActual("@/modules/beta/domain/pure")) };',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("rechaza la variable que guarda la carga si se le lee un miembro con una clave que no es un texto, aunque además se le lea otro por nombre; si se desestructura con resto, o si sale exportada", () => {
    expect(
      loadsIn(
        [
          'const route = await import("@/app/api/v1/the-games/hub/route");',
          'it.each(["GET", "POST"] as const)("responde a %s", async (method) => {',
          '  await route[method](new Request("http://casa.test"));',
          "});",
          'const kit = await import("@/shared/kit/types");',
          "use(kit.used, kit[key as keyof typeof kit]);",
          'const dates = await import("@/shared/lib/dates");',
          "const { addDays, ...others } = dates;",
          'const log = await import("@/shared/log");',
          "export { log };",
          'const feed = await import("@/shared/brand/feed");',
          "export { feed as brand };",
        ].join("\n"),
      ),
    ).toEqual([
      "entero @/app/api/v1/the-games/hub/route",
      "entero @/shared/kit/types",
      "entero @/shared/lib/dates",
      "entero @/shared/log",
      "entero @/shared/brand/feed",
    ]);
  });

  it("no toma por la variable el nombre con el que otro archivo o la prueba exportan otra cosa", () => {
    expect(
      loadsIn(
        [
          'const route = await import("@/app/api/v1/the-games/hub/route");',
          "await route.GET();",
          "const other = 1;",
          "export { other as route };",
          'export { route } from "../helpers/routes";',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("rechaza la carga que no va escrita tal cual: con un paréntesis, un cambio de tipo o un ! de por medio, se desestructure, se guarde o venga en una lista", () => {
    expect(
      loadsIn(
        [
          'const { used } = (await import("@/modules/alpha/domain/things")) as { used: unknown };',
          'const { other } = (await import("@/modules/alpha/domain/more"));',
          'const { sure } = (await import("@/shared/kit"))!;',
          'const { fits } = (await import("@/shared/kit/csv")) satisfies object;',
          'const { inside } = await (import("@/shared/lib/dates") as Promise<{ inside: unknown }>);',
          'const typed = (await import("@/shared/log")) as typeof import("@/shared/log");',
          "typed.logger;",
          'const [{ getPool }] = (await Promise.all([import("@/db/client")])) as [{ getPool: unknown }];',
          'const [{ feed }] = await Promise.all([import("@/shared/brand/feed") as Promise<{ feed: unknown }>]);',
        ].join("\n"),
      ),
    ).toEqual([
      "entero @/modules/alpha/domain/things",
      "entero @/modules/alpha/domain/more",
      "entero @/shared/kit",
      "entero @/shared/kit/csv",
      "entero @/shared/lib/dates",
      "entero @/shared/log",
      "entero @/db/client",
      "entero @/shared/brand/feed",
    ]);
  });

  it("rechaza el import * as de un archivo de src al que no se le lee ningún miembro por nombre: el que solo va de argumento, como en vi.spyOn; el esparcido; el guardado en otra variable; el que solo se usa de tipo, y el que nadie usa", () => {
    expect(
      loadsIn(
        [
          'import * as passes from "@/modules/alpha/domain/passes";',
          'import * as kit from "@/shared/kit/types";',
          'import * as instrumentation from "@/instrumentation";',
          'import type * as shapes from "@/shared/kit/csv";',
          'import * as idle from "@/shared/brand/feed";',
          'vi.spyOn(passes, "record").mockRejectedValueOnce(new Error("fallo"));',
          "use({ ...kit });",
          "const found: Module = instrumentation;",
          "await found.onRequestError?.();",
          "let shape: typeof shapes;",
        ].join("\n"),
      ),
    ).toEqual([
      "entero @/modules/alpha/domain/passes",
      "entero @/shared/kit/types",
      "entero @/instrumentation",
      "entero @/shared/kit/csv",
      "entero @/shared/brand/feed",
    ]);
  });

  it("rechaza el import * as con un miembro leído por nombre si además se le lee otro con una clave que no es un texto, se guarda en otra variable, se desestructura con resto o se esparce", () => {
    expect(
      loadsIn(
        [
          'import * as ledger from "@/modules/alpha/domain/ledger";',
          'import * as badges from "@/modules/alpha/domain/badges";',
          'import * as log from "@/shared/log";',
          'import * as dates from "@/shared/lib/dates";',
          "use(ledger.credit, ledger[key as keyof typeof ledger]);",
          "use(badges.recompute);",
          "const other = badges;",
          "use(log.logger);",
          "const { withoutQueryValues, ...rest } = log;",
          "use(dates.addDays, { ...dates });",
        ].join("\n"),
      ),
    ).toEqual([
      "entero @/modules/alpha/domain/ledger",
      "entero @/modules/alpha/domain/badges",
      "entero @/shared/log",
      "entero @/shared/lib/dates",
    ]);
  });

  it("no rechaza el import * as al que se le lee un miembro por nombre, aunque además vaya entero como argumento de una llamada; el de un ayudante de las pruebas no lo mira", () => {
    expect(
      loadsIn(
        [
          'import * as adapter from "@/shared/adapters/apple-pass";',
          'import * as route from "@/app/api/v1/the-games/hub/route";',
          'import * as log from "@/shared/log";',
          'import * as records from "@/modules/alpha/domain/passes";',
          'import * as helpers from "../helpers/logs";',
          "const realSign = adapter.signPass;",
          'vi.spyOn(adapter, "signPass").mockImplementationOnce(realSign);',
          'await route.GET(new Request("http://casa.test"));',
          'use(route["POST"], route[`PUT`]);',
          "const { logger, markConnectionFailure } = log;",
          "let same: typeof log;",
          'vi.spyOn(records, "record").mockRejectedValueOnce(new Error("fallo"));',
          "expect(records.record).toHaveBeenCalled();",
          "use(helpers);",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("rechaza el reexporte entero de un archivo de src, export * from y export * as; el que va con nombres no", () => {
    expect(
      loadsIn(
        [
          'export * from "@/shared/kit/types";',
          'export * as csv from "@/shared/kit/csv";',
          'export { used } from "@/modules/alpha/domain/things";',
          'export * from "../helpers/logs";',
        ].join("\n"),
      ),
    ).toEqual(["entero @/shared/kit/types", "entero @/shared/kit/csv"]);
  });

  it("mira la variable en el bloque donde se declara: otra del mismo nombre en otro bloque no cuenta", () => {
    expect(
      loadsIn(
        [
          'it("carga la ruta", async () => {',
          '  const route = await import("@/app/api/v1/the-games/hub/route");',
          "  await route.GET();",
          "});",
          'it("arma una dirección", () => {',
          '  const route = "/api/v1/the-games/hub";',
          "  visit(route);",
          "});",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("solo mira los archivos de src, escritos con @/ o con una ruta relativa: un ayudante de las pruebas y un paquete no cuentan", () => {
    const text = [
      'const a = (await import("../../src/shared/log")).logger;',
      'const b = (await import("../helpers/logs")).captureLogs;',
      'const c = (await import("react")).createElement;',
      'const d = { ...(await import("./fixtures")) };',
    ].join("\n");

    expect(loadsIn(text)).toEqual(["lectura ../../src/shared/log"]);
    // La misma ruta desde otra carpeta ya no cae en `src`.
    expect(loadsIn(text, "tests/sintetica.test.ts")).toEqual([]);
  });
});
