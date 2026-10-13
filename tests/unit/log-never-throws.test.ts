import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  carriesQueryError,
  errorCode,
  printableError,
  withoutQueryValues,
} from "@/shared/lib/error-sanitizer";
import { logger } from "@/shared/log";
import { QUERY, untyped, VALUE } from "../helpers/log-fixtures";
import { captureLogs, errOf, type LoggedLine } from "../helpers/logs";

// DT-390, ADR-128 regla 2: el registro no lanza por lo que le piden anotar. Lanzaba con un `Error` cuyo
// `message` no es un texto cuando `DATABASE_URL` está escrita, que en producción es siempre: el recorte
// de los nombres de la conexión configurada le pedía `includes` a un número, a un objeto o a un nulo.
// La suite unitaria corre sin esa variable, así que cada prueba la escribe.

const USER = "usuario_sintetico";
const DATABASE = "base_sintetica";
const CONFIGURED = `postgres://${USER}:clave-sintetica@base-sintetica.internal:5432/${DATABASE}`;
const HIDDEN = "[oculto]";
const NOTICE = "registro: una línea no se pudo revisar y no se escribió";

const { error, info } = untyped;

/** Un error al que alguien le asignó después un `message` que no es un texto. */
function withMessage(message: unknown): Error {
  const failed = new Error("mensaje de origen");
  Object.assign(failed, { message });
  return failed;
}

/** Un error cuyo `message` lanza al leerlo. */
function withUnreadableMessage(): Error {
  return Object.defineProperty(new Error("mensaje de origen"), "message", {
    get(): string {
      throw new Error("no me leas");
    },
  });
}

/** Un error que lanza con cualquier cosa que le pregunten. */
function unreadable(): Error {
  const refuse = (): never => {
    throw new Error("no me leas");
  };
  return new Proxy(new Error("mensaje de origen"), {
    get: refuse,
    has: refuse,
    ownKeys: refuse,
    getPrototypeOf: refuse,
    getOwnPropertyDescriptor: refuse,
  });
}

/** Las tres formas en que un error llega a una línea: bajo `err` con mensaje, solo, y bajo `err` sin mensaje. */
async function logged(make: () => Error): Promise<LoggedLine[]> {
  const { lines } = await captureLogs(async () => {
    logger.error({ err: make(), evento: "ev-1" }, "falló");
    error(make());
    error({ err: make() });
  });
  expect(lines).toHaveLength(3);
  return lines;
}

