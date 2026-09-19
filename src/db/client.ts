import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/env";
import { logger } from "@/shared/log";

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
