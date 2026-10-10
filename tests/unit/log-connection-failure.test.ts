import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { logger } from "@/shared/log";
import { captureLogs, type LoggedLine } from "../helpers/logs";

// A dónde iba una conexión que no abrió no sale en el registro (DT-295 inciso k, ADR-120 regla 10).
// Los errores tienen la forma que les da Node: el destino en el mensaje y, aparte, en `address`,
// `port` y `hostname`. Con el PostgreSQL de verdad: `tests/integration/log-connection-failure.test.ts`.

const refused = (address: string) =>
  Object.assign(new Error(`connect ECONNREFUSED ${address}:5432`), {
    errno: -61,
    code: "ECONNREFUSED",
    syscall: "connect",
    address,
    port: 5432,
  });

const notFound = (hostname: string) =>
  Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
    errno: -3008,
    code: "ENOTFOUND",
    syscall: "getaddrinfo",
    hostname,
  });

function errOf(entry: LoggedLine | undefined): Record<string, unknown> {
  return (entry?.record.err ?? {}) as Record<string, unknown>;
}

describe("a dónde iba una conexión que no abrió", () => {
  it("el nombre que no resolvió no sale, ni suelto ni como causa de una consulta, y el código sigue legible", async () => {
    const host = "base-sintetica.internal";
    const { lines } = await captureLogs(async () => {
      logger.error({ err: notFound(host) }, "el poller falló");
      logger.error(
        { err: new DrizzleQueryError("select 1", [], notFound(host)), schedule: "permanencia" },
        "no se pudo encolar el programado",
      );
    });
    expect(lines).toHaveLength(2);
    for (const entry of lines) {
      expect(entry.line).not.toContain(host);
      expect(errOf(entry).code).toBe("ENOTFOUND");
      expect(String(errOf(entry).message)).toContain("getaddrinfo ENOTFOUND [oculto]");
      expect(String(errOf(entry).stack)).toContain("getaddrinfo ENOTFOUND [oculto]");
      expect(errOf(entry)).not.toHaveProperty("hostname");
    }
    expect(errOf(lines[0])).toMatchObject({ syscall: "getaddrinfo" });
  });

  it("las direcciones de una conexión que probó varias tampoco salen, y cada intento conserva su código", async () => {
    const both = Object.assign(new AggregateError([refused("::1"), refused("127.0.0.1")], ""), {
      code: "ECONNREFUSED",
    });
    const { lines } = await captureLogs(async () => {
      logger.error({ err: both }, "el poller falló");
    });
    for (const written of ["::1", "127.0.0.1", ":5432"]) {
      expect(lines[0]?.line).not.toContain(written);
    }
    const err = errOf(lines[0]);
    expect(err.code).toBe("ECONNREFUSED");
    const attempts = err.aggregateErrors as Record<string, unknown>[];
    expect(attempts).toHaveLength(2);
    for (const attempt of attempts) {
      expect(attempt).toMatchObject({
        code: "ECONNREFUSED",
        syscall: "connect",
        message: "connect ECONNREFUSED [oculto]",
      });
      expect(attempt).not.toHaveProperty("address");
      expect(attempt).not.toHaveProperty("port");
    }
  });

  it("vale para cualquier conexión que no abre, sea de quien sea: el registro no sabe de quién era", async () => {
    const { lines } = await captureLogs(async () => {
      logger.warn(
        { err: new TypeError("fetch failed", { cause: refused("203.0.113.7") }) },
        "correo no enviado",
      );
    });
    expect(lines[0]?.line).not.toContain("203.0.113.7");
    expect(errOf(lines[0])).toMatchObject({ type: "TypeError", code: "ECONNREFUSED" });
    expect(String(errOf(lines[0]).message)).toBe("fetch failed: connect ECONNREFUSED [oculto]");
  });

  it("un error que no es de una conexión conserva su mensaje y sus campos", async () => {
    const err = Object.assign(new Error("el proveedor respondió 422"), {
      address: "no-es-una-conexion",
      statusCode: 422,
    });
    const { lines } = await captureLogs(async () => {
      logger.warn({ err }, "correo no enviado");
    });
    expect(errOf(lines[0])).toMatchObject({
      message: "el proveedor respondió 422",
      address: "no-es-una-conexion",
      statusCode: 422,
    });
  });
});
