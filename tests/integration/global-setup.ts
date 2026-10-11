import { Client } from "pg";
import { testDatabaseUrl } from "./test-database";

// Crea la base de pruebas si falta, la vacía, la deja migrada desde cero y guarda la foto de los
// catálogos que llenan las migraciones (ADR-124 regla 2). Corre una vez antes de la suite de
// integración.
export default async function globalSetup(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // En CI las variables vienen del entorno.
  }
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      "Las pruebas de integración necesitan DATABASE_URL (copiá .env.example a .env y corré npm run db:up)",
    );
  }
  const testUrl = testDatabaseUrl(base);
  const name = new URL(testUrl).pathname.slice(1);

  const admin = new Client({ connectionString: base });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [name]);
  if (exists.rowCount === 0) {
    await admin.query(`create database "${name}"`);
  }
  await admin.end();

  // Esquema desde cero en cada corrida: las pruebas truncan tablas pero no los catálogos.
  const test = new Client({ connectionString: testUrl });
  await test.connect();
  await test.query("drop schema if exists public cascade");
  await test.query("drop schema if exists drizzle cascade");
  await test.query("create schema public");
  await test.end();

  process.env.DATABASE_URL = testUrl;
  const { applyMigrationsAndVerify } = await import("../../scripts/lib/release");
  const { closeDb } = await import("@/db/client");
  const { saveCatalogBaseline } = await import("./db");
  await applyMigrationsAndVerify();
  await saveCatalogBaseline();
  await closeDb();
}
