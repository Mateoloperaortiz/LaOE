import pino from "pino";
import { describe, expect, it } from "vitest";
import { serializeError, withoutQueryValues } from "@/shared/lib/error-sanitizer";
import { logger } from "@/shared/log";
import { QUERY, queryError, untyped, VALUE } from "../helpers/log-fixtures";
import { captureLogs, errOf, type LoggedLine } from "../helpers/logs";

// DT-381, incisos (c) y (d), ADR-128 regla 3: dos formas de error por las que los valores de una
// consulta todavía llegaban al registro. El error que escribe su propio `toJSON` y cuelga de un objeto
// interpolado salía por él. Y lo que tiene forma de error sin serlo (un objeto con un texto por
// `message`, que es lo que pino serializa como un error) no se recortaba: ni en `err`, ni en el `msg`
// de la línea sin mensaje, ni doblado como causa dentro de un `Error`.

const FAILED_QUERY = `Failed query: ${QUERY}`;

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

const { error, info } = untyped;

async function written(run: () => void): Promise<LoggedLine[]> {
  const { lines } = await captureLogs(async () => run());
  return lines;
}

/** Un error de consulta como causa de causa, `levels` veces. */
function buried(levels: number): Error {
  let current: Error = queryError();
  for (let level = levels; level > 0; level -= 1) {
    current = new Error(`nivel ${level}`, { cause: current });
  }
  return current;
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

  /** Un error con `fields` colgando. */
  const carrying = (fields: Record<string, unknown>) => Object.assign(new Error("fuera"), fields);

  /** Un error de consulta colgado del campo `original` de otro error, `levels` veces. */
  function hanging(levels: number): Error {
    let current: Error = queryError();
    for (let level = 0; level < levels; level += 1) {
      current = carrying({ original: current });
    }
    return current;
  }

  /** Algo que se escribe a sí mismo con el `toJSON` de su prototipo y trae un error en un campo propio. */
  const selfWrittenDetail = () =>
    Object.assign(
      Object.create({
        toJSON(this: { count: number }) {
          return { count: `${this.count} intentos` };
        },
      }) as object,
      { count: 2, failure: queryError() },
    );

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
      "dentro de un objeto de la lista `errors`",
      () => ({ err: carrying({ errors: [{ failure: queryError() }] }) }),
    ],
    [
      "dentro de una lista de la lista `errors`",
      () => ({ err: carrying({ errors: [[queryError()]] }) }),
    ],
    [
      "dentro de un objeto de la lista de un `AggregateError`",
      () => ({ err: new AggregateError([{ failure: queryError() }], "varios") }),
    ],
    [
      "en un campo propio del error que se llama `aggregateErrors`",
      () => ({ err: carrying({ aggregateErrors: [queryError()] }) }),
    ],
    ["por una cadena de campos de error, a cinco niveles", () => ({ err: hanging(4) })],
    [
      "dentro de un objeto que cuelga del error",
      () => ({ err: carrying({ detail: { failures: [queryError()] } }) }),
    ],
    [
      "dentro de un objeto del error, a cinco niveles",
      () => ({ err: carrying({ n1: { n2: { n3: { n4: queryError() } } } }) }),
    ],
    [
      "dentro de un objeto del error, a más de cinco niveles",
      () => ({
        err: carrying({ n1: { n2: { n3: { n4: { n5: queryError() } } } } }),
      }),
    ],
    ["por una cadena de campos de error, a más de cinco niveles", () => ({ err: hanging(5) })],
    [
      "en el resultado de un lote que cuelga del error, a seis niveles",
      () => ({
        err: carrying({
          detail: { batches: [{ results: [null, { reason: queryError() }] }] },
        }),
      }),
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

  it("lo que no tiene forma de error en la lista `errors` se recorre como cualquier lista, y un campo propio `aggregateErrors` también", async () => {
    const lines = await written(() => {
      error(
        {
          err: carrying({
            errors: [{ failure: queryError(), attempt: 2 }, [queryError()], "un texto"],
          }),
        },
        "falló",
      );
      error({ err: new AggregateError([{ failure: queryError() }], "varios") }, "falló");
      error({ err: carrying({ aggregateErrors: [queryError(), "un texto"] }) }, "falló");
    });

    expect(lines.map((line) => errOf(line))).toEqual([
      {
        type: "Error",
        message: "fuera",
        stack: expect.any(String),
        aggregateErrors: [{ failure: TRIMMED, attempt: 2 }, [TRIMMED], "un texto"],
      },
      {
        type: "AggregateError",
        message: "varios",
        stack: expect.any(String),
        aggregateErrors: [{ failure: TRIMMED }],
      },
      {
        type: "Error",
        message: "fuera",
        stack: expect.any(String),
        aggregateErrors: [TRIMMED, "un texto"],
      },
    ]);
  });

  it("lo que se escribe a sí mismo con `toJSON` sale por él: el recorte no entra a sus campos ni lo cambia por una copia", async () => {
    const [entry] = await written(() =>
      error({ err: carrying({ detail: selfWrittenDetail() }) }, "falló"),
    );

    expect(errOf(entry).detail).toEqual({ count: "2 intentos" });
  });

  it("un objeto llano con un texto por `message`, en una lista o en un objeto que cuelga del error, sale como un error: gana `type` y `stack`", async () => {
    const [entry] = await written(() =>
      error(
        {
          err: carrying({
            issues: [{ message: "Required", path: ["email"] }],
            detail: { last: { message: "Required", attempt: 2 } },
          }),
        },
        "falló",
      ),
    );

    expect(errOf(entry).issues).toEqual([
      { type: "Object", message: "Required", stack: "", path: ["email"] },
    ]);
    expect(errOf(entry).detail).toEqual({
      last: { type: "Object", message: "Required", stack: "", attempt: 2 },
    });
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

  it("un ciclo que pasa por la lista `errors` se corta igual: el agregado al que nombra uno de sus errores sale una vez, y el error que vuelve a aparecer en la lista sale `[Circular]`", async () => {
    const inner = queryError();
    const grouped = new AggregateError([inner], "varios");
    Object.assign(inner, { owner: grouped });
    const first = queryError();
    const second = carrying({ errors: [first] });
    Object.assign(first, { original: second });
    const [byList, byField] = await written(() => {
      error({ err: grouped }, "falló");
      error({ err: first }, "falló");
    });

    expect(errOf(byList)).toEqual({
      type: "AggregateError",
      message: "varios",
      stack: expect.any(String),
      aggregateErrors: [TRIMMED],
    });
    expect(errOf(byField)).toEqual({
      ...TRIMMED,
      original: {
        type: "Error",
        message: "fuera",
        stack: expect.any(String),
        aggregateErrors: ["[Circular]"],
      },
    });
    // Sin el corte cada error se repetía un nivel adentro del otro hasta desbordar la pila, y la
    // línea pasaba del mega.
    for (const entry of [byList, byField]) {
      expect(entry?.line.length).toBeLessThan(20_000);
    }
  });

  /** `leaf` dentro de `levels` objetos, uno adentro del otro, colgando del error. */
  function nested(levels: number, leaf: unknown): Error {
    let current = leaf;
    for (let level = 0; level < levels; level += 1) {
      current = { inner: current };
    }
    return carrying({ detail: current });
  }

  /** Lo que la línea trae al fondo de esos `levels` objetos. */
  function leafOf(entry: LoggedLine | undefined, levels: number): unknown {
    let current: unknown = errOf(entry).detail;
    for (let level = 0; level < levels; level += 1) {
      current = (current as { inner?: unknown } | undefined)?.inner;
    }
    return current;
  }

  it("lo que cuelga se recorre hasta cien niveles contando el error, y lo que queda más adentro no se mira: sale oculto, traiga o no un error", async () => {
    const [within, beyond, plain] = await written(() => {
      // El error, 98 objetos y la hoja: cien niveles.
      error({ err: nested(98, queryError()) }, "falló");
      error({ err: nested(99, queryError()) }, "falló");
      error({ err: nested(99, { intento: 2 }) }, "falló");
    });

    expect(leafOf(within, 98)).toEqual(TRIMMED);
    expect(leafOf(beyond, 99)).toBe("[oculto]");
    expect(leafOf(plain, 99)).toBe("[oculto]");
    expect([within, beyond, plain].flatMap((entry) => placesOf(entry?.record))).toEqual([]);
  });

  it("lo que cuelga se recorre una vez por objeto, aunque los objetos se nombren todos entre sí", () => {
    let reads = 0;
    const nodes = Array.from({ length: 8 }, () =>
      Object.defineProperty({} as Record<string, unknown>, "leido", {
        enumerable: true,
        get: () => {
          reads += 1;
          return true;
        },
      }),
    );
    for (const [index, node] of nodes.entries()) {
      for (const [other, target] of nodes.entries()) {
        if (other !== index) {
          node[`n${other}`] = target;
        }
      }
    }

    serializeError(carrying({ red: nodes[0] }));

    // Ocho objetos, ocho lecturas. Siguiendo cada camino que no repite un objeto serían más de trece
    // mil con ocho, y con veinte no terminaría: el registro colgaría a quien registra un error que
    // trae, por ejemplo, una respuesta con sus sockets.
    expect(reads).toBe(8);
  });

  // Tres grafos en los que un objeto con un error adentro aparece por dos caminos: uno en el que un
  // objeto de más arriba lo vuelve a nombrar, y otro en el que no.

  /** El error de un cliente HTTP: la respuesta nombra a su solicitud y ella a la respuesta. */
  const httpClientError = () => {
    const request: Record<string, unknown> = { path: "/x" };
    const response = { status: 500, failure: queryError(), request };
    request.res = response;
    return carrying({ response, request });
  };

  /** Dos objetos que se nombran entre sí y cuelgan del error cada uno por su campo. */
  const twoNamingEachOther = () => {
    const second: Record<string, unknown> = {};
    const first = { failure: queryError(), o: second };
    second.p = first;
    return carrying({ a: first, b: second });
  };

  /** Un error que nombra al objeto que lo trae y cuelga, aparte, del error de la línea. */
  const errorNamingItsHolder = () => {
    const inner = new Error("dentro");
    const holder = { failure: queryError(), e: inner };
    Object.assign(inner, { ctx: holder });
    return carrying({ a: holder, b: inner });
  };

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
      // El objeto se recorta, pero donde se nombra a sí mismo sigue el de origen, sin recortar.
      "dentro de un objeto del error que se nombra a sí mismo",
      () => {
        const detail: Record<string, unknown> = { failure: queryError() };
        detail.self = detail;
        return { err: carrying({ detail }) };
      },
      ["err.detail.self.failure.params.0"],
    ],
    // Los tres que siguen son una regresión de `f4c099f4`: lo ya recortado se guarda, y el objeto que
    // solo nombra a uno de más arriba se guardaba como llegó, con el error adentro sin recortar.
    [
      "en la respuesta del error de un cliente HTTP, por donde la solicitud la vuelve a nombrar",
      () => ({ err: httpClientError() }),
      ["err.request.res.failure.params.0"],
    ],
    [
      "en uno de dos objetos que se nombran entre sí, por donde el otro lo vuelve a nombrar",
      () => ({ err: twoNamingEachOther() }),
      ["err.b.p.failure.params.0"],
    ],
    [
      "en el objeto al que nombra un error, por donde ese error cuelga aparte del de la línea",
      () => ({ err: errorNamingItsHolder() }),
      ["err.b.ctx.failure.params.0"],
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

// DT-399, ADR-129 regla 5: el recorte camina las causas que pino dobla, hasta cien errores. Sin tope,
// una cadena que no se acaba (una causa que es una función y arma un error nuevo cada vez que la leen)
// dejaba dando vueltas al registro, al poller y a la conciliación: lo que ya recorrió corta un ciclo,
// no una cadena de objetos siempre nuevos. De la cadena que pasa del tope el texto no sale.
describe("el recorte camina hasta cien causas, y de la cadena que sigue no escribe el texto", () => {
  const HIDDEN = "[oculto]";

  /** Los errores que el recorte mira en una cadena de causas, contando el primero. */
  const LIMIT = 100;

  /** Donde la prueba corta una cadena que no se acaba, para caer en rojo y no quedarse colgada. */
  const CUT = 100_000;

  /**
   * Un error cuya causa es una función que arma un error nuevo cada vez que la leen, `levels` veces o
   * sin fin. `onRead` corre en cada lectura.
   */
  function freshCauses(levels: number, onRead: () => void): Error {
    const at = (depth: number): Error =>
      Object.defineProperty(new Error(`nivel ${depth}`), "cause", {
        value: () => {
          onRead();
          return depth < levels ? at(depth + 1) : undefined;
        },
      });
    return at(0);
  }

  /** Cuenta las lecturas de una cadena que no se acaba, y la corta en `CUT`. */
  function endless(): { error: Error; reads: () => number } {
    let reads = 0;
    const error = freshCauses(Infinity, () => {
      reads += 1;
      if (reads > CUT) {
        throw new Error("corte de la prueba");
      }
    });
    return { error, reads: () => reads };
  }

  it("fuera del registro, de una cadena que no se acaba lee cien causas y devuelve oculto", () => {
    const chain = endless();

    expect(withoutQueryValues(chain.error, "un texto")).toBe(HIDDEN);
    expect(chain.reads()).toBe(LIMIT);
  });

  it("por el registro, la línea sin mensaje de una cadena que no se acaba sale igual: el recorte para en su tope", async () => {
    const chain = endless();
    const [entry] = await written(() => error({ err: chain.error }));

    // Lo que pasa del tope lo lee pino, que dobla la cadena hasta desbordar la pila: el serializador
    // lo atrapa y `err` sale oculto, como salía.
    expect(chain.reads()).toBeLessThan(CUT);
    expect(entry?.record).toEqual({
      level: 50,
      time: expect.any(Number),
      err: HIDDEN,
      msg: HIDDEN,
    });
  });

  it("por el registro, de una cadena más larga que el tope el recorte lee cien causas cada vez, y el mensaje y la traza salen ocultos", async () => {
    const LEVELS = 300;
    let reads = 0;
    const count = () => {
      reads += 1;
    };
    // Lo que lee pino solo al doblar las causas, una vez por el mensaje y otra por la traza.
    pino.stdSerializers.err(freshCauses(LEVELS, count));
    const byPino = reads;
    reads = 0;
    const [entry] = await written(() => error({ err: freshCauses(LEVELS, count) }));

    // El recorte pasa tres veces: por el mensaje de la línea, y por el mensaje y la traza de `err`.
    expect(reads - byPino).toBeLessThanOrEqual(3 * LIMIT);
    expect(entry?.record).toEqual({
      level: 50,
      time: expect.any(Number),
      err: { type: "Error", message: HIDDEN, stack: HIDDEN },
      msg: HIDDEN,
    });
  });

  it("una cadena de cien errores se recorta entera; con uno más, el mensaje y la traza salen ocultos", async () => {
    const lines = await written(() => {
      error({ err: buried(LIMIT - 1) }, "falló");
      error({ err: buried(LIMIT) }, "falló");
    });

    expect(String(errOf(lines[0]).message).endsWith(`nivel ${LIMIT - 1}: ${FAILED_QUERY}`)).toBe(
      true,
    );
    expect(errOf(lines[1])).toEqual({ type: "Error", message: HIDDEN, stack: HIDDEN });
    for (const { line } of lines) {
      expect(line).not.toContain(VALUE);
    }
  });

  it("un ciclo de causas y la causa que se devuelve a sí misma terminan donde termina pino, sin llegar al tope", async () => {
    const failed = queryError();
    const outer = new Error("fuera", { cause: failed });
    Object.assign(failed, { cause: outer });
    let reads = 0;
    const itself = Object.defineProperty(new Error("raíz"), "cause", {
      value(this: Error) {
        reads += 1;
        return this;
      },
    });
    const lines = await written(() => {
      error({ err: outer }, "falló");
      error({ err: itself });
    });

    expect(lines.map(({ record }) => record.msg)).toEqual(["falló", "raíz"]);
    expect(lines.map((line) => errOf(line).message)).toEqual([
      `fuera: ${FAILED_QUERY}: fuera: ...`,
      "raíz: ...",
    ]);
    expect(lines[0]?.line).not.toContain(VALUE);
    expect(withoutQueryValues(outer, `fuera: ${failed.message}`)).toBe(`fuera: ${FAILED_QUERY}`);
    expect(withoutQueryValues(itself, "raíz")).toBe("raíz");
    expect(reads).toBeLessThan(LIMIT);
  });
});

// DT-393, ADR-129 regla 7: a la línea sin mensaje que trae su propia clave `msg` el paso propio le
// pasaba además el mensaje de su error. Salían dos claves `msg`, y quien lee el JSON se queda con la
// última, la del error. Gana la que escribió quien llamó, que es lo que hace pino solo.
describe("la línea sin mensaje que trae su propia clave `msg`", () => {
  /** Cuántas veces escribe la línea la clave `msg`. */
  const msgKeys = (line: string) => line.split('"msg":').length - 1;

  it("sale con una sola clave `msg`, la de la línea, y el mensaje de su error queda en `err.message`", async () => {
    const lines = await written(() => {
      error({ err: new Error("del error"), msg: "propio de la línea" });
      error({ err: queryError(), msg: "propio de la línea", evento: "ev-1" });
      error({ err: plainQueryError(), msg: "propio de la línea" });
      error({ err: new Error("del error"), msg: null });
    });

    expect(lines.map(({ line }) => msgKeys(line))).toEqual([1, 1, 1, 1]);
    expect(lines.map(({ record }) => record.msg)).toEqual([
      "propio de la línea",
      "propio de la línea",
      "propio de la línea",
      null,
    ]);
    expect(lines.map((line) => errOf(line).message)).toEqual([
      "del error",
      FAILED_QUERY,
      FAILED_QUERY,
      "del error",
    ]);
    expect(lines[1]?.record.evento).toBe("ev-1");
    for (const { line } of lines) {
      expect(line).not.toContain(VALUE);
    }
  });

  it("sin clave `msg`, o con una sin valor, la línea sigue tomando el mensaje de su error", async () => {
    const lines = await written(() => {
      error({ err: new Error("del error") });
      error({ err: new Error("del error"), msg: undefined });
      error({ err: queryError(), msg: undefined });
      error(Object.assign(new Error("del error"), { msg: "un campo del error" }));
    });

    expect(lines.map(({ record }) => record.msg)).toEqual([
      "del error",
      "del error",
      FAILED_QUERY,
      "del error",
    ]);
    expect(lines.slice(0, 3).map(({ line }) => msgKeys(line))).toEqual([1, 1, 1]);
    expect(errOf(lines[3]).msg).toBe("un campo del error");
  });

  // Un borde de la regla: el `msg` que pino no escribe. Con él pino tampoco toma el mensaje del error,
  // así que no queda la clave de quien llamó ni la del error. Antes de la regla salía la del error.
  it("si su `msg` es un símbolo o una función, que pino no escribe, sale sin clave `msg`, y el mensaje de su error queda en `err.message`", async () => {
    const lines = await written(() => {
      error({ err: new Error("del error"), msg: Symbol("s") });
      error({ err: queryError(), msg: () => "x" });
    });

    expect(lines.map(({ line }) => msgKeys(line))).toEqual([0, 0]);
    expect(lines.map((line) => errOf(line).message)).toEqual(["del error", FAILED_QUERY]);
    for (const { line } of lines) {
      expect(line).not.toContain(VALUE);
    }
  });

  // DT-404: el paso propio mira la línea, no lo que fijó el hijo.
  it("la línea sin mensaje de un hijo que fija `msg` sale como salía: pino escribe la del hijo y después la del error (DT-404)", async () => {
    const lines = await written(() => {
      logger.child({ msg: "fijado por el hijo" }).error({ err: new Error("del error") });
    });

    expect(lines.map(({ line }) => msgKeys(line))).toEqual([2]);
    expect(lines[0]?.line).toContain('"msg":"fijado por el hijo"');
    expect(lines.map(({ record }) => record.msg)).toEqual(["del error"]);
  });

  it("con mensaje, la línea que además trae su clave `msg` sale como salía: pino escribe las dos", async () => {
    const lines: string[] = [];
    const target = logger as unknown as Record<symbol, { write(line: string): void } | undefined>;
    const original = target[pino.symbols.streamSym];
    target[pino.symbols.streamSym] = {
      write(line) {
        lines.push(line);
      },
    };
    try {
      logger.error({ msg: "propio de la línea" }, "el mensaje");
    } finally {
      target[pino.symbols.streamSym] = original;
    }

    expect(lines.map((line) => msgKeys(line))).toEqual([2]);
    expect(lines.map((line) => (JSON.parse(line) as { msg: string }).msg)).toEqual(["el mensaje"]);
  });
});