describe("con `DATABASE_URL` escrita, un error cuyo `message` no es un texto se registra sin lanzar", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", CONFIGURED);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["un número", 42, "42"],
    ["un objeto", { a: 1 }, "[object Object]"],
    ["un nulo", null, "null"],
    ["un símbolo", Symbol("s"), "Symbol(s)"],
    ["nada", undefined, ""],
  ])("%s: sale su texto en `err.message` y, si la línea llega sin mensaje, en `msg`", async (_label, message, text) => {
    const lines = await logged(() => withMessage(message));

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", text, text]);
    expect(lines[0]?.record.evento).toBe("ev-1");
    for (const line of lines) {
      expect(line.record.level).toBe(50);
      expect(errOf(line)).toMatchObject({ type: "Error", message: text });
      expect(typeof errOf(line).stack).toBe("string");
    }
  });

  it("ese texto sale ya recortado: sin los valores de la consulta y sin los nombres de la conexión configurada", async () => {
    const saying = (text: string) => ({ toString: () => text });
    const refused = await logged(() =>
      withMessage(saying(`too many connections for role "${USER}"`)),
    );
    const failedQuery = await logged(() =>
      Object.assign(withMessage(saying(`Failed query: ${QUERY}\nparams: ${VALUE}`)), {
        query: QUERY,
        params: [VALUE],
      }),
    );

    expect(refused.map(({ record }) => record.msg)).toEqual([
      "falló",
      `too many connections for role "${HIDDEN}"`,
      `too many connections for role "${HIDDEN}"`,
    ]);
    expect(failedQuery.map(({ record }) => record.msg)).toEqual([
      "falló",
      `Failed query: ${QUERY}`,
      `Failed query: ${QUERY}`,
    ]);
    for (const line of refused) {
      expect(line.line).not.toContain(USER);
      expect(errOf(line).message).toBe(`too many connections for role "${HIDDEN}"`);
    }
    for (const line of failedQuery) {
      expect(line.line).not.toContain(VALUE);
      expect(errOf(line).message).toBe(`Failed query: ${QUERY}`);
      expect(errOf(line)).not.toHaveProperty("params");
    }
  });

  it("una traza que no es un texto sale como su texto", async () => {
    const lines = await logged(() => Object.assign(new Error("mensaje"), { stack: 42 }));

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", "mensaje", "mensaje"]);
    for (const line of lines) {
      expect(errOf(line)).toMatchObject({
        type: "Error",
        message: "mensaje",
        stack: "42",
      });
    }
  });

  it("una causa cuyo `message` no es un texto no tumba la línea, cite o no un valor su código", async () => {
    const lines = await logged(
      () =>
        new Error("fuera", {
          cause: Object.assign(withMessage(42), { code: "22007" }),
        }),
    );

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", "fuera", "fuera"]);
    for (const line of lines) {
      expect(errOf(line)).toMatchObject({
        type: "Error",
        message: "fuera",
        code: "22007",
      });
    }
  });

  it.each([
    [
      "un objeto cuyo `toString` lanza",
      () =>
        withMessage({
          toString(): string {
            throw new Error("no me leas");
          },
        }),
    ],
    ["un objeto sin prototipo", () => withMessage(Object.create(null))],
    ["un `message` que lanza al leerlo", withUnreadableMessage],
  ])("%s no se escribe: sale oculto, y lo demás del error se lee", async (_label, make) => {
    const lines = await logged(() => Object.assign(make(), { code: "57P01" }));

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", HIDDEN, HIDDEN]);
    expect(lines[0]?.record.evento).toBe("ev-1");
    for (const line of lines) {
      expect(errOf(line)).toMatchObject({
        type: "Error",
        message: HIDDEN,
        code: "57P01",
      });
    }
  });

  it("un error de consulta cuyos valores no se dejan escribir sale sin mensaje ni traza, y sin ellos", async () => {
    const lines = await logged(() =>
      Object.assign(new Error(`Failed query: ${QUERY}\nparams: ${VALUE}`), {
        query: QUERY,
        params: [VALUE, Object.create(null)],
      }),
    );

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", HIDDEN, HIDDEN]);
    for (const line of lines) {
      expect(line.line).not.toContain(VALUE);
      expect(errOf(line)).toEqual({
        type: "Error",
        message: HIDDEN,
        stack: HIDDEN,
        query: QUERY,
      });
    }
  });

  it("un error congelado se escribe como cualquier otro", async () => {
    const lines = await logged(() =>
      Object.freeze(Object.assign(new Error("congelado"), { code: "57P01" })),
    );

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", "congelado", "congelado"]);
    for (const line of lines) {
      expect(errOf(line)).toMatchObject({
        type: "Error",
        message: "congelado",
        code: "57P01",
      });
      expect(errOf(line).stack).toContain("congelado");
    }
  });

  it("un error que no se deja leer sale oculto bajo `err`, y la línea conserva su mensaje y lo demás", async () => {
    const { lines } = await captureLogs(async () => {
      logger.error({ err: unreadable(), evento: "ev-1" }, "falló");
      // Pino recorre los errores agrupados antes del paso propio: con uno ilegible no queda ninguno.
      logger.error(
        { err: new AggregateError([new Error("leído"), unreadable()], "varios") },
        "falló",
      );
    });

    expect(lines.map(({ record }) => record)).toEqual([
      {
        level: 50,
        time: expect.any(Number),
        err: HIDDEN,
        evento: "ev-1",
        msg: "falló",
      },
      { level: 50, time: expect.any(Number), err: HIDDEN, msg: "falló" },
    ]);
  });

  it("la línea que no se puede revisar o que no se deja escribir no lanza: sale un aviso en su lugar, con su nivel", async () => {
    const { lines } = await captureLogs(async () => {
      error(unreadable());
      error({ err: unreadable() });
      info(
        {
          get dato(): string {
            throw new Error("no me leas");
          },
        },
        "falló",
      );
      logger.child({ pedido: "p-1" }).warn(unreadable());
    });

    expect(lines.map(({ record }) => record)).toEqual([
      { level: 50, time: expect.any(Number), msg: NOTICE },
      { level: 50, time: expect.any(Number), msg: NOTICE },
      { level: 30, time: expect.any(Number), msg: NOTICE },
      { level: 40, time: expect.any(Number), pedido: "p-1", msg: NOTICE },
    ]);
  });

  it("si lo que falla es el destino y no lo que se pidió anotar, ese fallo sale", () => {
    const target = logger as unknown as Record<symbol, { write(line: string): void } | undefined>;
    const original = target[pino.symbols.streamSym];
    const attempts: string[] = [];
    target[pino.symbols.streamSym] = {
      write(line) {
        attempts.push(line);
        throw new Error("el destino está cerrado");
      },
    };
    try {
      expect(() => logger.error({ evento: "ev-1" }, "falló")).toThrow("el destino está cerrado");
    } finally {
      target[pino.symbols.streamSym] = original;
    }

    // La línea, y después el aviso que habría salido en su lugar.
    expect(attempts.map((line) => (JSON.parse(line) as { msg: string }).msg)).toEqual([
      "falló",
      NOTICE,
    ]);
  });

  it("no le cambia nada al error que le pasan", async () => {
    const wrapped = Object.assign(
      new Error("mensaje de origen", {
        cause: Object.assign(new Error("dentro"), { code: "57P01" }),
      }),
      { message: 42 },
    );
    const failedQuery = Object.assign(withMessage(42), {
      query: QUERY,
      params: [VALUE],
    });
    const { lines } = await captureLogs(async () => {
      logger.error({ err: wrapped }, "falló");
      logger.error({ err: failedQuery }, "falló");
    });

    expect(lines.map((line) => errOf(line))).toMatchObject([
      { message: "42: dentro", code: "57P01" },
      { message: "42", query: QUERY },
    ]);
    expect(Object.hasOwn(wrapped, "code")).toBe(false);
    expect(wrapped.message).toBe(42);
    expect(failedQuery).toMatchObject({
      message: 42,
      query: QUERY,
      params: [VALUE],
    });
  });

  it("el recorte que se usa fuera del registro tampoco lanza: devuelve el texto, u oculto lo que no se deja leer", () => {
    const failed = withMessage(42);
    const cited = Object.assign(
      withMessage({ toString: () => `role "${USER}" is not permitted` }),
      {
        code: "28000",
      },
    );

    expect(withoutQueryValues(failed, failed.message)).toBe("42");
    expect(withoutQueryValues(cited, cited.message)).toBe(`role "${HIDDEN}" is not permitted`);
    expect(withoutQueryValues(unreadable(), "un texto")).toBe(HIDDEN);
    expect(printableError(failed).message).toBe("42");
    expect(printableError(unreadable()).message).toBe(HIDDEN);
  });
  it("interpolado donde va un texto sale como ya salía: su nombre y su texto", async () => {
    const { lines } = await captureLogs(async () => {
      for (const message of [42, { a: 1 }, null]) {
        logger.warn("falló %s", withMessage(message));
      }
    });

    expect(lines.map(({ record }) => record.msg)).toEqual([
      "falló Error: 42",
      "falló Error: [object Object]",
      "falló Error: null",
    ]);
  });
});

