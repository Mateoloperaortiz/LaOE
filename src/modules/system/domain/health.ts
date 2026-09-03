import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export type DatabaseStatus =
  | { ok: true; version: string; latencyMs: number }
  | { ok: false; error: string };

/** Comprueba la base de datos con una consulta trivial y devuelve su versión. */
export async function checkDatabase(): Promise<DatabaseStatus> {
  const startedAt = performance.now();
  try {
    const rows = await getDb().execute<{ version: string }>(sql`select version() as version`);
    const version = rows.rows[0]?.version ?? "unknown";
    return { ok: true, version, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
