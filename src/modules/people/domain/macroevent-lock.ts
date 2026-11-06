import { sql } from "drizzle-orm";
import type { Executor } from "@/db/tx";

/** Las altas, retiros, constancias y cortes ven una sola mesa por evento (ADR-157). */
export async function lockMacroeventGovernance(exec: Executor, eventId: string) {
  await exec.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`macroevent-governance:${eventId}`}, 0))`,
  );
}
