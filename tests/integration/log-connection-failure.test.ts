import { sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { getEnv } from "@/env";
import { logger, withoutQueryValues } from "@/shared/log";
import { captureLogs } from "../helpers/logs";

// Un fallo al conectar con la base, como lo registran el poller y el programador (DT-295 inciso k,
// ADR-120 regla 10). Los errores son los de verdad: un pool contra un puerto cerrado y contra el
// PostgreSQL de las pruebas con una base y un usuario que no existen. Por una consulta suelta llegan
// envueltos por Drizzle; por una transacción, crudos, con lo que Node les cuelga.

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
