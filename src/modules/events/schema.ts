import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { audience, publicationStatus } from "@/db/enums";
import { mediaAsset } from "@/modules/content/schema";
import { committee } from "@/modules/people/schema";

// Eventos permanentes y sus ediciones fechadas (03-modelo-de-datos.md, ADR-033).

// Identidad permanente (Días EAFIT, Inventiva, EnFemenino, Subsidios-OE); los cuatro nacen en la migración 0003.
export const event = pgTable(
  "event",
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    summary: text().notNull().default(""),
    description: text().notNull().default(""), // Markdown
    audience: audience().notNull().default("PUBLIC"),
    publicationStatus: publicationStatus().notNull().default("DRAFT"),
    coverAssetId: text().references(() => mediaAsset.id, { onDelete: "set null" }),
    sortOrder: integer().notNull().default(0), // orden en el inicio
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("event_slug_unique").on(t.slug),
    check("event_slug_format", sql`${t.slug} ~ '^[a-z0-9-]+$'`),
    index("event_public_idx").on(t.publicationStatus, t.audience, t.sortOrder),
  ],
);

// Ocurrencia fechada de un evento, con lugar y organizadores; la inscripción propia llega en la fase 5.
export const eventEdition = pgTable(
  "event_edition",
  {
    id: id(),
    eventId: text()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    slug: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(""), // Markdown
    startsAt: timestampTz().notNull(),
    endsAt: timestampTz(),
    location: text().notNull().default(""),
    registrationUrl: text(),
    publicationStatus: publicationStatus().notNull().default("DRAFT"),
    coverAssetId: text().references(() => mediaAsset.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("event_edition_event_slug_unique").on(t.eventId, t.slug),
    check("event_edition_slug_format", sql`${t.slug} ~ '^[a-z0-9-]+$'`),
    check("event_edition_dates_ordered", sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    index("event_edition_starts_idx").on(t.publicationStatus, t.startsAt),
  ],
);

// Comités organizadores de una edición.
export const editionCommittee = pgTable(
  "edition_committee",
  {
    id: id(),
    editionId: text()
      .notNull()
      .references(() => eventEdition.id, { onDelete: "cascade" }),
    committeeId: text()
      .notNull()
      .references(() => committee.id),
  },
  (t) => [uniqueIndex("edition_committee_unique").on(t.editionId, t.committeeId)],
);
