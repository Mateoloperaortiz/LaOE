import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { logger } from "@/shared/log";
import { captureLogs, errOf, type LoggedLine } from "../helpers/logs";

// Lo que el registro oculta se oculta a cualquier profundidad (DT-283, ADR-120 regla 9). Las rutas de
// pino llegan al segundo nivel: un `code`, `token`, `password` o `secret` a tres niveles salía tal
// cual. Las líneas se leen ya serializadas, como llegan a los registros del despliegue.

const SECRETS = {
  code: "481516",
  password: "clave-sintetica",
  token: "token-sintetico",
  secret: "secreto-sintetico",
};

const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });

/** `leaf` colgado a `depth` niveles: con 3, `{ n1: { n2: leaf } }` deja sus claves en el tercero. */
function nested(depth: number, leaf: Record<string, unknown>): Record<string, unknown> {
  let value = leaf;
  for (let level = depth - 1; level >= 1; level -= 1) {
    value = { [`n${level}`]: value };
  }
  return value;
}

function expectNoSecret(lines: LoggedLine[]): void {
  const written = lines.map((entry) => entry.line).join("\n");
  for (const value of ["481516", "234200", "108642", "sintetic"]) {
    expect(written).not.toContain(value);
  }
}

describe("la redacción del registro a cualquier profundidad", () => {
  it.each([
    3, 4, 5, 8, 20,
  ])("un código, una clave, un token o un secreto a %i niveles salen ocultos", async (depth) => {
    const { lines } = await captureLogs(async () => {
      logger.info(nested(depth, { ...SECRETS, otro: "se-queda" }), "ingreso");
    });
    expect(lines).toHaveLength(1);
    expectNoSecret(lines);
    expect(lines[0]?.line.split('"[oculto]"')).toHaveLength(5);
    expect(lines[0]?.line).toContain('"otro":"se-queda"');
  });

  it("también con un arreglo en el camino, en lo que fija un logger hijo y en lo que un objeto escribe con su `toJSON`", async () => {
    const { lines } = await captureLogs(async () => {
      logger.info({ lote: [{ entrega: [{ token: SECRETS.token, intento: 2 }] }] }, "lote");
      logger.child({ contexto: { pedido: { cuerpo: { code: "234200" } } } }).info("ingreso");
      logger.info(
        { pase: { toJSON: () => ({ datos: { enlace: { secret: SECRETS.secret } } }) } },
        "carnet",
      );
    });
    expect(lines[0]?.record).toMatchObject({
      lote: [{ entrega: [{ token: "[oculto]", intento: 2 }] }],
    });
    expect(lines[1]?.record).toMatchObject({
      contexto: { pedido: { cuerpo: { code: "[oculto]" } } },
    });
    expect(lines[2]?.record).toMatchObject({ pase: { datos: { enlace: { secret: "[oculto]" } } } });
    expectNoSecret(lines);
  });

  it("el código de un error sigue legible, y el de cada error que agrupa; lo demás que el error traiga más abajo sale oculto", async () => {
    const refused = () => withCode("la conexión no abrió", "ECONNREFUSED");
    const aggregate = Object.assign(new AggregateError([refused(), refused()], "no abrió"), {
      code: "ECONNREFUSED",
    });
    const provider = Object.assign(new Error("el proveedor rechazó el pedido"), {
      code: "EAUTH",
      response: { data: { token: SECRETS.token, detalle: { code: "108642" }, estado: 401 } },
    });
    const { lines } = await captureLogs(async () => {
      logger.error({ err: aggregate }, "el poller falló");
      logger.error({ err: provider }, "correo no enviado");
      logger.error(
        {
          err: new DrizzleQueryError(
            "select 1",
            [],
            withCode("terminating connection due to administrator command", "57P01"),
          ),
        },
        "falló",
      );
    });
    expect(errOf(lines[0])).toMatchObject({
      code: "ECONNREFUSED",
      aggregateErrors: [{ code: "ECONNREFUSED" }, { code: "ECONNREFUSED" }],
    });
    expect(errOf(lines[1])).toMatchObject({
      code: "EAUTH",
      response: { data: { token: "[oculto]", detalle: { code: "[oculto]" }, estado: 401 } },
    });
    expect(errOf(lines[2]).code).toBe("57P01");
    expectNoSecret(lines);
  });

  it("el código de un error se deja leer solo si es un texto o un número: otra cosa bajo esa clave sale oculta", async () => {
    const { lines } = await captureLogs(async () => {
      logger.error(
        {
          err: Object.assign(new Error("falló"), {
            code: { token: SECRETS.token, detalle: { secret: SECRETS.secret } },
          }),
        },
        "falló",
      );
      logger.error(
        {
          err: new AggregateError(
            [Object.assign(new Error("intento"), { code: [SECRETS.password] })],
            "todos fallaron",
          ),
        },
        "falló",
      );
      logger.error({ err: Object.assign(new Error("falló"), { code: 42 }) }, "falló");
    });
    expect(errOf(lines[0]).code).toBe("[oculto]");
    expect(errOf(lines[1]).aggregateErrors).toMatchObject([{ code: "[oculto]" }]);
    expect(errOf(lines[2]).code).toBe(42);
    expectNoSecret(lines);
  });

  it("lo que no es una de las cuatro claves sale igual a cualquier profundidad", async () => {
    const payload = nested(5, {
      cuando: new Date("2026-10-10T15:00:00.000Z"),
      adjunto: Buffer.from("ab"),
      cuenta: 3,
      vacio: null,
      lista: [1, "code", { nombre: "token" }],
      nota: 'la palabra "code": no es una clave',
    });
    const { lines } = await captureLogs(async () => {
      logger.info(payload, "evento");
      logger.info({ evento: "ev-1", duracionMs: 12 }, "procesado");
    });
    expect(lines[0]?.record.n1).toEqual(JSON.parse(JSON.stringify(payload.n1)));
    expect(lines[0]?.line).not.toContain("[oculto]");
    expect(lines[1]?.record).toMatchObject({ evento: "ev-1", duracionMs: 12, msg: "procesado" });
  });
});
