import { describe, expect, it } from "vitest";
import { logger } from "@/shared/log";
import { captureLogs, errOf, type LoggedLine } from "../helpers/logs";

// DT-381, incisos (c) y (d), ADR-128 regla 3: dos formas de error por las que los valores de una
// consulta todavía llegaban al registro. El error que escribe su propio `toJSON` y cuelga de un objeto
// interpolado salía por él. Y lo que tiene forma de error sin serlo (un objeto con un texto por
// `message`, que es lo que pino serializa como un error) no se recortaba: ni en `err`, ni en el `msg`
// de la línea sin mensaje, ni doblado como causa dentro de un `Error`.

const VALUE = "miembro-481516@example.test";
const QUERY = "select id from person where email = $1";
const FAILED_QUERY = `Failed query: ${QUERY}`;

const queryError = () =>
  Object.assign(new Error(`${FAILED_QUERY}\nparams: ${VALUE}`), {
    query: QUERY,
    params: [VALUE],
  });

/** Un error de consulta que escribe su propio `toJSON`, y ahí sus valores. */
const selfWritten = () =>
  Object.assign(queryError(), {
    toJSON: () => ({ name: "Error", params: [VALUE] }),
  });

/** Lo mismo, con el `toJSON` en la clase y un código. */
class SelfWrittenError extends Error {
  code = "57P01";

  toJSON(): unknown {
    return { name: "SelfWrittenError", params: [VALUE] };
  }
}

/** Un error de consulta que no es un `Error`: como llega de otro contexto de ejecución. */
const plainQueryError = () => ({
  message: `${FAILED_QUERY}\nparams: ${VALUE}`,
  query: QUERY,
  params: [VALUE],
});

/** `logger.info` y `logger.error` sin los tipos de pino. */
const info = logger.info.bind(logger) as (...args: unknown[]) => void;
const error = logger.error.bind(logger) as (...args: unknown[]) => void;

async function written(run: () => void): Promise<LoggedLine[]> {
  const { lines } = await captureLogs(async () => run());
  return lines;
}

describe("el error que escribe su propio `toJSON` y cuelga de un objeto interpolado", () => {
  it.each([
    "%o",
    "%O",
    "%j",
  ])("con %s deja solo su código, como el que no lo escribe, y no sus valores", async (placeholder) => {
    const lines = await written(() => {
      info(`falló ${placeholder}`, { err: selfWritten() });
      info(`falló ${placeholder}`, { err: new SelfWrittenError("mensaje") });
      info(`falló ${placeholder}`, { a: { b: [selfWritten()] }, intento: 2 });
      info(`falló ${placeholder}`, [new SelfWrittenError("mensaje"), selfWritten()]);
    });

    expect(lines.map(({ record }) => record.msg)).toEqual([
      'falló {"err":{}}',
      'falló {"err":{"code":"57P01"}}',
      'falló {"a":{"b":[{}]},"intento":2}',
      'falló [{"code":"[oculto]"},{}]',
    ]);
    for (const { line } of lines) {
      expect(line).not.toContain(VALUE);
    }
  });

  it("el error que devuelve el `toJSON` de otro objeto sigue saliendo solo con su código, y lo que no es un error sale por su `toJSON`", async () => {
    const lines = await written(() => {
      logger.warn("falló %o", { fallo: { toJSON: () => queryError() }, intento: 2 });
      logger.warn("falló %o", {
        err: new Error("mensaje"),
        pase: { toJSON: () => ({ datos: 1 }) },
        cuando: new Date("2026-10-13T15:00:00.000Z"),
      });
      logger.warn("falló %s", { err: selfWritten() });
    });

    expect(lines.map(({ record }) => record.msg)).toEqual([
      'falló {"fallo":{},"intento":2}',
      'falló {"err":{},"pase":{"datos":1},"cuando":"2026-10-13T15:00:00.000Z"}',
      "falló [object Object]",
    ]);
  });
});

