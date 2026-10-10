import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { logger } from "@/shared/log";
import { captureLogs, type LoggedLine } from "../helpers/logs";

// Lo que el registro oculta y lo que deja leer (ADR-118 regla 23). La regla `*.code` se puso para el
// código de ingreso y tapaba también el código de un error registrado como `err`: `57P01`,
// `ECONNRESET`. Las líneas se leen ya serializadas, como llegan a los registros del despliegue.

const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });

function errOf(entry: LoggedLine | undefined): Record<string, unknown> {
  return (entry?.record.err ?? {}) as Record<string, unknown>;
}

describe("el código de un error en el registro", () => {
  it("el código de un error de Postgres o de red sale legible en las líneas que registran `err`", async () => {
    const { lines } = await captureLogs(async () => {
      logger.error(
        { err: withCode("terminating connection due to administrator command", "57P01") },
        "un cliente inactivo del pool falló",
      );
      logger.error({ err: withCode("read ECONNRESET", "ECONNRESET") }, "el poller falló");
    });
    expect(lines.map((entry) => errOf(entry).code)).toEqual(["57P01", "ECONNRESET"]);
  });

  it("también desde el logger hijo que recibe cada handler del poller", async () => {
    const { lines } = await captureLogs(async () => {
      logger
        .child({ job: "comms.notification.requested", outboxId: "evento-sintetico", attempt: 1 })
        .warn({ err: withCode("connect ECONNREFUSED 127.0.0.1:5432", "ECONNREFUSED") }, "falló");
    });
    expect(errOf(lines[0]).code).toBe("ECONNREFUSED");
  });

  it("el código de Postgres de una consulta que falló sale aunque Drizzle envuelva el error", async () => {
    // Toda consulta pasa por Drizzle, que lanza un `DrizzleQueryError` con el error de Postgres como
    // causa: el código vive en la causa, no en el error que se registra.
    const cause = withCode("terminating connection due to administrator command", "57P01");
    const { lines } = await captureLogs(async () => {
      logger.error(
        { err: new DrizzleQueryError("select 1", [], cause) },
        "no se pudo encolar el programado",
      );
    });
    expect(errOf(lines[0])).toMatchObject({ type: "DrizzleQueryError", code: "57P01" });
  });

  it("el código propio del error manda sobre el de su causa", async () => {
    const outer = Object.assign(
      new Error("no se pudo leer el objeto", { cause: withCode("x", "ECONNRESET") }),
      {
        code: "NoSuchKey",
      },
    );
    const { lines } = await captureLogs(async () => {
      logger.warn({ err: outer }, "media.process: el objeto no es una imagen válida");
    });
    expect(errOf(lines[0]).code).toBe("NoSuchKey");
  });

  it("el código de ingreso sigue oculto en cualquier otra clave, también en la línea que trae un error", async () => {
    const { lines } = await captureLogs(async () => {
      logger.info(
        {
          challenge: { code: "481516" },
          body: { code: "234200" },
          err: withCode("la base no respondió", "57P01"),
        },
        "ingreso",
      );
      logger.child({ flujo: "ingreso" }).info({ input: { code: "108642" } }, "ingreso");
    });
    expect(lines[0]?.record).toMatchObject({
      challenge: { code: "[oculto]" },
      body: { code: "[oculto]" },
    });
    expect(errOf(lines[0]).code).toBe("57P01");
    expect(lines[1]?.record).toMatchObject({ input: { code: "[oculto]" } });
    const written = lines.map((entry) => entry.line).join("\n");
    for (const code of ["481516", "234200", "108642"]) expect(written).not.toContain(code);
  });

  it("un código, una clave, un token o un secreto de primer nivel también salen ocultos, y el código de un error sigue legible", async () => {
    // Las rutas `*.code` y sus vecinas piden una clave encima: la misma clave suelta, en la línea o
    // en lo que fija un logger hijo, salía tal cual (DT-259).
    const { lines } = await captureLogs(async () => {
      logger.info(
        {
          code: "481516",
          password: "clave-sintetica",
          token: "token-sintetico",
          secret: "secreto-sintetico",
        },
        "ingreso",
      );
      logger.child({ code: "234200", token: "token-de-hijo" }).info("ingreso");
      logger.error({ code: "108642", err: withCode("la base no respondió", "57P01") }, "ingreso");
    });
    expect(lines[0]?.record).toMatchObject({
      code: "[oculto]",
      password: "[oculto]",
      token: "[oculto]",
      secret: "[oculto]",
    });
    expect(lines[1]?.record).toMatchObject({ code: "[oculto]", token: "[oculto]" });
    expect(lines[2]?.record).toMatchObject({ code: "[oculto]" });
    expect(errOf(lines[2]).code).toBe("57P01");
    const written = lines.map((entry) => entry.line).join("\n");
    for (const value of ["481516", "234200", "108642", "sintetic", "token-de-hijo"]) {
      expect(written).not.toContain(value);
    }
  });

  it("lo demás que el registro oculta sigue oculto dentro de un error", async () => {
    const err = Object.assign(new Error("el proveedor rechazó la credencial"), {
      code: "EAUTH",
      password: "clave-sintetica",
      token: "token-sintetico",
      secret: "secreto-sintetico",
    });
    const { lines } = await captureLogs(async () => {
      logger.error({ err }, "correo no enviado");
    });
    expect(errOf(lines[0])).toMatchObject({
      code: "EAUTH",
      password: "[oculto]",
      token: "[oculto]",
      secret: "[oculto]",
    });
    expect(lines[0]?.line).not.toContain("sintetic");
  });

  it("los valores de una consulta que falló no salen: queda el SQL con sus marcadores", async () => {
    // Drizzle trae los parámetros en `params` y los repite en su mensaje, que pino copia en `message`
    // y en `stack`. Pueden ser un correo o la IP que va a la auditoría (DT-260).
    const cause = withCode("terminating connection due to administrator command", "57P01");
    const query = 'select "id" from "person" where "email" = $1 and "ip" = $2';
    const values = ["valor.privado@eafit.edu.co", "203.0.113.7"];
    const { lines } = await captureLogs(async () => {
      logger.error(
        { err: new DrizzleQueryError(query, values, cause) },
        "the-games: no disponible",
      );
      // También cuando el error de la consulta llega como causa de otro.
      logger.warn(
        {
          err: new Error("no se pudo guardar", {
            cause: new DrizzleQueryError(query, values, cause),
          }),
        },
        "falló",
      );
    });
    expect(errOf(lines[0])).toMatchObject({ type: "DrizzleQueryError", code: "57P01", query });
    expect(errOf(lines[0])).not.toHaveProperty("params");
    expect(String(errOf(lines[1]).message)).toContain(query);
    const written = lines.map((entry) => entry.line).join("\n");
    for (const value of values) expect(written).not.toContain(value);
  });

  // Un error de conversión de Postgres (SQLSTATE de la clase 22) cita en su mensaje el valor que
  // rechazó, y pino dobla ese mensaje dentro de `message` y de `stack` (DT-265, ADR-119 regla 15).
  it.each<[string, string, string]>([
    [
      "22P02",
      'invalid input syntax for type uuid: "VALOR"',
      "invalid input syntax for type uuid: ",
    ],
    [
      "22007",
      'invalid input syntax for type date: "VALOR"',
      "invalid input syntax for type date: ",
    ],
    [
      "22008",
      'date/time field value out of range: "VALOR"',
      "date/time field value out of range: ",
    ],
    [
      "22003",
      'value "VALOR" is out of range for type integer',
      " is out of range for type integer",
    ],
    // El valor puede traer comillas: se oculta desde la primera hasta la última.
    ["22P02", 'invalid input syntax for type integer: "a" VALOR "b"', "type integer: "],
  ])("el valor que cita un error de conversión de Postgres (%s) no sale: quedan el resto del mensaje, el SQL y el código", async (code, template, rest) => {
    const value = "valor.privado@eafit.edu.co";
    const query = 'select "id" from "person" where "birth_date" = $1';
    const cause = () => withCode(template.replace("VALOR", value), code);
    const { lines } = await captureLogs(async () => {
      // Como llega de una consulta: envuelto por Drizzle, con el valor también entre sus parámetros.
      logger.error({ err: new DrizzleQueryError(query, [value], cause()) }, "falló");
      // Como causa más honda de otro error, y suelto, sin Drizzle.
      logger.warn(
        {
          err: new Error("no se pudo guardar", {
            cause: new DrizzleQueryError(query, [value], cause()),
          }),
        },
        "falló",
      );
      logger.error({ err: cause() }, "falló");
    });
    expect(lines).toHaveLength(3);
    for (const entry of lines) {
      expect(errOf(entry).code).toBe(code);
      expect(String(errOf(entry).message)).toContain(rest);
      expect(String(errOf(entry).message)).toContain('"[oculto]"');
      expect(String(errOf(entry).stack)).toContain(rest);
      expect(entry.line).not.toContain("privado");
    }
    expect(String(errOf(lines[0]).message)).toContain(query);
  });

  it("el mensaje de un error que no es de conversión sale entero: la restricción que nombra es lo que sirve para depurar", async () => {
    const message = 'duplicate key value violates unique constraint "person_email_unique"';
    const { lines } = await captureLogs(async () => {
      logger.error(
        { err: new DrizzleQueryError("insert into person", [], withCode(message, "23505")) },
        "falló",
      );
    });
    expect(errOf(lines[0])).toMatchObject({ code: "23505" });
    expect(String(errOf(lines[0]).message)).toContain(message);
    expect(String(errOf(lines[0]).stack)).toContain(message);
  });
});
