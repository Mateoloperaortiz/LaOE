import { describe, expect, it } from "vitest";
import { logger } from "@/shared/log";
import { captureLogs, type LoggedLine } from "../helpers/logs";

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

function errOf(entry: LoggedLine | undefined): Record<string, unknown> {
  return (entry?.record.err ?? {}) as Record<string, unknown>;
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
