import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { truncateAll } from "./db";

// Qué tablas alcanza el vaciado de la base de pruebas (DT-030, ADR-124 regla 1). Lo que deja en cada
// una está en `truncate-all.test.ts`; acá va lo que esa caracterización no puede decir con las tablas
// de las migraciones: qué pasa con una tabla que nadie anotó y con lo que vive fuera de `public`.

// Lo que estas pruebas crean. Nada de esto sale de una migración: se crea en la prueba y se borra al
// terminar, y `global-setup.ts` arranca cada corrida con `public` desde cero.
const OTHER_SCHEMA = "vaciado_ajeno";

async function query<T extends Record<string, unknown>>(text: string) {
  return (await getDb().execute<T>(sql.raw(text))).rows;
}

async function rowsIn(table: string): Promise<number> {
  const [found] = await query<{ rows: number }>(`select count(*)::int as rows from ${table}`);
  return found?.rows ?? -1;
}

async function dropWhatTheTestsCreate(): Promise<void> {
  await query(`drop schema if exists ${OTHER_SCHEMA} cascade`);
}

// Antes también: una corrida que murió a medias pudo dejar el esquema ajeno, que `global-setup.ts` no borra.
beforeAll(dropWhatTheTestsCreate);
afterEach(dropWhatTheTestsCreate);

afterAll(async () => {
  await closeDb();
});

describe("las tablas que alcanza el vaciado de la base entre pruebas", () => {
  it("no toca lo que vive fuera de public: ni el registro de migraciones ni una tabla ajena que se llama como una de public", async () => {
    await query(`create schema ${OTHER_SCHEMA}`);
    await query(`create table ${OTHER_SCHEMA}.tag (id text primary key)`);
    await query(`insert into ${OTHER_SCHEMA}.tag (id) values ('ajena')`);
    const migrations = await rowsIn("drizzle.__drizzle_migrations");
    expect(migrations).toBeGreaterThan(0);

    await truncateAll();

    expect(await rowsIn(`${OTHER_SCHEMA}.tag`)).toBe(1);
    expect(await rowsIn("drizzle.__drizzle_migrations")).toBe(migrations);
  });
});
