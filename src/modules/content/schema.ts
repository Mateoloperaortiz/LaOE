import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
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

// Contenido editable del portal: páginas, cartelera, medios y normativa (03-modelo-de-datos.md, ADR-033, ADR-034).

export const mediaVisibility = pgEnum("media_visibility", ["PUBLIC", "PRIVATE"]);
export const mediaStatus = pgEnum("media_status", ["PENDING", "READY", "FAILED"]);
export const documentKind = pgEnum("document_kind", ["ESTATUTOS", "REGLAMENTO", "ACTA", "OTRO"]);

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

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

// Normativa (ADR-034): el PDF es un objeto propio del bucket privado; se abre por enlace prefirmado.
export const document = pgTable(
  "document",
  {
    id: id(),
    title: text().notNull(),
    kind: documentKind().notNull().default("OTRO"),
    fileKey: text().notNull(), // documents/<id>.pdf
    originalFilename: text().notNull(),
    byteSize: integer().notNull(),
    sha256: text(),
    version: text().notNull(), // fecha de la reforma u otra marca de versión
    audience: audience().notNull().default("MEMBERS"),
    status: publicationStatus().notNull().default("DRAFT"),
    uploadedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("document_file_key_unique").on(t.fileKey)],
);

// Un artículo citable, cargado desde el JSON del extractor; la búsqueda usa el tsvector en español.
export const documentArticle = pgTable(
  "document_article",
  {
    id: id(),
    documentId: text()
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    articleKey: text().notNull(),
    chapterKey: text().notNull(),
    chapterTitle: text().notNull(),
    number: text().notNull(),
    title: text().notNull().default(""),
    body: text().notNull(),
    pages: jsonb().$type<number[]>().notNull().default(sql`'[]'::jsonb`),
    sortOrder: integer().notNull().default(0),
    search: tsvector("search").generatedAlwaysAs(
      sql`to_tsvector('spanish', coalesce(title, '') || ' ' || body)`,
    ),
  },
  (t) => [
    uniqueIndex("document_article_key_unique").on(t.documentId, t.articleKey),
    index("document_article_search_idx").using("gin", t.search),
  ],
);
