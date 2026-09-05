import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { audience } from "@/db/enums";
import { eventEdition } from "@/modules/events/schema";
import { person } from "@/modules/people/schema";

// Formularios propios (ADR-013, ADR-037): campos y acciones en JSON validados con Zod en el dominio;
// una respuesta vincula o crea la persona por correo y ejecuta solo las acciones declaradas.

export const formStatus = pgEnum("form_status", ["DRAFT", "OPEN", "CLOSED"]);
export const registrationStatus = pgEnum("registration_status", ["REGISTERED", "CANCELLED"]);

export const form = pgTable(
  "form",
  {
    id: id(),
    slug: text().notNull(),
    title: text().notNull(),
    description: text().notNull().default(""), // Markdown
    audience: audience().notNull().default("PUBLIC"),
    status: formStatus().notNull().default("DRAFT"),
    opensAt: timestampTz(),
    closesAt: timestampTz(),
    maxSubmissions: integer(),
    allowMultiple: boolean().notNull().default(false),
    consentRequired: boolean().notNull().default(true),
    thanks: text(), // Markdown; si falta, T-859
    fields: jsonb().$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    actions: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("form_slug_unique").on(t.slug),
    check("form_slug_format", sql`${t.slug} ~ '^[a-z0-9-]{2,60}$'`),
    check(
      "form_window_ordered",
      sql`${t.closesAt} is null or ${t.opensAt} is null or ${t.closesAt} > ${t.opensAt}`,
    ),
    check(
      "form_max_submissions_positive",
      sql`${t.maxSubmissions} is null or ${t.maxSubmissions} > 0`,
    ),
  ],
);

// Respuesta: se borra al salir de la OE o al anonimizar (ADR-030); la persona queda vinculada por correo.
export const formSubmission = pgTable(
  "form_submission",
  {
    id: id(),
    formId: text()
      .notNull()
      .references(() => form.id, { onDelete: "cascade" }),
    personId: text().references(() => person.id, { onDelete: "cascade" }),
    email: text().notNull(),
    firstName: text(),
    lastName: text(),
    answers: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    consentAcceptedAt: timestampTz(),
    policyVersion: text(),
    ip: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("form_submission_form_created_idx").on(t.formId, t.createdAt),
    index("form_submission_person_idx").on(t.personId),
    index("form_submission_ip_idx").on(t.ip, t.createdAt),
    index("form_submission_email_idx").on(t.formId, t.email),
    check("form_submission_email_lowercase", sql`${t.email} = lower(${t.email})`),
  ],
);

// Inscripción a una edición por la acción `editionId` de un formulario; única por edición y persona.
export const editionRegistration = pgTable(
  "edition_registration",
  {
    id: id(),
    editionId: text()
      .notNull()
      .references(() => eventEdition.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    submissionId: text().references(() => formSubmission.id, { onDelete: "set null" }),
    status: registrationStatus().notNull().default("REGISTERED"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("edition_registration_unique").on(t.editionId, t.personId),
    index("edition_registration_person_idx").on(t.personId),
  ],
);