describe("lo que tiene forma de error sin serlo, bajo `err`", () => {
  it("la línea sin mensaje toma su mensaje ya recortado, y su `err` sale sin los valores", async () => {
    const lines = await written(() => {
      error({ err: plainQueryError() });
      error({
        err: { message: `invalid input syntax for type date: "${VALUE}"`, code: "22007" },
      });
      error({
        err: {
          message: "connect ECONNREFUSED 10.0.0.5:5432",
          code: "ECONNREFUSED",
          syscall: "connect",
          address: "10.0.0.5",
          port: 5432,
        },
      });
    });

    expect(lines.map(({ record }) => record.msg)).toEqual([
      FAILED_QUERY,
      'invalid input syntax for type date: "[oculto]"',
      "connect ECONNREFUSED [oculto]",
    ]);
    expect(lines.map((line) => errOf(line))).toEqual([
      { type: "Object", message: FAILED_QUERY, stack: "", query: QUERY },
      {
        type: "Object",
        message: 'invalid input syntax for type date: "[oculto]"',
        stack: "",
        code: "22007",
      },
      {
        type: "Object",
        message: "connect ECONNREFUSED [oculto]",
        stack: "",
        code: "ECONNREFUSED",
        syscall: "connect",
      },
    ]);
    for (const { line } of lines) {
      expect(line).not.toContain(VALUE);
      expect(line).not.toContain("10.0.0.5");
    }
  });

  it("con mensaje, su `err` sale recortado igual", async () => {
    const lines = await written(() => {
      logger.error({ err: plainQueryError(), evento: "ev-1" }, "falló");
    });

    expect(lines.map(({ record }) => record)).toEqual([
      {
        level: 50,
        time: expect.any(Number),
        err: { type: "Object", message: FAILED_QUERY, stack: "", query: QUERY },
        evento: "ev-1",
        msg: "falló",
      },
    ]);
  });

  it("como causa de un `Error`, lo que pino dobla en su mensaje sale sin los valores", async () => {
    const lines = await written(() => {
      logger.error({ err: new Error("fuera", { cause: plainQueryError() }) }, "falló");
      error({ err: new Error("fuera", { cause: plainQueryError() }) });
    });

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", "fuera"]);
    for (const line of lines) {
      expect(errOf(line)).toMatchObject({ type: "Error", message: `fuera: ${FAILED_QUERY}` });
      expect(line.line).not.toContain(VALUE);
    }
  });

  it("lo que no tiene un texto por `message` no tiene forma de error y sale como salía", async () => {
    const lines = await written(() => {
      error({ err: { message: 42 } });
      error({ err: { detalle: "sin mensaje" } });
      error({ message: "una línea con un campo `message` no es un error", query: QUERY });
    });

    expect(lines.map(({ record }) => record)).toEqual([
      { level: 50, time: expect.any(Number), err: { message: 42 }, msg: 42 },
      { level: 50, time: expect.any(Number), err: { detalle: "sin mensaje" } },
      {
        level: 50,
        time: expect.any(Number),
        message: "una línea con un campo `message` no es un error",
        query: QUERY,
      },
    ]);
  });
});

