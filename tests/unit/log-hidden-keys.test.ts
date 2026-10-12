import pino from "pino";
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

// DT-305, ADR-123 regla 15: pino ya no lleva rutas con comodín. Con ellas copiaba el valor de cada
// clave de primer nivel, y la copia de un `Buffer` no se deja serializar.
describe("un valor de primer nivel que no es una clave oculta sale como es", () => {
  const AB = { type: "Buffer", data: [97, 98] };

  it("un Buffer en el primer nivel de una línea sale con su contenido, igual que más abajo", async () => {
    const lines = await written(() => {
      logger.info({ adjunto: Buffer.from("ab"), sobre: { adjunto: Buffer.from("ab") } }, "archivo");
    });

    expect(lines[0]?.record).toMatchObject({ adjunto: AB, sobre: { adjunto: AB } });
    expect(lines[0]?.line).not.toContain("unable to serialize");
  });

  it("también en lo que fija un logger hijo y al lado de una clave oculta, que sigue oculta", async () => {
    const lines = await written(() => {
      logger
        .child({ adjunto: Buffer.from("ab") })
        .info(
          { token: SECRET, cuando: new Date("2026-10-11T15:00:00.000Z"), otro: Buffer.from("ab") },
          "archivo",
        );
    });

    expect(lines[0]?.record).toMatchObject({
      adjunto: AB,
      token: "[oculto]",
      cuando: "2026-10-11T15:00:00.000Z",
      otro: AB,
    });
    expect(lines[0]?.line).not.toContain(SECRET);
  });
});

// Sin las rutas con comodín, lo que se interpola en el mensaje lo revisa el registro antes de que pino
// lo escriba (ADR-123 regla 15): a cualquier profundidad, y ya no solo en los dos primeros niveles.
describe("lo que se interpola en el mensaje, a cualquier profundidad", () => {
  it.each([
    "%o",
    "%O",
    "%j",
  ])("con %s, las claves ocultas a tres niveles o más, en una lista y en lo que un objeto escribe con su `toJSON`", async (placeholder) => {
    const lines = await written(() => {
      info(`pedido ${placeholder}`, {
        a: { b: { c: secrets() } },
        lote: [{ entrega: [secrets()] }],
        pase: { toJSON: () => ({ datos: { enlace: secrets() } }) },
      });
    });

    expect(lines[0]?.line).not.toContain(SECRET);
    expect(lines[0]?.line.split(ESCAPED_HIDDEN)).toHaveLength(3 * KEYS.length + 1);
    expect(String(lines[0]?.record.msg)).toContain('"otro":"se-queda"');
  });

  it("un objeto interpolado que no se puede revisar no se escribe", async () => {
    const loop: Record<string, unknown> = { a: { b: { token: SECRET } } };
    loop.yo = loop;
    const lines = await written(() => {
      logger.info("pedido %o", loop);
    });

    expect(lines[0]?.line).not.toContain(SECRET);
    expect(lines[0]?.record.msg).toBe("pedido '[oculto]'");
  });

  it("lo que no trae una clave oculta se interpola igual que antes", async () => {
    const lines = await written(() => {
      logger.info("pedido %o", {
        a: { b: { c: 1 } },
        cuando: new Date("2026-10-11T15:00:00.000Z"),
      });
      logger.info({ evento: "ev-1" }, "van %d de %s, %o", 3, "cinco", null);
    });

    expect(lines[0]?.record.msg).toBe(
      'pedido {"a":{"b":{"c":1}},"cuando":"2026-10-11T15:00:00.000Z"}',
    );
    expect(lines[1]?.record).toMatchObject({ evento: "ev-1", msg: "van 3 de cinco, null" });
  });
});

