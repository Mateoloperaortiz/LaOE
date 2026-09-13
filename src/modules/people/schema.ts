import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
// La expulsión y la pérdida de la calidad de estudiante son causales propias (ADR-060 regla 3).
export const membershipEndReason = pgEnum("membership_end_reason", [
  "GRADUATION",
  "RESIGNATION",
  "PERMANENCE",
  "EXPULSION",
  "STUDENT_STATUS_LOST",
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

// Condición de la persona en un término: periodo de prueba (umbral 80 %). Sin comité aplica a todos
// sus comités (la carga el roster o ADMIN); con comité, solo a ese (la escribe el cierre para el
// comité donde quedó en la banda, o ADMIN eligiéndolo): la categoría es por comité (ADR-060 regla 2).
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
    committeeId: text().references(() => committee.id),
    probation: boolean().notNull().default(false),
    reason: text(),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("membership_term_person_term_unique")
      .on(t.personId, t.termId)
      .where(sql`${t.committeeId} is null`),
    uniqueIndex("membership_term_committee_unique")
      .on(t.personId, t.termId, t.committeeId)
      .where(sql`${t.committeeId} is not null`),
  ],
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

// Catálogo de cargos dentro del comité (ADR-029, ADR-058): cuáles son dirección, cuáles no pueden
// faltar en un comité y qué capacidades habilita cada uno (vocabulario cerrado en domain/capabilities.ts).
// Un cargo retirado (ADR-060 regla 4) no se ofrece al nombrar; los vivos que lo tengan siguen hasta
// cerrarse y el roster lo traduce al que lo reemplaza (Publicidad → Mercadeo desde los Estatutos 2026).
export const committeeRole = pgTable("committee_role", {
  code: text().primaryKey(),
  label: text().notNull(),
  isLeadership: boolean().notNull().default(false),
  required: boolean().notNull().default(false),
  capabilities: text().array().notNull().default(sql`'{}'::text[]`),
  sortOrder: integer().notNull().default(0),
  retired: boolean().notNull().default(false),
  replacedByCode: text().references((): AnyPgColumn => committeeRole.code),
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
    // Cargo principal derivado de `committee_role_assignment` (ADR-058): el vivo de menor orden, o
    // MIEMBRO si no hay ninguno. Lo recalcula cada escritura; los cargos completos viven abajo.
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
    index("committee_membership_term_idx").on(t.termId, t.committeeId),
  ],
);

// Cargos asignados a una pertenencia (ADR-058): titular o codirección por cargo, con inicio y fin.
// `personId`, `committeeId` y `termId` se copian de la pertenencia para que los índices únicos vivan
// en la base: un titular y una codirección por cargo, comité y término, y sin cargo repetido en la
// misma pertenencia.
export const committeeRoleAssignment = pgTable(
  "committee_role_assignment",
  {
    id: id(),
    membershipId: text()
      .notNull()
      .references(() => committeeMembership.id, { onDelete: "cascade" }),
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
      .references(() => committeeRole.code),
    coDirector: boolean().notNull().default(false),
    startedAt: timestampTz().notNull().defaultNow(),
    endedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("committee_role_assignment_titular_unique")
      .on(t.committeeId, t.termId, t.roleCode)
      .where(sql`${t.coDirector} = false and ${t.endedAt} is null`),
    uniqueIndex("committee_role_assignment_codireccion_unique")
      .on(t.committeeId, t.termId, t.roleCode)
      .where(sql`${t.coDirector} = true and ${t.endedAt} is null`),
    uniqueIndex("committee_role_assignment_membership_role_unique")
      .on(t.membershipId, t.roleCode)
      .where(sql`${t.endedAt} is null`),
    index("committee_role_assignment_person_term_idx").on(t.personId, t.termId),
    index("committee_role_assignment_committee_term_idx").on(t.committeeId, t.termId),
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

// Faltas y sanciones del Reglamento (cap. 9 y Anexo 1; ADR-060 regla 6): un llamado de atención
// suspende derechos y beneficios 7 días y una falta leve 20; una suspensión explícita dura hasta un
// mes; una falta grave no suspende pero advierte de expulsión; la inhabilidad para cargos dura un año;
// toda falta vence al año. Las fechas derivadas se calculan en domain/sanction-pure.ts al registrar.
export const sanctionKind = pgEnum("sanction_kind", [
  "WARNING",
  "MINOR",
  "MAJOR",
  "SUSPENSION",
  "OFFICE_BAN",
]);

export const sanction = pgTable(
  "sanction",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    /** Comité o macroevento que la impuso; nulo cuando la impone la junta. */
    committeeId: text().references(() => committee.id),
    kind: sanctionKind().notNull(),
    /** Los hechos y los descargos, en palabras de quien la registra. */
    cause: text().notNull(),
    /** Artículo o numeral del Anexo 1 que aplica, si se cita. */
    reference: text(),
    occurredOn: date({ mode: "string" }).notNull(),
    suspendedFrom: date({ mode: "string" }),
    suspendedUntil: date({ mode: "string" }),
    expiresOn: date({ mode: "string" }).notNull(),
    issuedById: text().references(() => person.id, { onDelete: "set null" }),
    revokedAt: timestampTz(),
    revokedById: text().references(() => person.id, { onDelete: "set null" }),
    revokeReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("sanction_person_idx").on(t.personId, t.expiresOn),
    index("sanction_term_idx").on(t.termId),
    check(
      "sanction_suspension_consistent",
      sql`(${t.suspendedFrom} is null) = (${t.suspendedUntil} is null)`,
    ),
    check(
      "sanction_suspension_ordered",
      sql`${t.suspendedUntil} is null or ${t.suspendedUntil} >= ${t.suspendedFrom}`,
    ),
    check("sanction_expires_after", sql`${t.expiresOn} >= ${t.occurredOn}`),
    check(
      "sanction_revoke_consistent",
      sql`(${t.revokedAt} is null) = (${t.revokeReason} is null)`,
    ),
  ],
);
