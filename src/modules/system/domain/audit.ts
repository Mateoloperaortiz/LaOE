import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { auditLog } from "../schema";

/** Hechos de una entidad para reconstruir su historia; usa la conexión de la lectura o comando. */
export async function listEntityAuditFacts(
  entityType: string,
  entityId: string,
  actions: readonly string[],
  exec: Executor = getDb(),
) {
  if (actions.length === 0) return [];
  return exec
    .select({
      action: auditLog.action,
      before: auditLog.before,
      after: auditLog.after,
      at: auditLog.at,
    })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, entityType),
        eq(auditLog.entityId, entityId),
        inArray(auditLog.action, [...actions]),
      ),
    )
    .orderBy(asc(auditLog.at), asc(auditLog.id));
}

/** Borra el contenido (before/after) de la auditoría de una entidad sin borrar la traza: anonimización (ADR-030). */
export async function redactAuditEntries(
  ctx: CommandContext,
  entityType: string,
  entityId: string,
): Promise<number> {
  const rows = await ctx.tx
    .update(auditLog)
    .set({ before: null, after: null })
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .returning({ id: auditLog.id });
  return rows.length;
}
