import { and, desc, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import { auditLog } from "../schema";

/**
 * La ruta declara entidades que sus módulos ya filtraron por titular; ser actor de una operación
 * administrativa no vuelve propios los datos de su sujeto. Nunca busca nombres en JSON libres.
 */
export async function collectOwnAuditData(subjects: Readonly<Record<string, string[]>>) {
  const conditions = Object.entries(subjects)
    .filter(([, ids]) => ids.length > 0)
    .map(([type, ids]) =>
      and(
        eq(auditLog.entityType, type),
        sql`${auditLog.entityId} = any(${sql.param(ids)}::text[])`,
      ),
    );
  if (conditions.length === 0) return ownDataCollections({ auditHistory: [] });
  const auditHistory = await getDb()
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      at: auditLog.at,
    })
    .from(auditLog)
    .where(or(...conditions))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(OWN_DATA_QUERY_LIMIT);
  return ownDataCollections({ auditHistory });
}
