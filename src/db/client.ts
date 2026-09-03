import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/env";

// Un solo pool por proceso. Se crea al primer uso (no al importar) para que `next build`
// no necesite una base de datos.
function crearDb() {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  return drizzle({ client: pool, casing: "snake_case" });
}

export type Db = ReturnType<typeof crearDb>;

const global = globalThis as typeof globalThis & { __casaDigitalDb?: Db };

export function getDb(): Db {
  // El HMR de `next dev` reevalúa los módulos; el pool debe sobrevivir en globalThis.
  global.__casaDigitalDb ??= crearDb();
  return global.__casaDigitalDb;
}
