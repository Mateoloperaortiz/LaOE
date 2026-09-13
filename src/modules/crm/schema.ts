import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { announcement } from "@/modules/content/schema";
import { eventEdition } from "@/modules/events/schema";
import { form, formSubmission } from "@/modules/forms/schema";
import { occasion } from "@/modules/participation/schema";
import { committee, person, tag } from "@/modules/people/schema";
import { workGroup } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";

// CRM de comunidad (02-crm.md, ADR-034, ADR-037): línea de tiempo, tareas, onboarding, reconocimientos,
// organizaciones, pipelines, tarjetas, solicitudes y convocatorias. Etiquetas y segmentos viven en el
// esquema de `people` (el listado de personas los usa y people no depende de crm).

export const taskStatus = pgEnum("task_status", ["OPEN", "DONE"]);
export const organizationKind = pgEnum("organization_kind", [
  "COMPANY",
  "EAFIT_UNIT",
  "STUDENT_GROUP",
  "OTHER",
]);
export const pipelineKind = pgEnum("pipeline_kind", ["ADMISSION", "SPONSORSHIP", "CUSTOM"]);
// EXCUSE: excusa válida sobre una ocasión (ADR-060 regla 5).
export const requestKind = pgEnum("request_kind", ["LEAVE", "RESIGNATION", "TRANSFER", "EXCUSE"]);
export const requestStatus = pgEnum("request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);
export const callSelection = pgEnum("call_selection", ["FIRST_COME", "MANUAL"]);
export const callStatus = pgEnum("call_status", ["DRAFT", "OPEN", "CLOSED"]);
export const callEntryStatus = pgEnum("call_entry_status", [
  "APPLIED",
  "ACCEPTED",
  "WAITLISTED",
  "REJECTED",
]);

/** Tipos de interacción: fase 2, PARTICIPATION (fase 3), PERMANENCE (fase 4) y FORM, PIPELINE, REQUEST y CALL (fase 5). */
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
  | "PERMANENCE"
  | "FORM"
  | "PIPELINE"
  | "REQUEST"
  | "CALL"
  | "OTHER";

// Organización (ADR-037): empresa, unidad de EAFIT, grupo estudiantil u otra; sus contactos son personas EXTERNAL.
export const organization = pgTable(
  "organization",
  {
    id: id(),
    name: text().notNull(),
    kind: organizationKind().notNull().default("OTHER"),
    website: text(),
    notes: text().notNull().default(""), // Markdown
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("organization_name_unique").on(sql`lower(${t.name})`)],
);

export const organizationContact = pgTable(
  "organization_contact",
  {
    id: id(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    role: text(),
    isPrimary: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("organization_contact_unique").on(t.organizationId, t.personId),
    uniqueIndex("organization_contact_primary_unique")
      .on(t.organizationId)
      .where(sql`${t.isPrimary} = true`),
    index("organization_contact_person_idx").on(t.personId),
  ],
);

export const organizationTag = pgTable(
  "organization_tag",
  {
    id: id(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    tagId: text()
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("organization_tag_unique").on(t.organizationId, t.tagId)],
);

// Pipeline con etapas ordenadas; crearlo siembra la plantilla de su tipo (02-crm.md).
export const pipeline = pgTable("pipeline", {
  id: id(),
  name: text().notNull(),
  kind: pipelineKind().notNull().default("CUSTOM"),
  isArchived: boolean().notNull().default(false),
  createdById: text().references(() => person.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const pipelineStage = pgTable(
  "pipeline_stage",
  {
    id: id(),
    pipelineId: text()
      .notNull()
      .references(() => pipeline.id, { onDelete: "cascade" }),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    isWon: boolean().notNull().default(false),
    isLost: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("pipeline_stage_pipeline_idx").on(t.pipelineId, t.sortOrder),
    check("pipeline_stage_won_xor_lost", sql`not (${t.isWon} and ${t.isLost})`),
  ],
);

// Tarjeta: una persona o una organización avanzando por un pipeline; una por respuesta de formulario.
export const card = pgTable(
  "card",
  {
    id: id(),
    pipelineId: text()
      .notNull()
      .references(() => pipeline.id, { onDelete: "cascade" }),
    stageId: text()
      .notNull()
      .references(() => pipelineStage.id),
    personId: text().references(() => person.id, { onDelete: "cascade" }),
    organizationId: text().references(() => organization.id, { onDelete: "cascade" }),
    editionId: text().references(() => eventEdition.id, { onDelete: "set null" }),
    submissionId: text().references(() => formSubmission.id, { onDelete: "set null" }),
    ownerId: text().references(() => person.id, { onDelete: "set null" }),
    title: text().notNull(),
    fields: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    amount: numeric({ precision: 12, scale: 2, mode: "number" }),
    dueAt: timestampTz(),
    enteredStageAt: timestampTz().notNull().defaultNow(),
    closedAt: timestampTz(),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("card_stage_idx").on(t.pipelineId, t.stageId),
    index("card_person_idx").on(t.personId),
    index("card_organization_idx").on(t.organizationId),
    uniqueIndex("card_submission_unique")
      .on(t.submissionId)
      .where(sql`${t.submissionId} is not null`),
    check("card_one_subject", sql`(${t.personId} is null) <> (${t.organizationId} is null)`),
  ],
);

// Automáticas inmutables (escritas por el handler crm.timeline con refType = 'outbox'); notas editables por su autor.
// Desde la fase 5 el sujeto puede ser una organización.
export const interaction = pgTable(
  "interaction",
  {
    id: id(),
    personId: text().references(() => person.id, { onDelete: "cascade" }),
    organizationId: text().references(() => organization.id, { onDelete: "cascade" }),
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
    index("interaction_organization_idx").on(t.organizationId, t.occurredAt),
    // Una interacción automática por evento del outbox: el handler es idempotente.
    uniqueIndex("interaction_ref_unique").on(t.refType, t.refId).where(sql`${t.refId} is not null`),
    check(
      "interaction_has_subject",
      sql`${t.personId} is not null or ${t.organizationId} is not null`,
    ),
  ],
);

export const task = pgTable(
  "task",
  {
    id: id(),
    title: text().notNull(),
    kind: text().notNull().default("GENERAL"), // GENERAL, DELETION_REQUEST, REQUEST
    assigneeId: text().references(() => person.id, { onDelete: "set null" }),
    dueAt: timestampTz(),
    status: taskStatus().notNull().default("OPEN"),
    personId: text().references(() => person.id, { onDelete: "cascade" }),
    organizationId: text().references(() => organization.id, { onDelete: "cascade" }),
    cardId: text().references(() => card.id, { onDelete: "set null" }),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    completedAt: timestampTz(),
    completedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("task_assignee_idx").on(t.assigneeId, t.status),
    index("task_person_idx").on(t.personId),
    index("task_organization_idx").on(t.organizationId),
    index("task_status_due_idx").on(t.status, t.dueAt),
  ],
);

// Solicitud del miembro (ADR-031, ADR-037): nada cambia hasta que GH la aprueba; aprobar ejecuta el
// comando de `people` en la misma transacción; una pendiente por persona y tipo.
export const request = pgTable(
  "request",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    kind: requestKind().notNull(),
    termId: text()
      .notNull()
      .references(() => term.id),
    /** La ocasión de una excusa (ADR-060 regla 5); nula en los demás tipos. */
    occasionId: text().references(() => occasion.id, { onDelete: "cascade" }),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: requestStatus().notNull().default("PENDING"),
    taskId: text().references(() => task.id, { onDelete: "set null" }),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    decidedAt: timestampTz(),
    reason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Una pendiente por persona y tipo; las excusas (las únicas con ocasión, ver el check), una
    // pendiente por persona y ocasión. Los predicados no nombran el valor nuevo del enum: un cast
    // enum → text no es inmutable y un índice no lo admite.
    uniqueIndex("request_pending_unique")
      .on(t.personId, t.kind)
      .where(sql`${t.status} = 'PENDING' and ${t.occasionId} is null`),
    uniqueIndex("request_excuse_pending_unique")
      .on(t.personId, t.occasionId)
      .where(sql`${t.status} = 'PENDING' and ${t.occasionId} is not null`),
    index("request_status_idx").on(t.status, t.createdAt),
    index("request_person_idx").on(t.personId),
    check(
      "request_reason_when_rejected",
      sql`${t.status} <> 'REJECTED' or ${t.reason} is not null`,
    ),
    check(
      "request_excuse_has_occasion",
      // Solo las excusas llevan ocasión y todas la llevan; `::text` evita usar el valor nuevo del
      // enum en la misma transacción que lo agrega.
      sql`(${t.kind}::text = 'EXCUSE') = (${t.occasionId} is not null)`,
    ),
  ],
);

// Convocatoria interna a un grupo de trabajo (ADR-031, ADR-037): formulario opcional, cupo, ventana y selección.
export const internalCall = pgTable(
  "internal_call",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    groupId: text()
      .notNull()
      .references(() => workGroup.id, { onDelete: "cascade" }),
    formId: text().references(() => form.id, { onDelete: "set null" }),
    title: text().notNull(),
    description: text().notNull().default(""), // Markdown
    opensAt: timestampTz().notNull(),
    closesAt: timestampTz().notNull(),
    capacity: integer(),
    selection: callSelection().notNull().default("FIRST_COME"),
    status: callStatus().notNull().default("DRAFT"),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("internal_call_group_idx").on(t.groupId),
    index("internal_call_term_status_idx").on(t.termId, t.status),
    check("internal_call_window", sql`${t.closesAt} > ${t.opensAt}`),
    check("internal_call_capacity_positive", sql`${t.capacity} is null or ${t.capacity} > 0`),
  ],
);

// Inscripción a una convocatoria: aceptada crea la pertenencia al grupo por outbox.
export const internalCallEntry = pgTable(
  "internal_call_entry",
  {
    id: id(),
    callId: text()
      .notNull()
      .references(() => internalCall.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    submissionId: text().references(() => formSubmission.id, { onDelete: "set null" }),
    status: callEntryStatus().notNull().default("APPLIED"),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    decidedAt: timestampTz(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("internal_call_entry_unique").on(t.callId, t.personId),
    index("internal_call_entry_person_idx").on(t.personId),
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

export const recognitionKind = pgEnum("recognition_kind", ["MEMBER_OF_MONTH", "OTHER"]);

// Reconocimiento (ADR-031, ADR-036): el destacado del mes que nombra el líder desde su tabla de permanencia
// u otro mérito de ADMIN; con consentimiento de directorio se publica como anuncio del comité.
export const recognition = pgTable(
  "recognition",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    kind: recognitionKind().notNull().default("MEMBER_OF_MONTH"),
    committeeId: text().references(() => committee.id),
    termId: text()
      .notNull()
      .references(() => term.id),
    month: integer(),
    title: text().notNull(),
    announcementId: text().references(() => announcement.id, { onDelete: "set null" }),
    grantedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("recognition_month_unique")
      .on(t.termId, t.committeeId, t.month)
      .where(sql`${t.kind} = 'MEMBER_OF_MONTH'`),
    index("recognition_person_idx").on(t.personId, t.termId),
    check("recognition_month_valid", sql`${t.month} is null or (${t.month} between 1 and 12)`),
    check(
      "recognition_member_of_month_complete",
      sql`${t.kind} <> 'MEMBER_OF_MONTH' or (${t.committeeId} is not null and ${t.month} is not null)`,
    ),
  ],
);
