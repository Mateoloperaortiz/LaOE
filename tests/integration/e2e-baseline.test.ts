import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { restoreSnapshot, type SnapshotSchemas, saveSnapshot } from "../e2e/database";
import { truncateAll } from "./db";

// La restauración que aísla cada escenario E2E (ADR-052 reglas 3 y 4, ADR-116 regla 21, DT-111). Se
// prueba acá, contra un esquema propio con lo que una tabla puede traer (serial, identidad, columna
// calculada, TOAST, referencias circulares y en cascada) y con secuencias que no son de ninguna
// columna, porque la base desechable de la E2E no tiene ninguna secuencia y crear otra base forzaría
// un checkpoint en medio de la suite.

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

/** Dónde va cada secuencia del esquema: su último valor y si ya lo entregó. */
async function sequenceStates(schema: string): Promise<Record<string, string>> {
  const { rows } = await client.query<{ name: string }>(
    "SELECT sequencename AS name FROM pg_sequences WHERE schemaname = $1 ORDER BY 1",
    [schema],
  );
  const result: Record<string, string> = {};
  for (const { name } of rows) {
    const state = await client.query<{ state: string }>(
      `SELECT last_value || CASE WHEN is_called THEN ' entregado' ELSE ' por entregar' END AS state FROM "${schema}"."${name}"`,
    );
    result[name] = state.rows[0]?.state ?? "";
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

/** Lo que una prueba le hace a la base: altas, cambios, bajas en cascada y secuencias que avanzan. */
async function dirty(): Promise<void> {
  await client.query(`
    INSERT INTO e2e_probe.author (name) VALUES ('Tercera');
    INSERT INTO e2e_probe.shelf (label) VALUES ('nueva'), ('otra');
    UPDATE e2e_probe.book SET title = title || ' (2.ª ed.)' WHERE author_id = 2;
    UPDATE e2e_probe.author SET notes = repeat('y', 9000) WHERE id = 2;
    UPDATE e2e_probe.author SET favorite_book = NULL WHERE id = 1;
    DELETE FROM e2e_probe.author WHERE id = 1;
    INSERT INTO e2e_probe.book (author_id, title) VALUES (2, 'Recién llegado');
    SELECT nextval('e2e_probe.loose'), nextval('e2e_probe.countdown');
  `);
  // Un alta que falla también gasta un valor de la identidad.
  await expect(
    client.query("INSERT INTO e2e_probe.book (author_id, title) VALUES (2, 'Recién llegado')"),
  ).rejects.toThrow("book_title_key");
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
  let photographed: Record<string, string>;

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
      CREATE SEQUENCE e2e_probe.countdown INCREMENT BY -1 MINVALUE -100 MAXVALUE -1;
      -- Las llaves salen de su secuencia, como las de una fila sembrada: 1 y 2, y 100, 105 y 110.
      INSERT INTO e2e_probe.author (name, notes)
        VALUES ('Primera', repeat('x', 9000)), ('Segundo', NULL);
      INSERT INTO e2e_probe.book (author_id, title) VALUES (1, 'Uno'), (1, 'Dos'), (2, 'Tres');
      UPDATE e2e_probe.author SET favorite_book = 100 WHERE id = 1;
      INSERT INTO e2e_probe."Préstamo Raro" VALUES ('a', 100, NULL), ('b', 110, 'a');
      SELECT nextval('e2e_probe.loose'), setval('e2e_probe.countdown', -40, false);
    `);
    await saveSnapshot(client, PROBE);
    seeded = await contents(PROBE.source);
    photographed = await sequenceStates(PROBE.source);
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

  it("deja cada secuencia donde la tenía la foto, sea de una columna o no, y el alta siguiente no choca", async () => {
    expect(photographed).toEqual({
      author_id_seq: "2 entregado",
      book_id_seq: "110 entregado",
      countdown: "-40 por entregar",
      loose: "7 entregado",
      shelf_id_seq: "1 por entregar",
    });
    await dirty();
    expect(await sequenceStates(PROBE.source)).toEqual({
      author_id_seq: "3 entregado",
      book_id_seq: "120 entregado",
      countdown: "-40 entregado",
      loose: "8 entregado",
      shelf_id_seq: "2 entregado",
    });

    await restoreSnapshot(client, PROBE);

    expect(await sequenceStates(PROBE.source)).toEqual(photographed);
    // Cada alta sigue de donde iba la foto: no pide una llave que ya tiene una fila restaurada.
    const author = await client.query<{ id: number }>(
      "INSERT INTO e2e_probe.author (name) VALUES ('Siguiente') RETURNING id",
    );
    const book = await client.query<{ id: number }>(
      "INSERT INTO e2e_probe.book (author_id, title) VALUES (2, 'Siguiente') RETURNING id",
    );
    const shelf = await client.query<{ id: string }>(
      "INSERT INTO e2e_probe.shelf (label) VALUES ('siguiente') RETURNING id",
    );
    const loose = await client.query<{ loose: string; countdown: string }>(
      "SELECT nextval('e2e_probe.loose') AS loose, nextval('e2e_probe.countdown') AS countdown",
    );
    expect([author.rows[0]?.id, book.rows[0]?.id, shelf.rows[0]?.id]).toEqual([3, 115, "1"]);
    expect(loose.rows[0]).toEqual({ loose: "8", countdown: "-40" });
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
    expect(await sequenceStates(PROBE.source)).toEqual(photographed);
  });

  it("espera a la transacción que todavía escribe y no deja su fila", async () => {
    await other.query("BEGIN");
    await other.query("INSERT INTO e2e_probe.shelf (label) VALUES ('a medio escribir')");
    const pid = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]
      ?.pid;

    const restoring = restoreSnapshot(client, PROBE);
    const ended = restoring.then(
      () => "ended" as const,
      () => "ended" as const,
    );
    // Sin reloj: se pregunta hasta que la restauración esté esperando el candado de la tabla. Si
    // termina antes, no lo esperó; el tope de preguntas no deja un bucle huérfano si se traba en otra
    // parte, y la transacción que escribe se cierra pase lo que pase.
    let state: "running" | "waiting" | "ended" = "running";
    try {
      for (let asked = 0; state === "running" && asked < 5_000; asked += 1) {
        const waiting = other
          .query(
            "SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted AND locktype = 'relation'",
            [pid],
          )
          .then(({ rowCount }) => (rowCount === 1 ? ("waiting" as const) : ("running" as const)));
        state = await Promise.race([ended, waiting]);
        await waiting;
      }
      expect(state).toBe("waiting");
    } finally {
      await other.query("COMMIT");
    }
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

  it("no restaura nada si la foto guarda una tabla que ya no existe", async () => {
    await dirty();
    await client.query('DROP TABLE e2e_probe."Préstamo Raro"');
    const changed = await contents(PROBE.source);
    const moved = await sequenceStates(PROBE.source);

    await expect(restoreSnapshot(client, PROBE)).rejects.toThrow(
      "La foto E2E guarda una tabla que ya no existe: Préstamo Raro",
    );
    expect(await contents(PROBE.source)).toEqual(changed);
    expect(await sequenceStates(PROBE.source)).toEqual(moved);
  });

  it("no restaura nada si la foto guarda una secuencia que ya no existe", async () => {
    await dirty();
    await client.query("DROP SEQUENCE e2e_probe.loose");
    const changed = await contents(PROBE.source);
    const moved = await sequenceStates(PROBE.source);

    await expect(restoreSnapshot(client, PROBE)).rejects.toThrow(
      "La foto E2E guarda una secuencia que ya no existe: loose",
    );
    expect(await contents(PROBE.source)).toEqual(changed);
    expect(await sequenceStates(PROBE.source)).toEqual(moved);
  });

  it("no mueve ninguna fila ni ninguna secuencia si falla a la mitad", async () => {
    await dirty();
    // Una foto dañada: la llave repetida tumba el llenado de la segunda tabla.
    await client.query(
      "INSERT INTO e2e_probe_baseline.book SELECT * FROM e2e_probe_baseline.book WHERE id = 100",
    );
    const changed = await contents(PROBE.source);
    const moved = await sequenceStates(PROBE.source);

    await expect(restoreSnapshot(client, PROBE)).rejects.toThrow("book_pkey");
    expect(await contents(PROBE.source)).toEqual(changed);
    expect(await sequenceStates(PROBE.source)).toEqual(moved);
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
