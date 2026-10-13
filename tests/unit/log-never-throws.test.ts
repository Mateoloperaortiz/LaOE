import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/shared/log";
import { captureLogs, type LoggedLine } from "../helpers/logs";

// DT-390: lo que el registro hace HOY con un `Error` cuyo `message` no es un texto, fijado antes de
// corregirlo. Con `DATABASE_URL` escrita, que en producción es siempre, lanza: el recorte de los
// nombres de la conexión configurada le pide `includes` a un número, a un objeto o a un nulo. Sin ella
// no lanza y sale mal de otra manera. La suite unitaria corre sin esa variable, así que cada prueba la
// escribe.

const CONFIGURED =
  "postgres://usuario_sintetico:clave-sintetica@base-sintetica.internal:5432/base_sintetica";

/** `logger.error` sin los tipos de pino, que no admiten un error solo como línea. */
const error = logger.error.bind(logger) as (...args: unknown[]) => void;

/** Un error al que alguien le asignó después un `message` que no es un texto. */
function withMessage(message: unknown): Error {
  const failed = new Error("mensaje de origen");
  Object.assign(failed, { message });
  return failed;
}

function errOf(entry: LoggedLine | undefined): Record<string, unknown> {
  return (entry?.record.err ?? {}) as Record<string, unknown>;
}

const MESSAGES: [string, unknown][] = [
  ["un número", 42],
  ["un objeto", { a: 1 }],
  ["un nulo", null],
];

describe("hoy, con `DATABASE_URL` escrita, un error cuyo `message` no es un texto", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", CONFIGURED);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(
    MESSAGES,
  )("%s: bajo `err` y como línea sin mensaje, el registro lanza `TypeError` y no escribe nada", async (_label, message) => {
    const { lines } = await captureLogs(async () => {
      expect(() => logger.error({ err: withMessage(message) }, "falló")).toThrow(TypeError);
      expect(() => error(withMessage(message))).toThrow(TypeError);
      expect(() => error({ err: withMessage(message) })).toThrow(TypeError);
    });

    expect(lines).toEqual([]);
  });

  it("interpolado donde va un texto no lanza: sale su nombre y su texto", async () => {
    const { lines } = await captureLogs(async () => {
      for (const [, message] of MESSAGES) {
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

describe("hoy, sin `DATABASE_URL`, un error cuyo `message` no es un texto", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(
    MESSAGES,
  )("%s: no lanza, `err` sale vacío y la línea sin mensaje lleva el valor crudo en `msg`", async (_label, message) => {
    const { lines } = await captureLogs(async () => {
      logger.error({ err: withMessage(message) }, "falló");
      error(withMessage(message));
      error({ err: withMessage(message) });
    });

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", message, message]);
    for (const line of lines) {
      expect(errOf(line)).toEqual({});
    }
  });
});
