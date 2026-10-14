import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { logger } from "@/shared/log";

export type DatabaseStatus =
  | { ok: true; version: string; latencyMs: number }
  | { ok: false; error: "database_unavailable" };

/**
 * Comprueba la base de datos con una consulta trivial y devuelve su versión. Si la base no responde,
 * lo que vuelve es un valor fijo: esto lo lee cualquiera por `/api/health`, y el texto de un error
 * de conexión nombra el host, el puerto, el usuario o la base. El error va al registro, cuyo
 * serializador le quita esos datos y le deja el código (ADR-121 regla 7).
 */
export async function checkDatabase(): Promise<DatabaseStatus> {
  const startedAt = performance.now();
  try {
    const rows = await getDb().execute<{ version: string }>(sql`select version() as version`);
    const version = rows.rows[0]?.version ?? "unknown";
    return { ok: true, version, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    logger.error({ err: error }, "la salud no pudo consultar la base");
    return { ok: false, error: "database_unavailable" };
  }
}
