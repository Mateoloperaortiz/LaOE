import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export type EstadoBase =
  | { ok: true; version: string; latenciaMs: number }
  | { ok: false; error: string };

/** Comprueba la base de datos con una consulta trivial y devuelve su versión. */
export async function comprobarBaseDeDatos(): Promise<EstadoBase> {
  const inicio = performance.now();
  try {
    const filas = await getDb().execute<{ version: string }>(sql`select version() as version`);
    const version = filas.rows[0]?.version ?? "desconocida";
    return { ok: true, version, latenciaMs: Math.round(performance.now() - inicio) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
