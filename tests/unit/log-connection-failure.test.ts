import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withoutQueryValues } from "@/shared/lib/error-sanitizer";
import { logger } from "@/shared/log";
import { captureLogs, errOf, type LoggedLine } from "../helpers/logs";

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

/** Un error de PostgreSQL como lo entrega `pg`: el mensaje y el SQLSTATE en `code`. */
const fromPostgres = (message: string, code: string) =>
  Object.assign(new Error(message), { code, severity: "FATAL" });

/** El error que Node arma cuando el certificado del servidor no nombra al host: el de verdad. */
function certificateMismatch(host: string, certificateName: string): Error {
  const error = checkServerIdentity(host, {
    subject: { CN: certificateName },
    subjectaltname: `DNS:${certificateName}, DNS:*.${certificateName}`,
  } as unknown as PeerCertificate);
  if (!error) {
    throw new Error("el certificado valió y no debía");
  }
  return error;
}

/** `error` como lo registran el poller y el programador, suelto y como causa de una consulta. */
async function logged(error: Error): Promise<LoggedLine[]> {
  const { lines } = await captureLogs(async () => {
    logger.error({ err: error }, "el poller falló");
    logger.error(
      { err: new DrizzleQueryError("select 1", [], error), schedule: "permanencia" },
      "no se pudo encolar el programado",
    );
  });
  expect(lines).toHaveLength(2);
  return lines;
}

/** Lo que el poller guarda en `outbox.last_error` de `error`, suelto y como causa de una consulta. */
function stored(error: Error): string[] {
  const wrapped = new DrizzleQueryError("select 1", [], error);
  return [withoutQueryValues(error, error.message), withoutQueryValues(wrapped, wrapped.message)];
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

  it("un certificado que no nombra al host no deja el host, lo que el certificado nombra ni el certificado", async () => {
    const host = "base-sintetica.internal";
    const error = certificateMismatch(host, "otro-sintetico.example");
    expect(error.message).toContain(host);
    const lines = await logged(error);
    for (const entry of lines) {
      expect(entry.line).not.toContain(host);
      expect(entry.line).not.toContain("otro-sintetico");
      expect(errOf(entry).code).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
      expect(String(errOf(entry).message)).toContain(
        "does not match certificate's altnames: [oculto]",
      );
      expect(String(errOf(entry).stack)).toContain(
        "does not match certificate's altnames: [oculto]",
      );
      for (const field of ["host", "reason", "cert"]) {
        expect(errOf(entry)).not.toHaveProperty(field);
      }
    }
    for (const text of stored(error)) {
      expect(text).not.toContain(host);
      expect(text).not.toContain("otro-sintetico");
    }
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

// Lo que PostgreSQL cita de la conexión configurada no depende de reconocer el error: el usuario y
// la base de `DATABASE_URL` se quitan, entre comillas como él los escribe, de cualquier mensaje. Los
// mensajes llevan la redacción y el SQLSTATE de PostgreSQL, escritos a mano. Provocados contra el
// servidor de las pruebas: `tests/integration/log-connection-refusals.test.ts`.
describe("con quién iba la conexión configurada", () => {
  const USER = "usuario_sintetico";
  const DATABASE = "base_sintetica";

  beforeEach(() => {
    vi.stubEnv(
      "DATABASE_URL",
      `postgres://${USER}:clave-sintetica@base-sintetica.internal:5432/${DATABASE}`,
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["el rol llegó a su tope de conexiones", "53300", `too many connections for role "${USER}"`],
    [
      "la base llegó a su tope de conexiones",
      "53300",
      `too many connections for database "${DATABASE}"`,
    ],
    ["no hay permiso de conectar", "42501", `permission denied for database "${DATABASE}"`],
    [
      "la base no acepta conexiones",
      "55000",
      `database "${DATABASE}" is not currently accepting connections`,
    ],
  ])("si %s, ni el usuario ni la base salen en la línea ni en lo que se guarda, y el código sigue legible", async (_name, code, message) => {
    const error = fromPostgres(message, code);
    const rest = message.replace(/"[^"]*"/, '"[oculto]"');
    for (const entry of await logged(error)) {
      expect(entry.line).not.toContain(USER);
      expect(entry.line).not.toContain(DATABASE);
      expect(errOf(entry).code).toBe(code);
      expect(String(errOf(entry).message)).toContain(rest);
      expect(String(errOf(entry).stack)).toContain(rest);
    }
    const [alone, asCause] = stored(error);
    expect(alone).toBe(rest);
    // De una consulta se guarda el mensaje de Drizzle, que no trae el de su causa.
    expect(asCause).not.toContain(USER);
    expect(asCause).not.toContain(DATABASE);
  });

  it("el tope de conexiones oculta lo que cita aunque no sea de la conexión configurada", async () => {
    const error = fromPostgres('too many connections for role "otro_rol_sintetico"', "53300");
    for (const entry of await logged(error)) {
      expect(entry.line).not.toContain("otro_rol_sintetico");
      expect(errOf(entry).code).toBe("53300");
    }
    expect(stored(error).join("\n")).not.toContain("otro_rol_sintetico");
  });

  it.each([
    ["42501", 'permission denied for table "person"'],
    ["55000", 'currval of sequence "outbox_id_seq" is not yet defined in this session'],
    ["23505", 'duplicate key value violates unique constraint "person_email_key"'],
  ])("lo que un %s cita y no es de la conexión se queda: es lo que sirve para depurar", async (code, message) => {
    const error = fromPostgres(message, code);
    const [raw, wrapped] = await logged(error);
    expect(errOf(raw).message).toBe(message);
    expect(String(errOf(wrapped).message)).toContain(message);
    expect(stored(error)[0]).toBe(message);
  });

  it("la misma palabra sin comillas no se toca: no es un nombre citado", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://postgres:clave-sintetica@base-sintetica.internal/casa");
    const frame = "    at query (/casa/node_modules/drizzle-orm/node-postgres/session.js:10:5)";
    const error = fromPostgres('permission denied for database "casa"', "42501");
    error.stack = `Error: ${error.message}\n${frame}`;
    const [raw] = await logged(error);
    expect(errOf(raw).message).toBe('permission denied for database "[oculto]"');
    expect(errOf(raw).stack).toBe(`Error: permission denied for database "[oculto]"\n${frame}`);
  });

  it("sin una conexión configurada que se pueda leer, el registro escribe igual", async () => {
    vi.stubEnv("DATABASE_URL", "esto no es una dirección");
    const error = fromPostgres(`permission denied for database "${DATABASE}"`, "42501");
    const [raw] = await logged(error);
    expect(errOf(raw)).toMatchObject({ code: "42501", message: error.message });
  });
});