// DT-347: las dos cabeceras de sesión llegan al registro por tres caminos, y solo el de la línea
// tenía prueba (arriba, «las cabeceras de sesión de un request»). Los otros dos quedaron fijados en el
// ciclo 15 sobre las rutas `req.headers.cookie` y `req.headers.authorization` de pino, antes de
// pasarle esa parte al paso propio (ADR-127 regla 9).
describe("las dos cabeceras de sesión, por cada camino por donde llegan al registro", () => {
  const sessionHeaders = () => ({ cookie: SECRET, authorization: SECRET, accept: "text/html" });
  const HIDDEN_HEADERS = { cookie: "[oculto]", authorization: "[oculto]", accept: "text/html" };

  it("en el `req` que fija un logger hijo, y en el que fija el hijo de un hijo", async () => {
    const lines = await written(() => {
      logger.child({ req: { headers: sessionHeaders() } }).info("hijo");
      logger
        .child({ pedido: "p-1" })
        .child({ req: { headers: sessionHeaders() } })
        .info("nieto");
    });

    expect(lines).toHaveLength(2);
    for (const { line, record } of lines) {
      expect(line).not.toContain(SECRET);
      expect(record.req).toEqual({ headers: HIDDEN_HEADERS });
    }
    expect(lines[1]?.record.pedido).toBe("p-1");
  });

  it.each([
    "%o",
    "%O",
    "%j",
  ])("en el `req` de un objeto que se interpola en el mensaje con %s, con objeto de línea o sin él", async (placeholder) => {
    const lines = await written(() => {
      info(`request ${placeholder}`, { req: { headers: sessionHeaders() } });
      info({ evento: "ev-1" }, `request ${placeholder}`, { req: { headers: sessionHeaders() } });
    });

    expect(lines).toHaveLength(2);
    for (const { line, record } of lines) {
      expect(line).not.toContain(SECRET);
      expect(record.msg).toBe(`request ${JSON.stringify({ req: { headers: HIDDEN_HEADERS } })}`);
    }
    expect(lines[1]?.record.evento).toBe("ev-1");
  });

  it("valgan lo que valgan: un nulo, un texto vacío, un objeto o una lista", async () => {
    const lines = await written(() => {
      logger.info(
        { req: { headers: { cookie: null, authorization: "", accept: "*/*" } } },
        "vacías",
      );
      logger.info(
        {
          req: { headers: { cookie: { sesion: SECRET }, authorization: [SECRET], accept: "*/*" } },
        },
        "con forma",
      );
    });

    expect(lines).toHaveLength(2);
    for (const { line, record } of lines) {
      expect(line).not.toContain(SECRET);
      expect(record.req).toEqual({
        headers: { cookie: "[oculto]", authorization: "[oculto]", accept: "*/*" },
      });
    }
  });

  // El límite de hoy, no un deseo: las dos cabeceras se ocultan donde las ocultaban las rutas de pino,
  // con `req` suelto en la línea, en lo que fija un logger hijo o en la raíz de lo que se interpola.
  // Ampliarlo es cambiar una regla y va con su ADR.
  it("solo bajo `req.headers` y con `req` suelto: en cualquier otro lugar `cookie` y `authorization` no son claves ocultas", async () => {
    const ELSEWHERE = "fuera-de-req-headers";
    const headers = () => ({ cookie: ELSEWHERE, authorization: ELSEWHERE });
    const lines = await written(() => {
      logger.info(headers(), "sueltas en la línea");
      logger.info({ headers: headers() }, "unas cabeceras sin req");
      logger.info({ req: headers() }, "en un req, fuera de sus cabeceras");
      logger.info({ pedido: { req: { headers: headers() } } }, "un req más abajo");
      logger.info({ req: [{ headers: headers() }] }, "una lista donde va el req");
      logger.info({ req: { headers: [headers()] } }, "una lista donde van las cabeceras");
      logger.info({ err: { req: { headers: headers() } } }, "un req colgado de err");
      logger.child({ pedido: { req: { headers: headers() } } }).info("un req más abajo en un hijo");
      logger.info("sin req %o", { headers: headers() });
      logger.info("un req más abajo %o", { pedido: { req: { headers: headers() } } });
      logger.info("una lista %o", [{ req: { headers: headers() } }]);
    });

    expect(lines).toHaveLength(11);
    for (const { line } of lines) {
      expect(line.split(ELSEWHERE)).toHaveLength(3);
      expect(line).not.toContain("[oculto]");
    }
  });
});

// DT-347: lo que sale de un `Error` que se interpola en el mensaje, con cada marcador. Quedó fijado en
// el ciclo 15 antes de cambiar el error por lo que dice de sí mismo (ADR-127 regla 8): como texto, su
// nombre y su mensaje; como objeto, nada, porque un error no trae campos propios que se enumeren.
describe("un `Error` que se interpola en el mensaje", () => {
  it.each([
    ["%s", "Error: mensaje", "TypeError: mensaje", "Error: fuera"],
    ["%o", "{}", "{}", "{}"],
    ["%O", "{}", "{}", "{}"],
    ["%j", "{}", "{}", "{}"],
    ["%d", "NaN", "NaN", "NaN"],
  ])("con %s sale su nombre y su mensaje donde va un texto, y vacío donde va un objeto", async (placeholder, plain, typed, wrapping) => {
    const lines = await written(() => {
      info(`falló ${placeholder}`, new Error("mensaje"));
      info(`falló ${placeholder}`, new TypeError("mensaje"));
      info(`falló ${placeholder}`, new Error("fuera", { cause: new Error("dentro") }));
      info({ evento: "ev-1" }, `falló ${placeholder}`, new Error("mensaje"));
    });

    expect(lines.map(({ record }) => record.msg)).toEqual([
      `falló ${plain}`,
      `falló ${typed}`,
      `falló ${wrapping}`,
      `falló ${plain}`,
    ]);
    expect(lines[3]?.record.evento).toBe("ev-1");
  });
});

