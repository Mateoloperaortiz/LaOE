import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { publicationStatus } from "@/db/enums";
import { term } from "@/modules/terms/schema";

// La persona es el eje del CRM (ADR-002); la membresía es su ciclo de vida (ADR-003).

export const personKind = pgEnum("person_kind", ["STUDENT", "EXTERNAL"]);
export const personStage = pgEnum("person_stage", ["PROSPECT", "APPLICANT", "MEMBER", "ALUMNI"]);
export const membershipStatus = pgEnum("membership_status", [
  "ACTIVE",
  "ON_LEAVE",
  "HONORARY",
  "INACTIVE",
]);
export const membershipEndReason = pgEnum("membership_end_reason", [
  "GRADUATION",
  "RESIGNATION",
  "PERMANENCE",
  "OTHER",
]);
export const committeeStatus = pgEnum("committee_status", ["ACTIVE", "INACTIVE"]);
export const consentPurpose = pgEnum("consent_purpose", [
  "MEMBERSHIP",
  "COMMUNICATIONS",
  "DIRECTORY_PHOTO",
  "MEMORIAL",
  "DATA_PROCESSING",
]);
export const consentSource = pgEnum("consent_source", ["FORM", "IMPORT", "ADMIN", "SELF"]);
export const appointmentKind = pgEnum("appointment_kind", [
  "PRESIDENT",
  "VP_GH",
  "VP_PUBLIC_RELATIONS",
  "VP_ADMIN",
  "VP_FINANCE",
  "VP_COMMUNICATIONS",
  "GH_HEAD",
  "GH_DIRECTOR",
  "OTHER",
]);

export const person = pgTable(
  "person",
  {
    id: id(),
    email: text().notNull(), // identidad de acceso, siempre en minúsculas
    kind: personKind().notNull().default("STUDENT"),
    stage: personStage().notNull().default("PROSPECT"),
    firstName: text().notNull(),
    lastName: text().notNull(),
    fullName: text().generatedAlwaysAs(sql`first_name || ' ' || last_name`),
    preferredName: text(),
    phone: text(),
    personalEmail: text(), // contacto, nunca identidad
    program: text(),
    documentType: text(),
    documentNumber: text(),
    epikId: text(),
    birthDate: date({ mode: "string" }),
    // Referencia a media_asset validada en el dominio: una clave foránea aquí haría un ciclo content ↔ people.
    photoAssetId: text(),
    source: text().notNull().default("ADMIN"),
    // Las sesiones creadas antes de esta marca no valen: cambiar estado o correo la estampa (ADR-034).
    sessionsRevokedAt: timestampTz(),
    deletionRequestedAt: timestampTz(),
    anonymizedAt: timestampTz(),
    legacyId: text(), // id de Member en GHPOINTS
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("person_email_unique").on(t.email),
    uniqueIndex("person_legacy_id_unique").on(t.legacyId).where(sql`${t.legacyId} is not null`),
    check("person_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("person_document_type_known", sql`${t.documentType} in ('CC', 'TI', 'CE', 'PPT')`),
    index("person_stage_idx").on(t.stage),
  ],
);

// Consentimiento versionado por propósito (ADR-014): una fila por aceptación; revocar estampa revokedAt.
export const consent = pgTable(
  "consent",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    purpose: consentPurpose().notNull(),
    source: consentSource().notNull(),
    policyVersion: text().notNull(),
    acceptedAt: createdAt(),
    ip: text(),
    revokedAt: timestampTz(),
  },
  (t) => [
    uniqueIndex("consent_live_unique").on(t.personId, t.purpose).where(sql`${t.revokedAt} is null`),
    index("consent_person_idx").on(t.personId, t.purpose),
  ],
);

// Cargo de junta o de GH, visible y con historia; el líder de comité es roleCode = GENERAL (ADR-034).
export const appointment = pgTable(
  "appointment",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    kind: appointmentKind().notNull(),
    committeeId: text().references(() => committee.id),
    termId: text()
      .notNull()
      .references(() => term.id),
    title: text(),
    createdAt: createdAt(),
  },
  (t) => [index("appointment_person_idx").on(t.personId, t.termId)],
);

