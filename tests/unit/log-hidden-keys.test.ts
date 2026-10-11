import { describe, expect, it } from "vitest";
import { logger } from "@/shared/log";
import { captureLogs, type LoggedLine } from "../helpers/logs";

// Cada forma en que una de las cuatro claves ocultas llega al registro, y qué se perdona en cada
// lugar (ADR-118 regla 23, ADR-119 regla 14, ADR-120 regla 9). Es la caracterización de la redacción:
// quedó fijada en el ciclo 11 antes de quitarle a pino las rutas con comodín (DT-305) y de dejar un
// solo recorrido de claves (DT-312). Las líneas se leen ya serializadas, como salen del proceso.

const KEYS = ["password", "token", "code", "secret"] as const;
const SECRET = "valor-sintetico-481516";
const HIDDEN = '"[oculto]"';
const ESCAPED_HIDDEN = '\\"[oculto]\\"';

/** `logger.info` con el formato en una variable: los tipos de pino lo leen solo de un literal. */
const info = logger.info.bind(logger) as (...args: unknown[]) => void;

/** Las cuatro claves con el valor que no puede salir, y una vecina que sí. */
const secrets = () => ({
  ...(Object.fromEntries(KEYS.map((key) => [key, SECRET])) as Record<
    (typeof KEYS)[number],
    string
  >),
  otro: "se-queda",
});

async function written(run: () => void): Promise<LoggedLine[]> {
  const { lines } = await captureLogs(async () => run());
  return lines;
}

function errOf(entry: LoggedLine | undefined): Record<string, unknown> {
  return (entry?.record.err ?? {}) as Record<string, unknown>;
}

