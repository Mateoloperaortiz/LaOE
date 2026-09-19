import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { getEnv } from "@/env";
import { logger } from "@/shared/log";
import { applyMigrationsAndVerify } from "./lib/release";

// Esquema desde cero para desarrollo y pruebas. Se niega a correr en producción.
// Como en db:release, las migraciones corren sin límite por sentencia (ADR-079).
process.env.DB_STATEMENT_TIMEOUT_MS ??= "0";
const env = getEnv();
if (env.NODE_ENV === "production") {
  throw new Error("db:reset no corre en producción");
}

try {
  const db = getDb();
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);
  logger.warn("esquema borrado");
  await applyMigrationsAndVerify();
} finally {
  await closeDb();
}

// Datos sintéticos después de migrar (nunca en producción; el seed también lo comprueba).
await import("./seed");