// DT-347, inciso (b), ADR-127 regla 8: lo interpolado que es un `Error` se cambia por lo que el error
// dice de sí mismo, su nombre y su mensaje ya recortado. Antes, si su JSON nombraba una clave oculta,
// se cambiaba por una copia plana, que con `%s` sale «[object Object]»; y si no, pasaba como llegó,
// con los valores de su consulta en el mensaje y en `params`.
describe("un `Error` interpolado no escribe nada de lo que trae colgado", () => {
  const VALUE = "miembro-481516@example.test";
  const QUERY = "select id from person where email = $1";
  const queryError = () =>
    Object.assign(new Error(`Failed query: ${QUERY}\nparams: ${VALUE}`), {
      query: QUERY,
      params: [VALUE],
    });
  const conversionError = () =>
    Object.assign(new Error(`invalid input syntax for type date: "${VALUE}"`), { code: "22007" });

  it.each([
    ["%s", "Error: mensaje"],
    ["%o", "{}"],
    ["%O", "{}"],
    ["%j", "{}"],
  ])("con %s, un `Error` con `code` propio, con otro campo o con una clave oculta sale igual que sin ellos", async (placeholder, plain) => {
    const lines = await written(() => {
      info(`falló ${placeholder}`, Object.assign(new Error("mensaje"), { code: "57P01" }));
      info(`falló ${placeholder}`, Object.assign(new Error("mensaje"), { status: 503 }));
      info(
        `falló ${placeholder}`,
        Object.assign(new Error("mensaje"), { token: SECRET, response: { code: SECRET } }),
      );
      info(
        { evento: "ev-1" },
        `falló ${placeholder}`,
        Object.assign(new Error("mensaje"), { code: 7 }),
      );
    });

    expect(lines.map(({ record }) => record.msg)).toEqual(
      Array.from({ length: 4 }, () => `falló ${plain}`),
    );
    expect(lines[3]?.record.evento).toBe("ev-1");
  });

  it.each([
    "%s",
    "%o",
    "%O",
    "%j",
  ])("con %s, un error de consulta no deja sus valores en el mensaje, ni el de una conversión el valor que cita", async (placeholder) => {
    const lines = await written(() => {
      info(`falló ${placeholder}`, queryError());
      info(`falló ${placeholder}`, conversionError());
      info(
        { evento: "ev-1" },
        `falló ${placeholder} y ${placeholder}`,
        queryError(),
        conversionError(),
      );
    });

    expect(lines).toHaveLength(3);
    for (const { line } of lines) {
      expect(line).not.toContain(VALUE);
    }
  });

  it("como texto, el error de consulta conserva su SQL y el de una conversión lo que rechazó, sin el valor", async () => {
    const lines = await written(() => {
      logger.warn("falló %s", queryError());
      logger.warn("falló %s", conversionError());
      logger.warn("falló %s", new Error("no se pudo leer", { cause: queryError() }));
    });

    expect(lines.map(({ record }) => record.msg)).toEqual([
      `falló Error: Failed query: ${QUERY}`,
      'falló Error: invalid input syntax for type date: "[oculto]"',
      "falló Error: no se pudo leer",
    ]);
  });
});

// DT-347, inciso (a), ADR-127 regla 9: pino copia entero el valor de una clave de primer nivel que
// tenga una ruta anidada, y la copia de un `Buffer` no se deja serializar. Le quedaban tres, bajo
// `err` y `req`. Salieron: el código de `err` y las dos cabeceras de sesión los decide el paso propio.
describe("pino se queda con las cuatro claves sueltas, y `err` y `req` salen como cualquier otra clave", () => {
  const AB = { type: "Buffer", data: [97, 98] };
  const sessionHeaders = () => ({ cookie: SECRET, authorization: SECRET, accept: "text/html" });

  it("un Buffer como `err` de una línea sale con su contenido", async () => {
    const lines = await written(() => {
      logger.error({ err: Buffer.from("ab") }, "falló");
    });

    expect(lines[0]?.record.err).toEqual(AB);
    expect(lines[0]?.line).not.toContain("unable to serialize");
  });

  it("un Buffer como `req` de una línea, o del que fija un logger hijo, sale con su contenido", async () => {
    const lines = await written(() => {
      logger.info({ req: Buffer.from("ab") }, "request");
      logger.child({ req: Buffer.from("ab") }).info("hijo");
    });

    expect(lines).toHaveLength(2);
    for (const { line, record } of lines) {
      expect(record.req).toEqual(AB);
      expect(line).not.toContain("unable to serialize");
    }
  });

  it("la redacción de pino no tiene ninguna ruta anidada: solo conoce las cuatro claves sueltas", () => {
    const stringifiers = (logger as unknown as Record<symbol, Record<string, unknown>>)[
      pino.symbols.stringifiersSym
    ];

    expect(Object.keys(stringifiers ?? {}).sort()).toEqual([...KEYS].sort());
  });

  it("las dos cabeceras se ocultan también cuando el `req` o sus cabeceras se escriben con su `toJSON`", async () => {
    const lines = await written(() => {
      logger.info({ req: { toJSON: () => ({ headers: sessionHeaders() }) } }, "request");
      logger.info({ req: { headers: { toJSON: () => sessionHeaders() } } }, "cabeceras");
    });

    expect(lines).toHaveLength(2);
    for (const { line, record } of lines) {
      expect(line).not.toContain(SECRET);
      expect(record.req).toEqual({
        headers: { cookie: "[oculto]", authorization: "[oculto]", accept: "text/html" },
      });
    }
  });
});