// Condición de la persona en un término: periodo de prueba (umbral 80 %), decidido en el cierre anterior o por el roster.
export const membershipTerm = pgTable(
  "membership_term",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    probation: boolean().notNull().default(false),
    reason: text(),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_term_person_term_unique").on(t.personId, t.termId)],
);

export const membership = pgTable(
  "membership",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    status: membershipStatus().notNull().default("ACTIVE"),
    // Una baja o anonimización invalida las credenciales anteriores aun antes de drenar el outbox.
    walletEpoch: integer().notNull().default(0),
    firstTermId: text()
      .notNull()
      .references(() => term.id),
    lastTermId: text().references(() => term.id),
    endedAt: timestampTz(),
    endReason: membershipEndReason(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("membership_person_unique").on(t.personId),
    index("membership_status_idx").on(t.status),
    check("membership_end_consistent", sql`(${t.endedAt} is null) = (${t.endReason} is null)`),
  ],
);

export const membershipEvent = pgTable(
  "membership_event",
  {
    id: id(),
    membershipId: text()
      .notNull()
      .references(() => membership.id, { onDelete: "cascade" }),
    fromStatus: membershipStatus(),
    toStatus: membershipStatus().notNull(),
    reason: text(),
    actorId: text().references(() => person.id, { onDelete: "set null" }),
    at: createdAt(),
  },
  (t) => [index("membership_event_membership_idx").on(t.membershipId, t.at)],
);

export const committee = pgTable(
  "committee",
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    status: committeeStatus().notNull().default("ACTIVE"),
    color: text(),
    logoKey: text(), // archivo en public/logos/committees
    presentation: text(),
    contactUrl: text(),
    publicationStatus: publicationStatus().notNull().default("DRAFT"),
    legacyId: text(), // id de Committee en GHPOINTS
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("committee_slug_unique").on(t.slug),
    uniqueIndex("committee_legacy_id_unique").on(t.legacyId).where(sql`${t.legacyId} is not null`),
    check("committee_slug_format", sql`${t.slug} ~ '^[a-z0-9-]+$'`),
  ],
);

// Catálogo de cargos dentro del comité (ADR-029): General, Financiero, …, Miembro.
export const committeeRole = pgTable("committee_role", {
  code: text().primaryKey(),
  label: text().notNull(),
  isLeadership: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
});

export const committeeMembership = pgTable(
  "committee_membership",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    committeeId: text()
      .notNull()
      .references(() => committee.id),
    termId: text()
      .notNull()
      .references(() => term.id),
    roleCode: text()
      .notNull()
      .default("MIEMBRO")
      .references(() => committeeRole.code),
    transferredIn: boolean().notNull().default(false),
    joinedAt: timestampTz(),
    leftAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("committee_membership_person_committee_term_unique").on(
      t.personId,
      t.committeeId,
      t.termId,
    ),
    // Un solo General vivo por comité y término.
    uniqueIndex("committee_membership_one_general")
      .on(t.committeeId, t.termId)
      .where(sql`${t.roleCode} = 'GENERAL' and ${t.leftAt} is null`),
    index("committee_membership_term_idx").on(t.termId, t.committeeId),
  ],
);

// Etiquetas y segmentos describen personas, no las deciden (02-crm.md). Viven aquí y no en `crm`
// porque el listado y los exportes de personas los necesitan y `people` no depende de `crm` (ADR-034).
export const tag = pgTable(
  "tag",
  {
    id: id(),
    name: text().notNull(),
    color: text(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tag_name_unique").on(sql`lower(${t.name})`)],
);

export const personTag = pgTable(
  "person_tag",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    tagId: text()
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("person_tag_unique").on(t.personId, t.tagId)],
);

// Filtro guardado; se valida con Zod al leer (segmentFilterSchema).
export const segment = pgTable("segment", {
  id: id(),
  name: text().notNull(),
  filter: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdById: text().references(() => person.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
