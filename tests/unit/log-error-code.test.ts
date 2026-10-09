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
});
