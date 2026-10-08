import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { restoreSnapshot, type SnapshotSchemas, saveSnapshot } from "../e2e/database";
import { truncateAll } from "./db";

// La restauración que aísla cada escenario E2E (ADR-052 reglas 3 y 4, ADR-116 regla 21, DT-111). Se
// prueba acá, contra un esquema propio con lo que una tabla puede traer (serial, identidad, columna
// calculada, TOAST, referencias circulares y en cascada), porque la base desechable de la E2E no
// tiene ninguna secuencia y crear otra base forzaría un checkpoint en medio de la suite.

const PROBE: SnapshotSchemas = { source: "e2e_probe", baseline: "e2e_probe_baseline" };
const HOUSE: SnapshotSchemas = { source: "public", baseline: "e2e_probe_public" };

let client: Client;
let other: Client;

function connect(): Promise<Client> {
  const opened = new Client({ connectionString: process.env.DATABASE_URL });
  return opened.connect().then(() => opened);
}

/** Las filas de cada tabla del esquema, como texto y ordenadas: lo que se compara con la foto. */
async function contents(schema: string): Promise<Record<string, string[]>> {
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
    [schema],
  );
  const result: Record<string, string[]> = {};
  for (const { tablename } of rows) {
    const table = `"${schema}"."${tablename}"`;
    const found = await client.query<{ rows: string[] }>(
      `SELECT coalesce(array_agg(x::text ORDER BY x::text), '{}') AS rows FROM ${table} x`,
    );
    result[tablename] = found.rows[0]?.rows ?? [];
  }
  return result;
}

/** El valor que entregaría cada secuencia del esquema en su próximo `nextval`. */
async function nextValues(schema: string): Promise<Record<string, string>> {
  const { rows } = await client.query<{ name: string; increment: string }>(
    "SELECT sequencename AS name, increment_by::text AS increment FROM pg_sequences WHERE schemaname = $1 ORDER BY 1",
    [schema],
  );
  const result: Record<string, string> = {};
  for (const { name, increment } of rows) {
    const state = await client.query<{ next: string }>(
      `SELECT (CASE WHEN is_called THEN last_value + $1::bigint ELSE last_value END)::text AS next FROM "${schema}"."${name}"`,
      [increment],
    );
    result[name] = state.rows[0]?.next ?? "";
  }
  return result;
}

/** El archivo de cada tabla, índice, TOAST y secuencia del esquema: cambia si se le crea uno nuevo. */
async function fileNodes(schema: string): Promise<Record<string, string>> {
  const { rows } = await client.query<{ relation: string; filenode: string }>(
    `WITH own AS (SELECT oid, reltoastrelid FROM pg_class WHERE relnamespace = $1::regnamespace),
          toast AS (SELECT reltoastrelid AS oid FROM own WHERE reltoastrelid <> 0),
          toast_index AS (SELECT indexrelid AS oid FROM pg_index WHERE indrelid IN (SELECT oid FROM toast))
     SELECT c.oid::regclass::text AS relation, pg_relation_filenode(c.oid)::text AS filenode
       FROM pg_class c
      WHERE c.relkind IN ('r', 'i', 't', 'S')
        AND c.oid IN (SELECT oid FROM own UNION SELECT oid FROM toast UNION SELECT oid FROM toast_index)
      ORDER BY 1`,
    [schema],
  );
  return Object.fromEntries(rows.map(({ relation, filenode }) => [relation, filenode]));
}

/** La restauración de antes de DT-111, tal cual: el patrón contra el que se comparan las secuencias. */
async function restoreByTruncating({ source, baseline }: SnapshotSchemas): Promise<void> {
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
    [baseline],
  );
  await client.query("BEGIN");
  await client.query("SET LOCAL session_replication_role = replica");
  await client.query(
    `TRUNCATE ${rows.map(({ tablename }) => `"${source}"."${tablename}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
  for (const { tablename } of rows) {
    const columns = await client.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER' ORDER BY ordinal_position",
      [source, tablename],
    );
    const fields = columns.rows.map(({ column_name }) => `"${column_name}"`).join(", ");
    await client.query(
      `INSERT INTO "${source}"."${tablename}" (${fields}) OVERRIDING SYSTEM VALUE SELECT ${fields} FROM "${baseline}"."${tablename}"`,
    );
  }
  await client.query("COMMIT");
}

