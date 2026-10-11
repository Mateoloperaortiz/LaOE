import { createServer, type Server } from "node:net";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// El pool de la casa marca cada fallo al abrir o prestar una conexión con a dónde iba (DT-307,
// ADR-123 regla 16): de ese error, y solo de ese, el registro quita el host configurado esté escrito
// como esté. El servidor es de mentira y responde el arranque con un error de PostgreSQL que nombra
// el host sin comillas, que es la forma que el recorte no reconoce; el pool, `pg` y el error que
// arman son los de verdad.

const USER = "usuario_sintetico_c11";
const DATABASE = "base_sintetica_c11";

/** Un `ErrorResponse` del protocolo de PostgreSQL: severidad, SQLSTATE y mensaje. */
function errorResponse(message: string): Buffer {
  const fields = Buffer.concat(
    [`SFATAL`, `VFATAL`, `C08004`, `M${message}`].map((field) => Buffer.from(`${field}\0`)),
  );
  const header = Buffer.alloc(5);
  header.write("E");
  header.writeInt32BE(fields.length + 5, 1);
  return Buffer.concat([header, fields, Buffer.from([0])]);
}

describe("un fallo al conectar que nombra el host configurado sin comillas", () => {
  const house = globalThis as typeof globalThis & { __casaDigitalDb?: unknown };
  let server: Server;
  let port = 0;
  let original: unknown;
  const refusal = () => `el balanceador no encontró un servidor para localhost:${port}`;
  const url = () => `postgres://${USER}:clave-sintetica@localhost:${port}/${DATABASE}`;

  beforeAll(async () => {
    server = createServer((socket) => {
      socket.on("error", () => {});
      socket.once("data", () => socket.end(errorResponse(refusal())));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
    original = house.__casaDigitalDb;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    house.__casaDigitalDb = original;
    await new Promise((resolve) => server.close(resolve));
  });

  /** La casa recién cargada contra el servidor de mentira: su pool, su registro y quien lo captura. */
  async function houseAgainstFakeServer() {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", url());
    house.__casaDigitalDb = undefined;
    const [{ getDb, closeDb }, { logger }, { captureLogs }] = await Promise.all([
      import("@/db/client"),
      import("@/shared/log"),
      import("../helpers/logs"),
    ]);
    return { getDb, closeDb, logger, captureLogs };
  }

  it.each([
    "transacción",
    "consulta",
  ] as const)("por una %s del pool de la casa, el registro no deja el host ni el puerto", async (how) => {
    const { getDb, closeDb, logger, captureLogs } = await houseAgainstFakeServer();
    let failure: unknown;
    try {
      if (how === "consulta") {
        await getDb().execute(sql`select 1`);
      } else {
        await getDb().transaction(async (tx) => {
          await tx.execute(sql`select 1`);
        });
      }
    } catch (error) {
      failure = error;
    } finally {
      await closeDb();
    }
    expect(failure).toBeInstanceOf(Error);
    // El error de verdad sí lo trae: es lo que el registro tiene que quitar.
    const raw = how === "consulta" ? (failure as Error).cause : failure;
    expect(raw).toMatchObject({ code: "08004", message: refusal() });

    const { lines } = await captureLogs(async () => {
      logger.error({ err: failure }, "el poller falló");
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.line).not.toContain("localhost");
    expect(lines[0]?.line).not.toContain(String(port));
    expect(lines[0]?.line).toContain("el balanceador no encontró un servidor para [oculto]");
    expect((lines[0]?.record.err as { code?: unknown }).code).toBe("08004");
  });

  it("el mismo error de un pool que no es el de la casa conserva su mensaje: sin la marca no se sabe que es de una conexión", async () => {
    const { logger, captureLogs } = await houseAgainstFakeServer();
    const pool = new Pool({ connectionString: url(), connectionTimeoutMillis: 5_000 });
    let failure: unknown;
    try {
      await drizzle({ client: pool }).transaction(async (tx) => {
        await tx.execute(sql`select 1`);
      });
    } catch (error) {
      failure = error;
    } finally {
      await pool.end();
    }

    const { lines } = await captureLogs(async () => {
      logger.error({ err: failure }, "falló");
    });

    expect((lines[0]?.record.err as { message?: unknown }).message).toBe(refusal());
  });
});
