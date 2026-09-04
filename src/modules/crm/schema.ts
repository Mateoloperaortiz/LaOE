import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";

// CRM de comunidad (02-crm.md, ADR-034): línea de tiempo, tareas y onboarding. Etiquetas y segmentos
// viven en el esquema de `people` (el listado de personas los usa y people no depende de crm);
// organizaciones, pipelines y tarjetas llegan en la fase 5.

export const taskStatus = pgEnum("task_status", ["OPEN", "DONE"]);

/** Tipos de interacción: fase 2 más PARTICIPATION (fase 3); los de fases siguientes se agregan al escribirlos. */
export type InteractionKind =
  | "NOTE"
  | "IMPORTED"
  | "MEMBERSHIP"
  | "COMMITTEES"
  | "APPOINTMENT"
  | "CONSENT"
  | "DATA"
  | "PERMISSION"
  | "PARTICIPATION"
  | "OTHER";

// Automáticas inmutables (escritas por el handler crm.timeline con refType = 'outbox'); notas editables por su autor.
export const interaction = pgTable(
  "interaction",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    kind: text().$type<InteractionKind>().notNull(),
    occurredAt: timestampTz().notNull().defaultNow(),
    actorId: text().references(() => person.id, { onDelete: "set null" }),
    refType: text(),
    refId: text(),
    summary: text().notNull(),
    body: text(), // Markdown, solo notas
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    editedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    index("interaction_person_idx").on(t.personId, t.occurredAt),
    // Una interacción automática por evento del outbox: el handler es idempotente.
    uniqueIndex("interaction_ref_unique").on(t.refType, t.refId).where(sql`${t.refId} is not null`),
  ],
);

export const task = pgTable(
  "task",
  {
    id: id(),
    title: text().notNull(),
    kind: text().notNull().default("GENERAL"), // GENERAL, DELETION_REQUEST
    assigneeId: text().references(() => person.id, { onDelete: "set null" }),
    dueAt: timestampTz(),
    status: taskStatus().notNull().default("OPEN"),
    personId: text().references(() => person.id, { onDelete: "cascade" }),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    completedAt: timestampTz(),
    completedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("task_assignee_idx").on(t.assigneeId, t.status),
    index("task_person_idx").on(t.personId),
    index("task_status_due_idx").on(t.status, t.dueAt),
  ],
);

// Pasos de la primera semana (ADR-031): los pasos viven en AppConfig (onboarding.steps).
export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    stepKey: text().notNull(),
    doneAt: timestampTz(),
    source: text().notNull().default("MANUAL"), // AUTO, MANUAL
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("onboarding_progress_unique").on(t.personId, t.termId, t.stepKey)],
);
