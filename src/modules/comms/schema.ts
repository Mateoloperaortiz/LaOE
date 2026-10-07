import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { person, segment } from "@/modules/people/schema";

// Comunicaciones (ADR-015, ADR-023, ADR-038): registro de todo envío a una persona, suscripciones
// push y preferencias, plantillas de correo y campañas por segmento con su audiencia congelada.

export const messageChannel = pgEnum("message_channel", ["EMAIL", "PUSH"]);
export const messageStatus = pgEnum("message_status", ["SENT", "FAILED"]);
export const messageKind = pgEnum("message_kind", [
  "TRANSACTIONAL",
  "ANNOUNCEMENT",
  "POINTS",
  "REMINDER",
  "SURVEY",
  "CAMPAIGN",
  "WORDLE",
]);
export const campaignStatus = pgEnum("campaign_status", [
  "DRAFT",
  "SCHEDULED",
  "SENDING",
  "SENT",
  "CANCELLED",
]);
export const recipientStatus = pgEnum("recipient_status", ["PENDING", "SENT", "FAILED", "SKIPPED"]);
export const skipReason = pgEnum("skip_reason", [
  "NO_EMAIL",
  "OPTED_OUT",
  "NO_CONSENT",
  "CANCELLED",
  // Se anonimizó después de congelar la audiencia: el lote la omite antes de su correo (ADR-115 regla 7).
  "ANONYMIZED",
]);

// Plantilla de correo: Markdown con variables por persona (ADR-038 regla 8).
export const emailTemplate = pgTable(
  "email_template",
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    subject: text().notNull(),
    body: text().notNull().default(""), // Markdown
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("email_template_slug_unique").on(t.slug),
    check("email_template_slug_format", sql`${t.slug} ~ '^[a-z0-9-]{2,60}$'`),
  ],
);

// Campaña: una plantilla a un segmento, en lotes por minuto; la audiencia se congela al arrancar.
export const campaign = pgTable(
  "campaign",
  {
    id: id(),
    name: text().notNull(),
    templateId: text()
      .notNull()
      .references(() => emailTemplate.id, { onDelete: "restrict" }),
    segmentId: text()
      .notNull()
      .references(() => segment.id, { onDelete: "restrict" }),
    status: campaignStatus().notNull().default("DRAFT"),
    scheduledAt: timestampTz(),
    startedAt: timestampTz(),
    finishedAt: timestampTz(),
    totalCount: integer().notNull().default(0),
    sentCount: integer().notNull().default(0),
    failedCount: integer().notNull().default(0),
    skippedCount: integer().notNull().default(0),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("campaign_status_idx").on(t.status, t.scheduledAt),
    check(
      "campaign_scheduled_has_date",
      sql`${t.status} not in ('SCHEDULED', 'SENDING', 'SENT') or ${t.scheduledAt} is not null`,
    ),
  ],
);

export const message = pgTable(
  "message",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    channel: messageChannel().notNull(),
    kind: messageKind().notNull().default("TRANSACTIONAL"),
    campaignId: text().references(() => campaign.id, { onDelete: "set null" }),
    subject: text().notNull(),
    status: messageStatus().notNull(),
    provider: text().notNull(), // console, resend, ses, webpush
    providerId: text(),
    error: text(),
    // Clave de la notificación: una fila por persona y clave hace idempotente al bus (ADR-038 regla 2)
    // y al lote de una campaña, que registra cada correo con `campaign:<id>` (ADR-115 regla 2).
    dedupeKey: text(),
    sentAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    index("message_person_idx").on(t.personId, t.createdAt),
    index("message_provider_idx").on(t.provider, t.createdAt),
    index("message_kind_idx").on(t.kind, t.createdAt),
    index("message_campaign_idx").on(t.campaignId),
    uniqueIndex("message_person_dedupe_unique")
      .on(t.personId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
);

// Destinatario de una campaña con su estado; se decide al arrancar y se actualiza por lote. El lote
// que lo va a enviar lo reclama en `claimedAt` y el reclamo vence (ADR-115 regla 1): `PENDING` con
// reclamo vigente es «un lote lo tiene»; el estado no cambia hasta que hay un resultado.
export const campaignRecipient = pgTable(
  "campaign_recipient",
  {
    id: id(),
    campaignId: text()
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    status: recipientStatus().notNull().default("PENDING"),
    skipReason: skipReason(),
    messageId: text().references(() => message.id, { onDelete: "set null" }),
    sentAt: timestampTz(),
    claimedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("campaign_recipient_unique").on(t.campaignId, t.personId),
    index("campaign_recipient_status_idx").on(t.campaignId, t.status, t.createdAt),
    check(
      "campaign_recipient_skip_reason",
      sql`(${t.status} = 'SKIPPED') = (${t.skipReason} is not null)`,
    ),
  ],
);

// Un dispositivo de una persona (ADR-038 regla 5): endpoint del servicio de push y claves del navegador.
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text(),
    createdAt: createdAt(),
    lastSeenAt: timestampTz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("push_subscription_endpoint_unique").on(t.endpoint),
    index("push_subscription_person_idx").on(t.personId),
  ],
);

// Qué quiere recibir cada persona; la fila se crea perezosa con todo encendido.
export const notificationPreference = pgTable(
  "notification_preference",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    emailCampaigns: boolean().notNull().default(true),
    pushAnnouncements: boolean().notNull().default(true),
    pushPoints: boolean().notNull().default(true),
    pushReminders: boolean().notNull().default(true),
    // El Wordle tiene interruptor propio por ser el único push diario (ADR-074 regla 4).
    pushWordle: boolean().notNull().default(true),
    unsubscribeToken: text().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notification_preference_person_unique").on(t.personId),
    uniqueIndex("notification_preference_token_unique").on(t.unsubscribeToken),
  ],
);