// DT-399, ADR-129 regla 5: el recorte miraba la raíz de `err` y sus causas con forma de error, hasta
// cinco niveles, y el valor de una consulta salía si el error que lo trae colgaba de otro campo del
// error, de su lista `errors` o de un objeto del error, o si era una causa más honda o una función.
// Estos casos fijaban por dónde salía; ahora dicen que no sale, y abajo queda lo que todavía sale.
describe("lo que cuelga de un error registrado se recorta como un error (DT-399)", () => {
  /** Las rutas de la línea escrita en las que aparece el valor de la consulta. */
  function placesOf(value: unknown, path = ""): string[] {
    if (typeof value === "string") {
      return value.includes(VALUE) ? [path] : [];
    }
    if (typeof value !== "object" || value === null) {
      return [];
    }
    return Object.entries(value).flatMap(([key, inner]) =>
      placesOf(inner, path ? `${path}.${key}` : key),
    );
  }

  /** Un error de consulta como causa de causa, `levels` veces. */
  function buried(levels: number): Error {
    let current: Error = queryError();
    for (let level = levels; level > 0; level -= 1) {
      current = new Error(`nivel ${level}`, { cause: current });
    }
    return current;
  }

  /** Un error con `fields` colgando. */
  const carrying = (fields: Record<string, unknown>) => Object.assign(new Error("fuera"), fields);

  /** Como sale un error de consulta ya recortado. */
  const TRIMMED = {
    type: "Error",
    message: FAILED_QUERY,
    stack: expect.any(String) as unknown,
    query: QUERY,
  };

  it.each([
    [
      "que cuelga de un campo del error que no es `cause`",
      () => ({ err: carrying({ original: queryError() }) }),
    ],
    [
      "en la lista `errors` de un error que no es un `AggregateError`",
      () => ({ err: carrying({ errors: [queryError()] }) }),
    ],
    [
      "dentro de un objeto que cuelga del error",
      () => ({ err: carrying({ detail: { failures: [queryError()] } }) }),
    ],
    [
      "dentro de un objeto del error, a cinco niveles",
      () => ({ err: carrying({ n1: { n2: { n3: { n4: queryError() } } } }) }),
    ],
    ["como causa a más de cinco niveles", () => ({ err: buried(6) })],
    ["como causa a veinte niveles", () => ({ err: buried(20) })],
    ["como causa que es una función", () => ({ err: carrying({ cause: () => queryError() }) })],
    [
      "como causa de la causa que es una función",
      () => ({
        err: carrying({
          cause: () => new Error("dentro", { cause: queryError() }),
        }),
      }),
    ],
  ])("un error de consulta %s sale sin sus valores", async (_title, line) => {
    const [entry] = await written(() => error(line(), "falló"));

    expect(entry?.record.msg).toBe("falló");
    expect(placesOf(entry?.record)).toEqual([]);
  });

  it("lo que cuelga sigue saliendo: como un error, sin lo que el recorte quita, y la lista `errors` una sola vez", async () => {
    const detail = { failures: [queryError()], intento: 2 };
    const [entry] = await written(() =>
      error(
        {
          err: carrying({
            original: queryError(),
            errors: [queryError()],
            detail,
          }),
        },
        "falló",
      ),
    );

    expect(errOf(entry)).toEqual({
      type: "Error",
      message: "fuera",
      stack: expect.any(String),
      aggregateErrors: [TRIMMED],
      original: TRIMMED,
      detail: { failures: [TRIMMED], intento: 2 },
    });
    // Lo que le pasaron al registro queda como llegó: lo que se recorta es una copia.
    expect(detail.failures[0]).toBeInstanceOf(Error);
    expect(detail.failures[0]).toMatchObject({ query: QUERY, params: [VALUE] });
  });

  it("lo que cuelga de un error y no trae ninguno sale como salía", async () => {
    const [entry] = await written(() =>
      error(
        {
          err: carrying({
            cause: "un texto",
            detail: {
              intento: 2,
              pasos: ["a", { b: 1 }, null],
              cuando: new Date("2026-10-13T15:00:00.000Z"),
            },
          }),
        },
        "falló",
      ),
    );

    expect(errOf(entry)).toEqual({
      type: "Error",
      message: "fuera",
      stack: expect.any(String),
      cause: "un texto",
      detail: {
        intento: 2,
        pasos: ["a", { b: 1 }, null],
        cuando: "2026-10-13T15:00:00.000Z",
      },
    });
  });

  it("dos errores que se nombran uno al otro salen una vez cada uno, como los escribe pino, y recortados", async () => {
    const first = Object.assign(new Error("primero"), { code: "57P01" });
    const second = Object.assign(queryError(), { other: first });
    Object.assign(first, { other: second });
    const [entry] = await written(() => error({ err: first }, "falló"));

    expect(errOf(entry)).toEqual({
      type: "Error",
      message: "primero",
      stack: expect.any(String),
      code: "57P01",
      other: TRIMMED,
    });
  });

  it("el error que vuelve a aparecer dentro de lo que cuelga de él no se escribe otra vez", async () => {
    const failed = queryError();
    Object.assign(failed, { detail: { owner: failed, intento: 2 } });
    const [entry] = await written(() => error({ err: failed }, "falló"));

    expect(errOf(entry)).toEqual({
      ...TRIMMED,
      detail: { owner: "[Circular]", intento: 2 },
    });
  });

  // Lo que el recorte todavía no alcanza: fija por dónde sale hoy el valor. Quien cierre uno de estos
  // caminos va a ver caer su caso, y cambia lo que espera.
  it.each([
    [
      "como causa asignada cuyo `message` no es un texto",
      () => ({
        err: carrying({
          cause: { message: 42, query: QUERY, params: [VALUE] },
        }),
      }),
      ["err.cause.params.0"],
    ],
    [
      "bajo una clave de la línea que no es `err`",
      () => ({ failure: queryError() }),
      ["failure.params.0"],
    ],
    [
      "dentro de un objeto del error, a más de cinco niveles",
      () => ({
        err: carrying({ n1: { n2: { n3: { n4: { n5: queryError() } } } } }),
      }),
      ["err.n1.n2.n3.n4.n5.params.0"],
    ],
    [
      "en lo que escribe el `toJSON` de un objeto del error",
      () => ({
        err: carrying({
          detail: { toJSON: () => ({ failure: queryError() }) },
        }),
      }),
      ["err.detail.failure.params.0"],
    ],
  ])("todavía sale el valor de un error de consulta %s", async (_title, line, places) => {
    const [entry] = await written(() => error(line(), "falló"));

    expect(placesOf(entry?.record)).toEqual(places);
  });

  it.each([
    ["en la raíz", () => queryError()],
    ["como causa", () => new Error("fuera", { cause: queryError() })],
    ["como causa a cinco niveles", () => buried(4)],
  ])("y donde el recorte ya miraba sigue sin salir: %s", async (_title, err) => {
    const [entry] = await written(() => error({ err: err() }, "falló"));

    expect(placesOf(entry?.record)).toEqual([]);
  });
});