/** Lo que una prueba le hace a la base: altas, cambios, bajas en cascada y secuencias que avanzan. */
async function dirty(): Promise<void> {
  await client.query(`
    INSERT INTO e2e_probe.author (name) VALUES ('Tercera');
    INSERT INTO e2e_probe.shelf (label) VALUES ('nueva'), ('otra');
    UPDATE e2e_probe.book SET title = title || ' (2.ª ed.)' WHERE author_id = 12;
    UPDATE e2e_probe.author SET notes = repeat('y', 9000) WHERE id = 12;
    UPDATE e2e_probe.author SET favorite_book = NULL WHERE id = 11;
    DELETE FROM e2e_probe.author WHERE id = 11;
    INSERT INTO e2e_probe.book (author_id, title) VALUES (12, 'Recién llegado');
    SELECT nextval('e2e_probe.loose');
  `);
  // Un alta que falla también gasta un valor de la identidad.
  await expect(
    client.query("INSERT INTO e2e_probe.book (author_id, title) VALUES (12, 'Recién llegado')"),
  ).rejects.toThrow();
}

beforeAll(async () => {
  client = await connect();
  other = await connect();
});

afterAll(async () => {
  for (const schema of [PROBE.source, PROBE.baseline, HOUSE.baseline]) {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  }
  await client.end();
  await other.end();
  await closeDb();
});

