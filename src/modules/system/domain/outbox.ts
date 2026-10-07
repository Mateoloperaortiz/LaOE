import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand, type Tx } from "@/db/tx";
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

/** El índice que deja un solo pendiente por clave de deduplicación (`schema.ts`). */
const PENDING_KEY_INDEX = "outbox_dedupe_key_pending_unique";

/**
 * Vuelve a poner en cola una fila en dead letter; auditado. Si su clave de deduplicación ya la ocupa otro
 * pendiente, no la reencola: la da por atendida, porque ese pendiente hace el mismo trabajo, y la
 * auditoría del reintento lo nombra (ADR-113 regla 8).
 */
export async function retryDeadLetter(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<boolean> {
  const [row] = await ctx.tx.select().from(outbox).where(eq(outbox.id, id));
  if (!row || row.deadLetterAt === null) {
    return false;
  }
  const before = { attempts: row.attempts, lastError: row.lastError };
  if (await requeue(ctx.tx, id, now)) {
    await ctx.audit({
      action: "outbox.retried",
      entityType: "outbox",
      entityId: id,
      before,
      after: { attempts: 0 },
    });
    return true;
  }
  // Solo una fila con clave choca con el índice.
  const supersededBy =
    row.dedupeKey === null ? null : await pendingIdWithKey(ctx.tx, row.dedupeKey);
  // Sale de dead letter sin correr: conserva sus intentos y, como todo lo procesado, queda sin error.
  await ctx.tx
    .update(outbox)
    .set({ processedAt: now, deadLetterAt: null, lastError: null })
    .where(eq(outbox.id, id));
  await ctx.audit({
    action: "outbox.retried",
    entityType: "outbox",
    entityId: id,
    before,
    after: { supersededBy },
  });
  return true;
}

/**
 * Reencola la fila, o devuelve `false` si su clave ya la ocupa otro pendiente. Lo decide el índice único
 * y no una lectura previa: el mismo trabajo se puede encolar mientras corre el reintento. Va en un
 * savepoint para que el rechazo del índice no deje abortada la transacción del comando.
 */
async function requeue(tx: Tx, id: string, now: Date): Promise<boolean> {
  try {
    await tx.transaction((savepoint) =>
      savepoint
        .update(outbox)
        .set({ deadLetterAt: null, attempts: 0, nextAttemptAt: now, lastError: null })
        .where(eq(outbox.id, id)),
    );
    return true;
  } catch (error) {
    if (isUniqueViolation(error, PENDING_KEY_INDEX)) {
      return false;
    }
    throw error;
  }
}

/** El pendiente que ocupa una clave, o `null` si se procesó entre el rechazo del índice y esta lectura. */
async function pendingIdWithKey(tx: Tx, dedupeKey: string): Promise<string | null> {
  const [pending] = await tx
    .select({ id: outbox.id })
    .from(outbox)
    .where(
      and(eq(outbox.dedupeKey, dedupeKey), isNull(outbox.processedAt), isNull(outbox.deadLetterAt)),
    );
  return pending?.id ?? null;
}

/**
 * El reintento de la pantalla de jobs. Quién puede hacerlo lo resuelve la action (solo ADMIN): `system`
 * no importa `identity` (ADR-110), solo reencola, o da por atendido, y audita.
 */
export async function retryDeadLetterAs(actor: Actor, id: string): Promise<boolean> {
  return runCommand(actor, (ctx) => retryDeadLetter(ctx, id));
}
