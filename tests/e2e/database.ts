import { Client } from "pg";
import { assertOwnedDatabase } from "./environment";

const BASELINE = "e2e_baseline";

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

/** La foto incluye las sesiones autenticadas; solo existe en la base desechable del launcher. */
export async function saveBaseline(): Promise<void> {
  await withDatabase(async (client) => {
    await client.query(`DROP SCHEMA IF EXISTS ${BASELINE} CASCADE`);
    await client.query(`CREATE SCHEMA ${BASELINE}`);
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    for (const { tablename } of rows) {
      const name = identifier(tablename);
      await client.query(`CREATE TABLE ${BASELINE}.${name} AS TABLE public.${name}`);
    }
  });
}

/** Restaura en una transacción; las claves foráneas de la foto ya fueron verificadas al crearla. */
export async function restoreBaseline(): Promise<void> {
  await withDatabase(async (client) => {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
      [BASELINE],
    );
    if (rows.length === 0) throw new Error("Falta la preparación autenticada E2E");
    await client.query("BEGIN");
    try {
      // El PostgreSQL local de pruebas usa un superusuario; nunca se cambia la sesión de la app.
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        `TRUNCATE ${rows.map(({ tablename }) => `public.${identifier(tablename)}`).join(", ")} RESTART IDENTITY CASCADE`,
      );
      for (const { tablename } of rows) {
        const name = identifier(tablename);
        const columns = await client.query<{ column_name: string }>(
          "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER' ORDER BY ordinal_position",
          [tablename],
        );
        const fields = columns.rows.map(({ column_name }) => identifier(column_name)).join(", ");
        await client.query(
          `INSERT INTO public.${name} (${fields}) OVERRIDING SYSTEM VALUE SELECT ${fields} FROM ${BASELINE}.${name}`,
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
