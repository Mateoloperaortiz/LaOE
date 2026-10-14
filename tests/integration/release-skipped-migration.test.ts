import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { logger } from "@/shared/log";
import { applyMigrationsAndVerify } from "../../scripts/lib/release";

// El migrador de verdad, envuelto: una prueba puede hacer que vuelva sin aplicar nada.
vi.mock("drizzle-orm/node-postgres/migrator", async (importOriginal) => {
  const original = await importOriginal<typeof import("drizzle-orm/node-postgres/migrator")>();
  return { ...original, migrate: vi.fn(original.migrate) };
});

// Una carpeta de migraciones de mentira, como queda después de mezclar tarde una rama: `0000` (when 100),
// `0001` (when 300), `0002` (when 200), que se generó antes que la `0001` y llegó después, y `0003`
// (when 400), una pendiente de las de siempre. Sus tablas y su tabla de migraciones viven en un esquema
// propio: `drizzle.__drizzle_migrations` no se toca.
const FIXTURE = fileURLToPath(new URL("../fixtures/skipped-migration/", import.meta.url));
const SCHEMA = "release_guard_test";
const journal: { entries: { tag: string }[] } = JSON.parse(
  readFileSync(join(FIXTURE, "meta/_journal.json"), "utf8"),
);

describe("db:release y la migración que el migrador se salta (ADR-117)", () => {
  let folder = "";
  const target = () => ({ migrationsFolder: folder, migrationsSchema: SCHEMA });
  const dropSchema = () =>
    getDb().execute(sql`drop schema if exists ${sql.identifier(SCHEMA)} cascade`);

  /** Deja en el diario las primeras `count` entradas de la carpeta de mentira, menos la de `without`. */
  function writeJournal(count: number, without?: string): void {
    const entries = journal.entries.slice(0, count).filter((entry) => entry.tag !== without);
    writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  }

  async function tables(): Promise<string[]> {
    const result = await getDb().execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = ${SCHEMA} order by table_name`,
    );
    return result.rows.map((row) => row.table_name);
  }

  async function registered(): Promise<number[]> {
    const result = await getDb().execute<{ created_at: string }>(
      sql`select created_at from ${sql.identifier(SCHEMA)}."__drizzle_migrations" order by id`,
    );
    return result.rows.map((row) => Number(row.created_at));
  }

  beforeEach(async () => {
    await dropSchema();
    folder = mkdtempSync(join(tmpdir(), "skipped-migration-"));
    cpSync(FIXTURE, folder, { recursive: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(folder, { recursive: true, force: true });
  });
  afterAll(async () => {
    await dropSchema();
    await closeDb();
  });

  it("Drizzle no aplica ni registra una entrada más vieja que la última aplicada, y no avisa", async () => {
    writeJournal(2);
    await migrate(getDb(), target());
    expect(await registered()).toEqual([100, 300]);

    writeJournal(3);
    await expect(migrate(getDb(), target())).resolves.toBeUndefined();

    expect(await tables()).toEqual(["__drizzle_migrations", "primera", "tercera"]);
    expect(await registered()).toEqual([100, 300]);
  });

  it("falla nombrando la entrada sin registro, con la marca de la última aplicada y los dos remedios", async () => {
    writeJournal(2);
    await applyMigrationsAndVerify(target());

    writeJournal(3);
    const outcome = await applyMigrationsAndVerify(target()).then(
      () => "db:release terminó bien",
      (error: unknown) => String(error),
    );

    expect(await tables()).not.toContain("tardia");
    expect(outcome).toContain("0002_tardia");
    expect(outcome).not.toContain("0000_primera");
    expect(outcome).not.toContain("0001_tercera");
    expect(outcome).toContain("la última aplicada (300)");
    expect(outcome).toContain("En un entorno desplegado, volvé a generarlas");
    expect(outcome).toContain("en local, después de cambiar de rama, corré npm run db:reset");
  });

  it("con una entrada saltada y otra aplicable en el mismo diario, falla sin aplicar ninguna", async () => {
    writeJournal(2);
    await applyMigrationsAndVerify(target());

    writeJournal(4);
    const outcome = await applyMigrationsAndVerify(target()).then(
      () => "db:release terminó bien",
      (error: unknown) => String(error),
    );

    expect(outcome).toContain("0002_tardia");
    expect(outcome).not.toContain("0003_nueva");
    expect(await tables()).toEqual(["__drizzle_migrations", "primera", "tercera"]);
    expect(await registered()).toEqual([100, 300]);
  });

  it("si el migrador vuelve sin registrar una pendiente, falla después de migrar y la nombra", async () => {
    writeJournal(2);
    await applyMigrationsAndVerify(target());

    // Solo una pendiente más nueva que la última aplicada: la primera comprobación no tiene nada que decir.
    writeJournal(4, "0002_tardia");
    vi.mocked(migrate).mockResolvedValueOnce(undefined);
    const outcome = await applyMigrationsAndVerify(target()).then(
      () => "db:release terminó bien",
      (error: unknown) => String(error),
    );

    expect(outcome).toContain("siguen sin registro después de migrar: 0003_nueva.");
    expect(outcome).toContain("última aplicada: 300.");
  });

  it("termina bien con todo el diario aplicado, aunque una migración tenga dos registros", async () => {
    writeJournal(3);
    await applyMigrationsAndVerify(target());
    expect(await tables()).toEqual(["__drizzle_migrations", "primera", "tardia", "tercera"]);

    const table = sql`${sql.identifier(SCHEMA)}."__drizzle_migrations"`;
    await getDb().execute(
      sql`insert into ${table} (hash, created_at) select hash, created_at from ${table} where created_at = 100`,
    );

    await expect(applyMigrationsAndVerify(target())).resolves.toBeUndefined();
    expect(await registered()).toEqual([100, 300, 200, 100]);
  });

  it("avisa, sin fallar, de una migración aplicada cuyo archivo cambió después", async () => {
    writeJournal(2);
    await applyMigrationsAndVerify(target());
    appendFileSync(join(folder, "0000_primera.sql"), "-- editada después de aplicarla\n");
    const warn = vi.spyOn(logger, "warn");

    await expect(applyMigrationsAndVerify(target())).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({ migrations: ["0000_primera"] }, expect.any(String));
  });
});
