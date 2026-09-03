import { and, eq } from "drizzle-orm";
import type { CommandContext } from "@/db/tx";
import { auditLog } from "../schema";

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
