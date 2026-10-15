import { sql } from "drizzle-orm";
import type { Tx } from "@/db/tx";

/**
 * Los rewards pertenecen a la persona, no al término. Un escritor de varias personas toma esta
 * barrera global antes del término y de cualquier fila/reward: así dos semestres todavía abiertos
 * tampoco invierten A → B y B → A. Los escritores de una persona conservan su paralelismo.
 */
export async function lockParticipationBatch(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('participation-batch', 0))`);
}
