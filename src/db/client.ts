import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/env";
import { logger } from "@/shared/log";

/**
 * Lo que va al registro de una conexión que falló: qué pasó y el código de PostgreSQL, si lo trae.
 * Nunca el error entero, que puede traer la consulta, sus valores o dónde iba (`detail`, `where`,
 * `internalQuery`).
 */
function connectionFailure(error: Error): { name: string; code: string | null; message: string } {
  const code = (error as { code?: unknown }).code;
  return { name: error.name, code: typeof code === "string" ? code : null, message: error.message };
}

// Un solo pool por proceso. Se crea al primer uso (no al importar) para que `next build`
// no necesite una base de datos.
function createDb() {
  const env = getEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    // ADR-079: pedir una conexión, una sentencia y una transacción abierta tienen límite.
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  });
  // Sin este listener, el error de un cliente inactivo (reinicio de Postgres, red) tumba el proceso.
  pool.on("error", (error) => {
    logger.error({ err: error }, "un cliente inactivo del pool falló");
  });
  // El de arriba solo cubre a las inactivas: pg-pool le pone su oyente a la conexión que guarda y se
  // lo quita al prestarla. Si PostgreSQL cierra una prestada con la transacción abierta y sin consulta
  // en curso (reinicio, failover, `pg_terminate_backend`, el límite de ADR-079 regla 1), su `error`
  // no tenía quién lo oyera y era una excepción sin atrapar del proceso (ADR-119 regla 13). Este
  // oyente dura lo que la conexión y solo deja constancia: la operación que la usaba falla con su
  // propio error en su siguiente consulta, y el pool la retira al devolverla.
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      // Inactiva, la oye también pg-pool, que avisa por el `error` del pool: no se registra dos veces.
      if (client.listenerCount("error") > 1) {
        return;
      }
      logger.error({ err: connectionFailure(error) }, "una conexión prestada del pool falló");
    });
  });
  return drizzle({ client: pool, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;

const globalRef = globalThis as typeof globalThis & { __casaDigitalDb?: Db | undefined };

export function getDb(): Db {
  // El HMR de `next dev` reevalúa los módulos; el pool debe sobrevivir en globalThis.
  globalRef.__casaDigitalDb ??= createDb();
  return globalRef.__casaDigitalDb;
}

/** Cierra el pool; solo lo usan scripts y pruebas para que el proceso termine. */
export async function closeDb(): Promise<void> {
  const db = globalRef.__casaDigitalDb;
  globalRef.__casaDigitalDb = undefined;
  await db?.$client.end();
}