describe("cada forma en que una clave oculta llega al registro", () => {
  it("en la línea: sueltas, con una clave encima, en una lista y más abajo", async () => {
    const lines = await written(() => {
      logger.info(secrets(), "primer nivel");
      logger.info({ cuenta: secrets() }, "segundo nivel");
      logger.info({ lote: [secrets()] }, "en una lista");
      logger.info({ a: { b: [{ c: secrets() }] } }, "más abajo");
    });

    expect(lines).toHaveLength(4);
    for (const { line } of lines) {
      expect(line).not.toContain(SECRET);
      expect(line.split(HIDDEN)).toHaveLength(KEYS.length + 1);
      expect(line).toContain('"otro":"se-queda"');
    }
  });

  it("en lo que fija un logger hijo, y en lo que fija el hijo de un hijo", async () => {
    const lines = await written(() => {
      logger.child(secrets()).info("hijo");
      logger
        .child({ pedido: secrets() })
        .child({ intento: { detalle: secrets() } })
        .info("nieto");
    });

    expect(lines[0]?.line.split(HIDDEN)).toHaveLength(KEYS.length + 1);
    expect(lines[1]?.line.split(HIDDEN)).toHaveLength(2 * KEYS.length + 1);
    for (const { line } of lines) {
      expect(line).not.toContain(SECRET);
      expect(line).toContain('"otro":"se-queda"');
    }
  });

  it("dentro de un error se lee su código y el de cada error que agrupa, y nada más de lo oculto", async () => {
    const attempt = () =>
      Object.assign(new Error("intento"), {
        code: "ECONNREFUSED",
        token: SECRET,
        response: { code: SECRET, estado: 503 },
      });
    const err = Object.assign(new AggregateError([attempt(), attempt()], "todos fallaron"), {
      code: "ECONNREFUSED",
      password: SECRET,
      response: { data: { code: SECRET, secret: SECRET, estado: 401 } },
    });
    const lines = await written(() => {
      logger.error({ err }, "falló");
    });

    expect(lines[0]?.line).not.toContain(SECRET);
    expect(errOf(lines[0])).toMatchObject({
      code: "ECONNREFUSED",
      password: "[oculto]",
      response: { data: { code: "[oculto]", secret: "[oculto]", estado: 401 } },
      aggregateErrors: [
        { code: "ECONNREFUSED", token: "[oculto]", response: { code: "[oculto]", estado: 503 } },
        { code: "ECONNREFUSED", token: "[oculto]", response: { code: "[oculto]", estado: 503 } },
      ],
    });
  });

  it("bajo `code`, un valor que no es un texto ni un número no es un código, tampoco en un error agrupado", async () => {
    const lines = await written(() => {
      logger.error({ err: Object.assign(new Error("falló"), { code: true }) }, "falló");
      logger.error(
        { err: new AggregateError([Object.assign(new Error("intento"), { code: true })], "falló") },
        "falló",
      );
    });

    expect(errOf(lines[0]).code).toBe("[oculto]");
    expect(errOf(lines[1]).aggregateErrors).toMatchObject([{ code: "[oculto]" }]);
  });

  it("el código se perdona solo donde va un error: no en una lista bajo `err`, ni en un `err` más abajo, ni en lo que un error traiga colgado", async () => {
    const lines = await written(() => {
      logger.error({ err: [{ code: SECRET, otro: "se-queda" }] }, "una lista donde va el error");
      logger.error({ contexto: { err: { code: SECRET } } }, "un err más abajo");
      logger.error(
        {
          err: Object.assign(new Error("falló"), {
            code: "57P01",
            err: { code: SECRET },
            aggregateErrors: { code: SECRET },
          }),
        },
        "colgado de un error",
      );
      logger.error(
        { err: { code: "57P01", aggregateErrors: [[{ code: SECRET }], { code: "ECONNRESET" }] } },
        "una lista dentro de la lista de errores",
      );
    });

    for (const { line } of lines) {
      expect(line).not.toContain(SECRET);
    }
    expect(lines[0]?.record.err).toEqual([{ code: "[oculto]", otro: "se-queda" }]);
    expect(lines[1]?.record.contexto).toEqual({ err: { code: "[oculto]" } });
    expect(errOf(lines[2])).toMatchObject({
      code: "57P01",
      err: { code: "[oculto]" },
      aggregateErrors: { code: "[oculto]" },
    });
    expect(errOf(lines[3])).toEqual({
      code: "57P01",
      aggregateErrors: [[{ code: "[oculto]" }], { code: "ECONNRESET" }],
    });
  });

  it.each([
    "%o",
    "%O",
    "%j",
  ])("en un objeto que se interpola en el mensaje con %s: sueltas y con una clave encima, con objeto de línea o sin él", async (placeholder) => {
    const lines = await written(() => {
      info(`pedido ${placeholder}`, { ...secrets(), cuenta: secrets() });
      logger.info({ evento: "ev-1" }, `pedido ${placeholder}`, { ...secrets(), cuenta: secrets() });
    });

    expect(lines).toHaveLength(2);
    for (const { line, record } of lines) {
      expect(line).not.toContain(SECRET);
      expect(line.split(ESCAPED_HIDDEN)).toHaveLength(2 * KEYS.length + 1);
      expect(String(record.msg)).toContain('"otro":"se-queda"');
    }
    expect(lines[1]?.record.evento).toBe("ev-1");
  });

  it("en un objeto interpolado, el código de su `err` se lee y cualquier otro no", async () => {
    const lines = await written(() => {
      logger.warn("falló %o", { err: { code: "ECONNRESET" }, code: SECRET });
    });

    expect(lines[0]?.line).not.toContain(SECRET);
    expect(String(lines[0]?.record.msg)).toContain('"err":{"code":"ECONNRESET"}');
  });

  it("las cabeceras de sesión de un request", async () => {
    const lines = await written(() => {
      logger.info(
        { req: { headers: { cookie: SECRET, authorization: SECRET, accept: "text/html" } } },
        "request",
      );
    });

    expect(lines[0]?.record.req).toEqual({
      headers: { cookie: "[oculto]", authorization: "[oculto]", accept: "text/html" },
    });
  });
});
