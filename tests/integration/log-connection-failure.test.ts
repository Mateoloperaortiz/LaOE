import { scheduledJobs } from "croner";
import { sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { getEnv } from "@/env";
import { startPoller } from "@/jobs/poller";
import { startScheduler } from "@/jobs/scheduler";
import { logger, withoutQueryValues } from "@/shared/log";
import { captureLogs, type LoggedLine, recordsOf } from "../helpers/logs";

// Un fallo al conectar con la base, como lo registran el poller y el programador (DT-295 inciso k,
// ADR-120 regla 10). Los errores son los de verdad: un pool contra un puerto cerrado y contra el
// PostgreSQL de las pruebas con una base y un usuario que no existen. Por una consulta suelta llegan
// envueltos por Drizzle; por una transacción, crudos, con lo que Node les cuelga. Lo que PostgreSQL
// le responde a una conexión que ya se autenticó (un tope, una base cerrada, un rol sin permiso) pide
// roles y bases propios: `log-connection-refusals.test.ts`.

const USER = "usuario_sintetico_c8";
const DATABASE = "base_sintetica_c8";
const VALUE = "valor.privado@eafit.edu.co";
const SQL = "select $1::text";

function testDatabaseWith(change: (url: URL) => void): string {
  const url = new URL(getEnv().DATABASE_URL);
  change(url);
  return url.toString();
}

async function failureOf(connectionString: string, how: "consulta" | "transacción") {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  const db = drizzle({ client: pool });
  try {
    if (how === "consulta") {
      await db.execute(sql`select ${VALUE}::text`);
    } else {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
      });
    }
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
  } finally {
    await pool.end();
  }
  throw new Error("la conexión abrió y no debía");
}

const FAILURES: [string, () => string, RegExp, string][] = [
  [
    "el puerto no responde",
    () => `postgres://${USER}:clave-sintetica@127.0.0.1:1/${DATABASE}`,
    /^ECONNREFUSED$/,
    "connect ECONNREFUSED",
  ],
  [
    "la base no existe",
    () =>
      testDatabaseWith((url) => {
        url.pathname = `/${DATABASE}`;
      }),
    /^3D000$/,
    "does not exist",
  ],
  [
    "el usuario no entra",
    () =>
      testDatabaseWith((url) => {
        url.username = USER;
        url.password = "clave-sintetica";
      }),
    /^28/,
    '"[oculto]"',
  ],
];

describe("un fallo al conectar con la base en el registro", () => {
  describe.each(["consulta", "transacción"] as const)("por una %s", (how) => {
    it.each(
      FAILURES,
    )("si %s, la línea no trae usuario, base, host ni puerto, y el código sigue legible", async (_name, connectionString, code, rest) => {
      const error = await failureOf(connectionString(), how);
      const { lines } = await captureLogs(async () => {
        // Las dos líneas, como las escriben `src/jobs/poller.ts` y `src/jobs/scheduler.ts`.
        logger.error({ err: error }, "el poller falló");
        logger.error({ err: error, schedule: "permanencia" }, "no se pudo encolar el programado");
      });
      expect(lines).toHaveLength(2);
      for (const { line, record } of lines) {
        for (const written of [USER, DATABASE, "127.0.0.1", VALUE]) {
          expect(line).not.toContain(written);
        }
        const err = record.err as Record<string, unknown>;
        expect(String(err.code)).toMatch(code);
        expect(String(err.message)).toContain(rest);
        expect(String(err.stack)).toContain(rest);
        for (const field of ["address", "port", "hostname"]) {
          expect(err).not.toHaveProperty(field);
        }
        if (how === "consulta") {
          // El SQL de la consulta que falló se queda, con sus marcadores.
          expect(err.query).toBe(SQL);
          expect(String(err.message)).toContain(SQL);
        }
      }
      expect(error instanceof DrizzleQueryError).toBe(how === "consulta");
      // Lo que el poller guarda en `outbox.last_error` pasa por el mismo recorte (ADR-119 regla 16).
      const stored = withoutQueryValues(error, error.message);
      for (const written of [USER, DATABASE, "127.0.0.1", VALUE]) {
        expect(stored).not.toContain(written);
      }
    });
  });
});

// Las pruebas de arriba escriben las dos líneas con la forma que tienen en el código. Estas corren
// el poller y el programador de verdad con la casa apuntando a una base que no abre: si una de esas
// líneas deja de registrar el error por `err`, acá se nota.
describe("las líneas del poller y del programador con la base sin abrir", () => {
  /** Corre `run` con el pool de la casa contra un puerto cerrado, y le devuelve el suyo al terminar. */
  async function withUnreachableDatabase<T>(run: () => Promise<T>): Promise<T> {
    const house = globalThis as typeof globalThis & { __casaDigitalDb?: unknown };
    const original = house.__casaDigitalDb;
    const pool = new Pool({
      connectionString: `postgres://${USER}:clave-sintetica@127.0.0.1:1/${DATABASE}`,
      connectionTimeoutMillis: 5_000,
    });
    house.__casaDigitalDb = drizzle({ client: pool, casing: "snake_case" });
    try {
      return await run();
    } finally {
      house.__casaDigitalDb = original;
      await pool.end();
    }
  }

  function expectNoTarget(failures: LoggedLine[]): void {
    for (const { line, record } of failures) {
      for (const written of [USER, DATABASE, "127.0.0.1"]) {
        expect(line).not.toContain(written);
      }
      const err = record.err as Record<string, unknown>;
      expect(err.code).toBe("ECONNREFUSED");
      expect(String(err.message)).toContain("connect ECONNREFUSED [oculto]");
      for (const field of ["address", "port", "hostname"]) {
        expect(err).not.toHaveProperty(field);
      }
    }
  }

  it("el poller arranca y hace su ronda: sus dos líneas de error salen sin usuario, base, host ni puerto", async () => {
    const { lines } = await captureLogs((written) =>
      withUnreachableDatabase(async () => {
        const poller = startPoller({ intervalMs: 3_600_000, batchSize: 1, handlerTimeoutMs: 0 });
        try {
          await vi.waitFor(() => expect(recordsOf(written, "el poller falló")).toHaveLength(1), {
            timeout: 10_000,
          });
        } finally {
          await poller.stop();
        }
      }),
    );
    const failures = lines.filter((entry) => entry.record.level === 50);
    expect(failures.map((entry) => entry.record.msg)).toEqual([
      "no se pudieron atender los eventos que quedaron tomados",
      "el poller falló",
    ]);
    expectNoTarget(failures);
  });

  it("el programador dispara una entrada: su línea de error sale igual", async () => {
    const entry = { name: "programado-sintetico-c8", cron: "0 0 1 1 *", events: ["test.c8"] };
    const { lines } = await captureLogs(() =>
      withUnreachableDatabase(async () => {
        const scheduler = startScheduler([entry], "America/Bogota");
        try {
          await scheduledJobs.find((job) => job.name === entry.name)?.trigger();
        } finally {
          scheduler.stop();
        }
      }),
    );
    const failures = lines.filter((line) => line.record.level === 50);
    expect(failures.map((line) => line.record)).toMatchObject([
      { msg: "no se pudo encolar el programado", schedule: entry.name },
    ]);
    expectNoTarget(failures);
  });
});