describe("la restauración de la foto que aísla cada escenario E2E", () => {
  let seeded: Record<string, string[]>;

  beforeEach(async () => {
    await client.query(`
      DROP SCHEMA IF EXISTS e2e_probe CASCADE;
      CREATE SCHEMA e2e_probe;
      CREATE TABLE e2e_probe.author (
        id serial PRIMARY KEY,
        name text NOT NULL,
        shout text GENERATED ALWAYS AS (upper(name)) STORED,
        notes text,
        favorite_book integer
      );
      ALTER TABLE e2e_probe.author ALTER COLUMN notes SET STORAGE EXTERNAL;
      CREATE TABLE e2e_probe.book (
        id integer GENERATED ALWAYS AS IDENTITY (START WITH 100 INCREMENT BY 5) PRIMARY KEY,
        author_id integer NOT NULL REFERENCES e2e_probe.author ON DELETE CASCADE,
        title text NOT NULL UNIQUE
      );
      ALTER TABLE e2e_probe.author
        ADD FOREIGN KEY (favorite_book) REFERENCES e2e_probe.book;
      CREATE TABLE e2e_probe."Préstamo Raro" (
        code text PRIMARY KEY,
        book_id integer REFERENCES e2e_probe.book ON DELETE SET NULL,
        renews text REFERENCES e2e_probe."Préstamo Raro"
      );
      CREATE TABLE e2e_probe.shelf (
        id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        label text
      );
      CREATE SEQUENCE e2e_probe.loose START WITH 7;
      INSERT INTO e2e_probe.author (id, name, notes)
        VALUES (11, 'Primera', repeat('x', 9000)), (12, 'Segundo', NULL);
      INSERT INTO e2e_probe.book (id, author_id, title) OVERRIDING SYSTEM VALUE
        VALUES (1000, 11, 'Uno'), (1001, 11, 'Dos'), (1002, 12, 'Tres');
      UPDATE e2e_probe.author SET favorite_book = 1000 WHERE id = 11;
      INSERT INTO e2e_probe."Préstamo Raro" VALUES ('a', 1000, NULL), ('b', 1002, 'a');
      SELECT nextval('e2e_probe.author_id_seq'), nextval('e2e_probe.author_id_seq'),
             nextval('e2e_probe.book_id_seq'), nextval('e2e_probe.loose');
    `);
    await saveSnapshot(client, PROBE);
    seeded = await contents(PROBE.source);
  });

  it("deja en cada tabla exactamente las filas de la foto", async () => {
    await dirty();
    expect(await contents(PROBE.source)).not.toEqual(seeded);

    await restoreSnapshot(client, PROBE);

    const restored = await contents(PROBE.source);
    expect(restored).toEqual(seeded);
    expect(restored).toEqual(await contents(PROBE.baseline));
    expect(restored.author).toHaveLength(2);
    expect(restored.book).toHaveLength(3);
    expect(restored["Préstamo Raro"]).toHaveLength(2);
    expect(restored.shelf).toEqual([]);
  });

  it("deja cada secuencia con el siguiente valor que dejaba truncar con RESTART IDENTITY", async () => {
    await dirty();
    await restoreByTruncating(PROBE);
    const before = await nextValues(PROBE.source);
    // La de una columna vuelve a su inicio, no al valor que tenía al tomar la foto (2 y 100); la que
    // no es de ninguna columna sigue donde iba.
    expect(before).toEqual({
      author_id_seq: "1",
      book_id_seq: "100",
      loose: "9",
      shelf_id_seq: "1",
    });

    await dirty();
    await restoreSnapshot(client, PROBE);

    expect(await nextValues(PROBE.source)).toEqual({ ...before, loose: "10" });
    expect(await contents(PROBE.source)).toEqual(seeded);
  });

  it("no le crea un archivo nuevo a ninguna tabla, índice, TOAST ni secuencia", async () => {
    await dirty();
    const before = await fileNodes(PROBE.source);
    expect(Object.keys(before).length).toBeGreaterThanOrEqual(15);

    await restoreSnapshot(client, PROBE);

    expect(await fileNodes(PROBE.source)).toEqual(before);
  });

  it("restaura varias veces seguidas sin que la anterior estorbe", async () => {
    for (let round = 0; round < 5; round += 1) {
      await dirty();
      await restoreSnapshot(client, PROBE);
    }

    expect(await contents(PROBE.source)).toEqual(seeded);
    expect(await nextValues(PROBE.source)).toMatchObject({
      author_id_seq: "1",
      book_id_seq: "100",
    });
  });

  it("espera a la transacción que todavía escribe y no deja su fila", async () => {
    await other.query("BEGIN");
    await other.query("INSERT INTO e2e_probe.shelf (label) VALUES ('a medio escribir')");
    const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
      ?.pid;

    const restoring = restoreSnapshot(client, PROBE);
    // Sin reloj: se pregunta hasta que la restauración esté esperando el candado de la tabla.
    for (;;) {
      const waiting = await other.query(
        "SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted AND locktype = 'relation'",
        [pid],
      );
      if (waiting.rowCount === 1) break;
    }
    await other.query("COMMIT");
    await restoring;

    expect(await contents(PROBE.source)).toEqual(seeded);
  });

  it("no restaura nada si la foto no existe", async () => {
    await client.query(`DROP SCHEMA ${PROBE.baseline} CASCADE`);
    await dirty();
    const changed = await contents(PROBE.source);

    await expect(restoreSnapshot(client, PROBE)).rejects.toThrow(
      "Falta la preparación autenticada E2E",
    );
    expect(await contents(PROBE.source)).toEqual(changed);
  });

  it("restaura las tablas de la casa con lo que traen las migraciones", async () => {
    await truncateAll();
    await saveSnapshot(client, HOUSE);
    const catalogs = await contents(HOUSE.source);
    expect(Object.keys(catalogs).length).toBeGreaterThan(100);
    expect(catalogs.app_config?.length).toBeGreaterThan(0);

    await client.query(`
      UPDATE app_config SET updated_at = updated_at + interval '1 day';
      DELETE FROM badge_definition;
    `);
    expect(await contents(HOUSE.source)).not.toEqual(catalogs);
    await restoreSnapshot(client, HOUSE);

    expect(await contents(HOUSE.source)).toEqual(catalogs);
  });
});
