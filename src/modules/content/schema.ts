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
import { audience, publicationStatus } from "@/db/enums";
import { person } from "@/modules/people/schema";

// Contenido editable del portal: páginas, cartelera y medios (03-modelo-de-datos.md, ADR-033).

export const mediaVisibility = pgEnum("media_visibility", ["PUBLIC", "PRIVATE"]);
export const mediaStatus = pgEnum("media_status", ["PENDING", "READY", "FAILED"]);

/** Una variante generada por `media.process`; la clave del mapa es `w<ancho>`. */
export interface MediaVariant {
  key: string;
  width: number;
  height: number;
  byteSize: number;
  contentType: string;
}

export type MediaVariants = Record<string, MediaVariant>;

// Páginas fijas del portal (La OE, Unirse, Privacidad); nacen en borrador en la migración 0003.
export const page = pgTable(
  "page",
  {
    id: id(),
    slug: text().notNull(),
    title: text().notNull(),
    body: text().notNull().default(""), // Markdown
    status: publicationStatus().notNull().default("DRAFT"),
    audience: audience().notNull().default("PUBLIC"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("page_slug_unique").on(t.slug),
    check("page_slug_format", sql`${t.slug} ~ '^[a-z0-9-]+$'`),
  ],
);

// Cartelera: público cuando audience = PUBLIC y publishedAt ya pasó; fijados primero.
export const announcement = pgTable(
  "announcement",
  {
    id: id(),
    title: text().notNull(),
    body: text().notNull().default(""), // Markdown
    audience: audience().notNull().default("PUBLIC"),
    publishedAt: timestampTz(),
    pinned: boolean().notNull().default(false),
    pushSentAt: timestampTz(), // fase 6
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("announcement_public_idx").on(t.audience, t.publishedAt)],
);

// Referencia a un objeto del bucket (ADR-022): sin bytes en la base; las variantes las genera el outbox.
export const mediaAsset = pgTable(
  "media_asset",
  {
    id: id(),
    visibility: mediaVisibility().notNull().default("PUBLIC"),
    objectKey: text().notNull(),
    originalFilename: text().notNull(),
    contentType: text().notNull(),
    byteSize: integer().notNull(),
    width: integer(),
    height: integer(),
    variants: jsonb().$type<MediaVariants>().notNull().default(sql`'{}'::jsonb`),
    uploadedById: text().references(() => person.id, { onDelete: "set null" }),
    status: mediaStatus().notNull().default("PENDING"),
    error: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("media_asset_object_key_unique").on(t.objectKey),
    index("media_asset_status_idx").on(t.status, t.createdAt),
  ],
);
