import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { person } from "@/modules/people/schema";

// Auditoría en la misma transacción, configuración y outbox transaccional (ADR-012).

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: text().references(() => person.id, { onDelete: "set null" }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    before: jsonb().$type<unknown>(),
    after: jsonb().$type<unknown>(),
    ip: text(),
    legacy: boolean().notNull().default(false),
    at: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_at_idx").on(t.at),
  ],
);

export const appConfig = pgTable("app_config", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedById: text().references(() => person.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

export const outbox = pgTable(
  "outbox",
  {
    id: id(),
    eventType: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    dedupeKey: text(),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestampTz().notNull().defaultNow(),
    processedAt: timestampTz(),
    deadLetterAt: timestampTz(),
    lastError: text(),
    createdAt: createdAt(),
  },
  (t) => [
    // Un solo pendiente por clave: una ráfaga de check-ins colapsa en un recompute.
    uniqueIndex("outbox_dedupe_key_pending_unique")
      .on(t.dedupeKey)
      .where(sql`${t.processedAt} is null and ${t.deadLetterAt} is null`),
    index("outbox_pending_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.processedAt} is null and ${t.deadLetterAt} is null`),
  ],
);
