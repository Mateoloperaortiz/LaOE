import { createServer, type Server, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import * as log from "@/shared/log";
import { captureLogs, type LoggedLine } from "../helpers/logs";

// Lo que quedaba de a dónde iba una conexión (DT-307, ADR-123 regla 16): el host que Node deja como
// campo en un error de socket sin `syscall`, el host configurado en un fallo que quien abre la
// conexión marcó, y los renglones `at …` de la traza, que no se tocan.

const { logger, markConnectionFailure } = log;

function errOf(entry: LoggedLine | undefined): Record<string, unknown> {
  return (entry?.record.err ?? {}) as Record<string, unknown>;
}

/** `error` como se registra suelto y como causa de una consulta. */
async function logged(error: Error): Promise<LoggedLine[]> {
  const { lines } = await captureLogs(async () => {
    logger.error({ err: error }, "falló");
    logger.error({ err: new DrizzleQueryError("select 1", [], error) }, "falló la consulta");
  });
  expect(lines).toHaveLength(2);
  return lines;
}

const frames = (stack: unknown) =>
  String(stack)
    .split("\n")
    .filter((line) => /^\s+at /.test(line));

/** El error de verdad: un servidor que cierra apenas le llegan, y Node esperándole un saludo TLS. */
async function tlsDisconnectedBeforeHandshake(host: string): Promise<Error & { port?: number }> {
  const accepted: Socket[] = [];
  const server: Server = createServer((socket) => {
    accepted.push(socket);
    socket.on("error", () => {});
    socket.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  try {
    return await new Promise((resolve, reject) => {
      const socket = connectTls({ host, port, rejectUnauthorized: false });
      socket.once("error", resolve);
      socket.once("secureConnect", () => reject(new Error("el saludo TLS terminó y no debía")));
    });
  } finally {
    // El servidor no termina de cerrar mientras le quede una conexión a medio cerrar.
    for (const socket of accepted) {
      socket.destroy();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("un error de socket que trae el destino como campos, sin `syscall`", () => {
  it("la conexión TLS que se cae antes del saludo no deja el host ni el puerto, y su código sigue legible", async () => {
    const error = await tlsDisconnectedBeforeHandshake("127.0.0.1");
    // Así lo arma Node: sin `syscall`, y con el destino en campos que no escribe en el mensaje.
    expect(error).toMatchObject({ code: "ECONNRESET", host: "127.0.0.1" });
    expect(error).not.toHaveProperty("syscall");
    expect(typeof error.port).toBe("number");

    const lines = await logged(error);

    for (const { line } of lines) {
      expect(line).not.toContain("127.0.0.1");
      expect(line).not.toContain(String(error.port));
    }
    expect(errOf(lines[0])).toMatchObject({ code: "ECONNRESET", message: error.message });
    for (const field of ["host", "port", "path", "localAddress"]) {
      expect(errOf(lines[0])).not.toHaveProperty(field);
    }
    expect(errOf(lines[1]).code).toBe("ECONNRESET");
  });

  it("un error con `host` que no trae un código de Node conserva sus campos: no es de un socket", async () => {
    const err = Object.assign(new Error("el proveedor respondió 422"), {
      host: "no-es-una-conexion",
      port: 443,
      statusCode: 422,
    });
    const { lines } = await captureLogs(async () => {
      logger.warn({ err }, "correo no enviado");
    });

    expect(errOf(lines[0])).toMatchObject({
      host: "no-es-una-conexion",
      port: 443,
      statusCode: 422,
    });
  });
});

describe("los renglones `at …` de la traza", () => {
  // La forma que le da Node, con un host que también es una carpeta de este archivo.
  const notFound = (hostname: string) =>
    Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
      errno: -3008,
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
      hostname,
    });

  it("quitar un host corto del mensaje no lo borra de las rutas de la traza", async () => {
    const error = notFound("unit");
    const original = frames(error.stack);
    expect(original.some((line) => line.includes("/unit/log-connection-target.test.ts"))).toBe(
      true,
    );

    const lines = await logged(error);

    expect(errOf(lines[0]).message).toBe("getaddrinfo ENOTFOUND [oculto]");
    expect(String(errOf(lines[0]).stack).split("\n")[0]).toBe(
      "Error: getaddrinfo ENOTFOUND [oculto]",
    );
    expect(frames(errOf(lines[0]).stack)).toEqual(original);
    // Como causa de una consulta: el mensaje doblado adentro sale sin el host, y sus renglones igual.
    expect(String(errOf(lines[1]).message)).not.toMatch(/ENOTFOUND unit/);
    expect(String(errOf(lines[1]).stack)).toContain("getaddrinfo ENOTFOUND [oculto]");
    expect(frames(errOf(lines[1]).stack)).toEqual(
      expect.arrayContaining(original.filter((line) => line.includes("/unit/"))),
    );
  });
});

describe("un fallo al conectar que marcó quien abre la conexión", () => {
  const URL_WITH_SHORT_HOST = "postgres://usuario_sintetico:clave-sintetica@db:6543/base_sintetica";
  const refusedByProxy = () =>
    Object.assign(new Error("el balanceador no encontró un servidor para db:6543 (db)"), {
      code: "08004",
      host: "db",
      port: 6543,
    });

  it("no deja el host configurado en el mensaje ni en los campos, esté escrito como esté", async () => {
    const error = refusedByProxy();
    markConnectionFailure(error, URL_WITH_SHORT_HOST);
    const original = frames(error.stack);

    const lines = await logged(error);

    expect(errOf(lines[0])).toMatchObject({
      code: "08004",
      message: "el balanceador no encontró un servidor para [oculto] ([oculto])",
    });
    for (const field of ["host", "port"]) {
      expect(errOf(lines[0])).not.toHaveProperty(field);
    }
    expect(frames(errOf(lines[0]).stack)).toEqual(original);
    expect(String(errOf(lines[1]).message)).toContain("servidor para [oculto] ([oculto])");
    expect(log.withoutQueryValues(error, error.message)).toBe(
      "el balanceador no encontró un servidor para [oculto] ([oculto])",
    );
  });

  it("sin la marca, la misma palabra no se toca: un host corto no se borra de cualquier mensaje", async () => {
    const error = refusedByProxy();

    const lines = await logged(error);

    expect(errOf(lines[0])).toMatchObject({
      message: "el balanceador no encontró un servidor para db:6543 (db)",
      host: "db",
      port: 6543,
    });
  });

  it("una conexión que no se puede leer se marca igual, y lo que no es un error no hace fallar a quien marca", async () => {
    const error = refusedByProxy();
    markConnectionFailure(error, "esto no es una URL");
    markConnectionFailure("no es un error", URL_WITH_SHORT_HOST);

    const lines = await logged(error);

    expect(errOf(lines[0]).message).toBe(
      "el balanceador no encontró un servidor para db:6543 (db)",
    );
    for (const field of ["host", "port"]) {
      expect(errOf(lines[0])).not.toHaveProperty(field);
    }
  });
});