describe("sin `DATABASE_URL`, un error cuyo `message` no es un texto se escribe igual", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["un número", 42, "42"],
    ["un objeto", { a: 1 }, "[object Object]"],
    ["un nulo", null, "null"],
  ])("%s: `err` deja de salir vacío y `msg` deja de llevar el valor crudo", async (_label, message, text) => {
    const lines = await logged(() => withMessage(message));

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", text, text]);
    for (const line of lines) {
      expect(errOf(line)).toMatchObject({ type: "Error", message: text });
    }
  });
});

// DT-399, ADR-129 regla 5: un símbolo donde va el mensaje. Pino lo pasaba tal cual a la línea, que
// salía con `"msg":undefined` y dejaba de ser JSON. `captureLogs` lee cada línea como JSON, y con un
// destino que lanza sale el aviso en su lugar: acá el destino guarda el texto y lo lee la prueba.
describe("un símbolo donde va el mensaje de la línea", () => {
  function rawLines(run: () => void): string[] {
    const target = logger as unknown as Record<symbol, { write(line: string): void } | undefined>;
    const original = target[pino.symbols.streamSym];
    const lines: string[] = [];
    target[pino.symbols.streamSym] = {
      write(line) {
        lines.push(line);
      },
    };
    try {
      run();
    } finally {
      target[pino.symbols.streamSym] = original;
    }
    return lines;
  }

  it("se escribe como su texto, y la línea sigue siendo JSON", () => {
    const lines = rawLines(() => {
      error({ evento: "ev-1" }, Symbol("s"));
      error(Symbol("s"));
      error(undefined, Symbol());
      error({ err: new Error("del error") }, Symbol("s"));
    });

    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(line).not.toContain("undefined");
    }
    expect(lines.map((line) => JSON.parse(line) as Record<string, unknown>)).toMatchObject([
      { level: 50, evento: "ev-1", msg: "Symbol(s)" },
      { level: 50, msg: "Symbol(s)" },
      { level: 50, msg: "Symbol()" },
      { level: 50, err: { message: "del error" }, msg: "Symbol(s)" },
    ]);
  });

  it("interpolado en el mensaje sale como ya salía", () => {
    const lines = rawLines(() => {
      info("van %s y %o", Symbol("s"), Symbol("s"));
    });

    expect(lines.map((line) => (JSON.parse(line) as { msg: string }).msg)).toEqual([
      "van Symbol(s) y undefined",
    ]);
  });
});

