import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/env";

// Un solo pool por proceso. Se crea al primer uso (no al importar) para que `next build`
// no necesite una base de datos.
function createDb() {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
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
