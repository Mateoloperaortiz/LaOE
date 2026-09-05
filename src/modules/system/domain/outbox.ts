import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { outbox } from "../schema";

export type OutboxState = "pending" | "dead" | "done";

export type OutboxRow = typeof outbox.$inferSelect;

export async function listOutbox(state: OutboxState, limit = 50): Promise<OutboxRow[]> {
  const condition =
    state === "pending"
      ? and(isNull(outbox.processedAt), isNull(outbox.deadLetterAt))
      : state === "dead"
        ? isNotNull(outbox.deadLetterAt)
        : isNotNull(outbox.processedAt);
  return getDb()
    .select()
    .from(outbox)
    .where(condition)
    .orderBy(desc(outbox.createdAt))
    .limit(limit);
}

/** Trabajos que agotaron sus intentos (tablero del admin, ADR-037 regla 11). */
export async function countDeadLetters(): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(outbox)
    .where(isNotNull(outbox.deadLetterAt));
  return row?.n ?? 0;
}

/** Vuelve a poner en cola una fila en dead letter; auditado. */
export async function retryDeadLetter(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<boolean> {
  const [row] = await ctx.tx.select().from(outbox).where(eq(outbox.id, id));
  if (!row || row.deadLetterAt === null) {
    return false;
  }
  await ctx.tx
    .update(outbox)
    .set({ deadLetterAt: null, attempts: 0, nextAttemptAt: now, lastError: null })
    .where(eq(outbox.id, id));
  await ctx.audit({
    action: "outbox.retried",
    entityType: "outbox",
    entityId: id,
    before: { attempts: row.attempts, lastError: row.lastError },
    after: { attempts: 0 },
  });
  return true;
}