// DT-394, ADR-129 regla 6: lo que el registro todavía podía lanzar. `logger.child` lanzaba si lo que
// le piden fijar no se deja leer: pino lo serializa al crear el hijo, y por ahí no pasa ningún paso
// propio. Y `errorCode` y `carriesQueryError`, que no escriben nada, leían el error sin red.
describe("un logger hijo y las dos lecturas del error tampoco lanzan", () => {
  /** `logger.child` sin los tipos de pino, que no admiten cualquier cosa por lo que se fija. */
  const child = (parent: typeof logger, bindings: unknown) =>
    parent.child(bindings as pino.Bindings);

  const refuse = (): never => {
    throw new Error("no me leas");
  };

  /** Un objeto que lanza con cualquier cosa que le pregunten. */
  const unreadableObject = () =>
    new Proxy(
      { pedido: "p-1" },
      {
        get: refuse,
        has: refuse,
        ownKeys: refuse,
        getPrototypeOf: refuse,
        getOwnPropertyDescriptor: refuse,
      },
    );

  /** Un objeto con una clave que lanza al leerla. */
  const withUnreadableKey = () => ({
    pedido: "p-1",
    get dato(): string {
      return refuse();
    },
  });

  it("`logger.child` no lanza con un objeto sin prototipo, con una clave que lanza al leerla ni con un `Proxy`: fija lo que se deja leer, y oculto lo que no", async () => {
    const { lines } = await captureLogs(async () => {
      child(logger, Object.assign(Object.create(null), { pedido: "p-1" })).warn("sin prototipo");
      child(logger, withUnreadableKey()).warn("una clave que lanza");
      child(logger, unreadableObject()).warn("un proxy");
      child(logger, undefined).warn("nada que fijar");
      child(child(logger, { pedido: "p-1" }), withUnreadableKey()).warn("un nieto");
    });

    expect(lines.map(({ record }) => record)).toEqual([
      { level: 40, time: expect.any(Number), pedido: "p-1", msg: "sin prototipo" },
      {
        level: 40,
        time: expect.any(Number),
        pedido: "p-1",
        dato: HIDDEN,
        msg: "una clave que lanza",
      },
      { level: 40, time: expect.any(Number), msg: "un proxy" },
      { level: 40, time: expect.any(Number), msg: "nada que fijar" },
      { level: 40, time: expect.any(Number), pedido: "p-1", dato: HIDDEN, msg: "un nieto" },
    ]);
  });

  it("`setBindings`, que fija por el mismo camino, tampoco lanza", async () => {
    const { lines } = await captureLogs(async () => {
      const fixed = child(logger, { pedido: "p-1" });
      fixed.setBindings(withUnreadableKey());
      fixed.warn("sigue");
    });

    expect(lines.map(({ record }) => record)).toEqual([
      { level: 40, time: expect.any(Number), pedido: "p-1", dato: HIDDEN, msg: "sigue" },
    ]);
  });

  it("una clave `hasOwnProperty` en lo que le piden fijar no tumba a `child` ni a `setBindings`: esa clave no se fija, y las demás sí", async () => {
    const { lines } = await captureLogs(async () => {
      child(logger, { hasOwnProperty: "x", pedido: "p-1" }).warn("un hijo");
      // Un objeto llano que se deja leer, como llega de un texto de afuera.
      child(logger, JSON.parse('{"hasOwnProperty":1,"pedido":"p-2"}')).warn("de un texto");
      const fixed = child(logger, { pedido: "p-3" });
      fixed.setBindings({ hasOwnProperty: 1, intento: 2 });
      fixed.warn("sigue");
    });

    expect(lines.map(({ record }) => record)).toEqual([
      { level: 40, time: expect.any(Number), pedido: "p-1", msg: "un hijo" },
      { level: 40, time: expect.any(Number), pedido: "p-2", msg: "de un texto" },
      { level: 40, time: expect.any(Number), pedido: "p-3", intento: 2, msg: "sigue" },
    ]);
  });

  it("lo que se pasa por opciones al crear un hijo es configuración, no lo que se pide anotar: sigue lanzando", () => {
    const withOptions = (options: unknown) => () =>
      logger.child({ pedido: "p-1" }, options as pino.ChildLoggerOptions);

    expect(withOptions({ level: "no-existe" })).toThrow("unknown level no-existe");
    expect(withOptions(Object.create(null))).toThrow("options.hasOwnProperty is not a function");
  });

  it("lo que un hijo fija y se deja leer sale como salía: el error recortado, las claves ocultas y las que pino reserva", async () => {
    const { lines } = await captureLogs(async () => {
      child(logger, {
        pedido: "p-1",
        err: Object.assign(new Error(`Failed query: ${QUERY}\nparams: ${VALUE}`), {
          query: QUERY,
          params: [VALUE],
        }),
        token: "t-1",
        cuenta: { password: "p-1", intento: 2 },
        sinValor: undefined,
        level: "reservada",
      }).warn("sigue");
      child(logger, { err: unreadable() }).warn("un error ilegible");
    });

    expect(lines.map(({ record }) => record)).toEqual([
      {
        level: 40,
        time: expect.any(Number),
        pedido: "p-1",
        err: {
          type: "Error",
          message: `Failed query: ${QUERY}`,
          stack: expect.any(String),
          query: QUERY,
        },
        token: HIDDEN,
        cuenta: { password: HIDDEN, intento: 2 },
        msg: "sigue",
      },
      { level: 40, time: expect.any(Number), err: HIDDEN, msg: "un error ilegible" },
    ]);
  });

  it("`errorCode` no lanza con un error que no se deja leer: no hay código que dar", () => {
    const withUnreadableCode = () =>
      Object.defineProperty(new Error("falló"), "code", { get: refuse });

    expect(errorCode(withUnreadableCode())).toBeUndefined();
    expect(errorCode(new Error("fuera", { cause: withUnreadableCode() }))).toBeUndefined();
    expect(errorCode(unreadable())).toBeUndefined();
    expect(errorCode(new Error("fuera", { cause: unreadable() }))).toBeUndefined();
    // Y el que se deja leer sigue dando el suyo, o el de su causa.
    expect(errorCode(Object.assign(new Error("falló"), { code: "57P01" }))).toBe("57P01");
    expect(
      errorCode(new Error("fuera", { cause: Object.assign(new Error("dentro"), { code: -61 }) })),
    ).toBe(-61);
  });

  // `onRequestError` registra solo el error de consulta (`src/instrumentation.ts`). Qué más registra es
  // la decisión abierta 42: el error que no se deja leer queda del lado de lo que hoy no se registra.
  it("`carriesQueryError` no lanza con un error que no se deja leer: no cuenta como un error de consulta (decisión abierta 42)", () => {
    const failedQuery = () =>
      Object.assign(new Error(`Failed query: ${QUERY}\nparams: ${VALUE}`), {
        query: QUERY,
        params: [VALUE],
      });

    expect(carriesQueryError(unreadable())).toBe(false);
    expect(carriesQueryError(new Error("fuera", { cause: unreadable() }))).toBe(false);
    expect(
      carriesQueryError(Object.defineProperty(new Error("falló"), "query", { get: refuse })),
    ).toBe(false);
    // Y el que se deja leer sigue contando, él o su causa.
    expect(carriesQueryError(failedQuery())).toBe(true);
    expect(carriesQueryError(new Error("fuera", { cause: failedQuery() }))).toBe(true);
    expect(carriesQueryError(new Error("otro"))).toBe(false);
  });
});
