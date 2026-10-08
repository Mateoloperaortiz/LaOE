import { Client } from "pg";
import { assertOwnedDatabase } from "./environment";

/** Dónde vive lo que se restaura y dónde queda su foto. */
export type SnapshotSchemas = { source: string; baseline: string };

const E2E: SnapshotSchemas = { source: "public", baseline: "e2e_baseline" };

async function withDatabase<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const url = assertOwnedDatabase(process.env.DATABASE_URL ?? "");
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Copia cada tabla de `source` a `baseline`, que se crea de nuevo, y el estado de cada secuencia.
 *
 * Una secuencia queda en la foto como otra secuencia del mismo nombre, con su `last_value` y su
 * `is_called`: en un esquema una secuencia y una tabla no comparten nombre, así que no se cruzan.
 */
export async function saveSnapshot(
  client: Client,
  { source, baseline }: SnapshotSchemas,
): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS ${identifier(baseline)} CASCADE`);
  await client.query(`CREATE SCHEMA ${identifier(baseline)}`);
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
    [source],
  );
  for (const { tablename } of rows) {
    const name = identifier(tablename);
    await client.query(
      `CREATE TABLE ${identifier(baseline)}.${name} AS TABLE ${identifier(source)}.${name}`,
    );
  }
  const sequences = await client.query<{ relname: string }>(
    "SELECT relname FROM pg_class WHERE relnamespace = to_regnamespace($1) AND relkind = 'S' ORDER BY relname",
    [source],
  );
  for (const { relname } of sequences.rows) {
    const copy = `${identifier(baseline)}.${identifier(relname)}`;
    // Con todo el rango de `bigint`: cabe el valor de cualquier secuencia, también una que baja.
    await client.query(
      `CREATE SEQUENCE ${copy} MINVALUE -9223372036854775808 MAXVALUE 9223372036854775807`,
    );
    await client.query(
      `SELECT setval($1::regclass, last_value, is_called) FROM ${identifier(source)}.${identifier(relname)}`,
      [copy],
    );
  }
}

/**
 * Restaura en una transacción; las claves foráneas de la foto ya fueron verificadas al crearla.
 *
 * Borra y vuelve a llenar en vez de truncar (DT-111, ADR-116 regla 21). `TRUNCATE` le crea un
 * archivo nuevo a cada tabla, a su TOAST y a cada índice: 759 por restauración y unos 168.000 por
 * corrida. Cuando Postgres cierra el checkpoint que los recoge, la restauración siguiente no avanza
 * y el escenario agota su tiempo en la preparación. `DELETE` no crea ninguno.
 *
 * Cada secuencia vuelve a donde iba al tomar la foto, sea de una columna o no: `RESTART IDENTITY` la
 * devolvía a su inicio, y la primera alta chocaba con una fila sembrada por esa secuencia.
 */
export async function restoreSnapshot(
  client: Client,
  { source, baseline }: SnapshotSchemas,
): Promise<void> {
  // Sin las columnas calculadas, que PostgreSQL vuelve a generar.
  const { rows } = await client.query<{ tablename: string; fields: string | null }>(
    `SELECT b.tablename,
            (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
               FROM pg_attribute a
              WHERE a.attrelid = to_regclass(format('%I.%I', $1::text, b.tablename))
                AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '') AS fields
       FROM pg_tables b
      WHERE b.schemaname = $2
      ORDER BY b.tablename`,
    [source, baseline],
  );
  if (rows.length === 0) throw new Error("Falta la preparación autenticada E2E");
  const tables = rows.map(({ tablename }) => `${identifier(source)}.${identifier(tablename)}`);
  const refill = rows.map(({ tablename, fields }, index) => {
    if (!fields) throw new Error(`La foto E2E guarda una tabla que ya no existe: ${tablename}`);
    const copy = `${identifier(baseline)}.${identifier(tablename)}`;
    return `DELETE FROM ${tables[index]}; INSERT INTO ${tables[index]} (${fields}) OVERRIDING SYSTEM VALUE SELECT ${fields} FROM ${copy};`;
  });
  const sequences = await client.query<{ relname: string; target: number | null }>(
    `SELECT b.relname, s.oid AS target
       FROM pg_class b
       LEFT JOIN pg_class s ON s.relnamespace = to_regnamespace($1) AND s.relname = b.relname
                           AND s.relkind = 'S'
      WHERE b.relnamespace = to_regnamespace($2) AND b.relkind = 'S'
      ORDER BY b.relname`,
    [source, baseline],
  );
  const rewind = sequences.rows.map(({ relname, target }) => {
    if (target === null)
      throw new Error(`La foto E2E guarda una secuencia que ya no existe: ${relname}`);
    return `SELECT setval(${target}::regclass, last_value, is_called) FROM ${identifier(baseline)}.${identifier(relname)};`;
  });
  await client.query("BEGIN");
  try {
    // El PostgreSQL local de pruebas usa un superusuario; nunca se cambia la sesión de la app.
    await client.query("SET LOCAL session_replication_role = replica");
    // El candado que tomaba `TRUNCATE`: espera a quien todavía escribe, y su fila no sobrevive.
    await client.query(`LOCK TABLE ${tables.join(", ")} IN ACCESS EXCLUSIVE MODE`);
    await client.query(refill.join("\n"));
    // `setval` no crea un archivo nuevo, como sí `ALTER SEQUENCE`, y no se deshace con la
    // transacción: va de último, para que una restauración que falla no mueva ninguna secuencia.
    if (rewind.length > 0) await client.query(rewind.join("\n"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** La foto incluye las sesiones autenticadas; solo existe en la base desechable del launcher. */
export async function saveBaseline(): Promise<void> {
  await withDatabase((client) => saveSnapshot(client, E2E));
}

export async function restoreBaseline(): Promise<void> {
  await withDatabase((client) => restoreSnapshot(client, E2E));
}
