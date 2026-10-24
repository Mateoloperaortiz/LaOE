import { Client } from "pg";
import { integrationWorkers, testDatabaseUrls } from "./test-database";

// Crea las bases de pruebas si faltan, las vacía, las deja migradas desde cero y guarda la foto de
// los catálogos que llenan las migraciones (ADR-124 regla 2). Corre una vez antes de la suite de
// integración. Hay una base por ranura concurrente de Vitest: la primera se migra y las demás se
// clonan de ella con `CREATE DATABASE ... TEMPLATE`, que copia también la foto de catálogos.
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
  const urls = testDatabaseUrls(base, integrationWorkers());
  const firstUrl = urls[0] as string;
  const firstName = new URL(firstUrl).pathname.slice(1);

  const admin = new Client({ connectionString: base });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [firstName]);
  if (exists.rowCount === 0) {
    await admin.query(`create database "${firstName}"`);
  }
  await admin.end();

  // Esquema desde cero en cada corrida: la foto de los catálogos sale de lo que dejan las migraciones.
  const test = new Client({ connectionString: firstUrl });
  await test.connect();
  await test.query("drop schema if exists public cascade");
  await test.query("drop schema if exists drizzle cascade");
  await test.query("create schema public");
  await test.end();

  process.env.DATABASE_URL = firstUrl;
  const { applyMigrationsAndVerify } = await import("../../scripts/lib/release");
  const { closeDb } = await import("@/db/client");
  const { saveCatalogBaseline } = await import("./db");
  await applyMigrationsAndVerify();
  await saveCatalogBaseline();
  // Sin conexiones vivas a la plantilla: Postgres no copia una base con sesiones abiertas.
  await closeDb();

  const cloneNames = urls.slice(1).map((url) => new URL(url).pathname.slice(1));
  if (cloneNames.length === 0) return;

  // La administración va contra `postgres`: conectarse a la plantilla también bloquearía la copia.
  const maintenance = new URL(firstUrl);
  maintenance.pathname = "/postgres";
  const cloner = new Client({ connectionString: maintenance.toString() });
  await cloner.connect();
  try {
    for (const name of [firstName, ...cloneNames]) {
      await cloner.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [name],
      );
    }
    for (const name of cloneNames) {
      await cloner.query(`drop database if exists "${name}"`);
      await cloner.query(`create database "${name}" template "${firstName}"`);
    }
  } finally {
    await cloner.end();
  }
}
