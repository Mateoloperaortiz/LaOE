import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import {
  deleteObject,
  getObject,
  headObject,
  presignRead,
  presignUpload,
} from "@/shared/adapters/storage";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { document, documentArticle } from "../schema";
import {
  type ArticlesJson,
  DOCUMENT_CONTENT_TYPE,
  DOCUMENT_KEY_PATTERN,
  DOCUMENT_KINDS,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIN_BYTES,
  documentKey,
  isPdfHeader,
} from "./documents-pure";
import { DELIVERY, UPLOAD_EXPIRY_SECONDS } from "./media-pure";

// Normativa (ADR-034 regla 9): el PDF firmado sube directo al bucket privado con un POST prefirmado
// propio, se confirma con HEAD + cabecera %PDF- + sha256, y sus artículos se cargan desde el JSON del
// extractor. El lector abre el PDF por una URL prefirmada de 10 minutos.

export type DocumentRow = typeof document.$inferSelect;
export type ArticleRow = typeof documentArticle.$inferSelect;

export const prepareDocumentSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  byteSize: z.number().int().positive(),
});

export type PrepareDocumentInput = z.infer<typeof prepareDocumentSchema>;

export interface PreparedDocumentUpload {
  key: string;
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}

function sizeAllowed(byteSize: number): boolean {
  return (
    Number.isInteger(byteSize) && byteSize >= DOCUMENT_MIN_BYTES && byteSize <= DOCUMENT_MAX_BYTES
  );
}

/** ADMIN pide un POST prefirmado de 10 minutos para un PDF de 1 KB a 20 MB. */
export async function prepareDocumentUpload(
  input: PrepareDocumentInput,
): Promise<PreparedDocumentUpload> {
  if (!input.filename.toLowerCase().endsWith(".pdf")) {
    throw new DomainError(t("T-501"), "file");
  }
  if (!sizeAllowed(input.byteSize)) {
    throw new DomainError(t("T-519"), "file");
  }
  const key = documentKey(createId());
  const upload = await presignUpload({
    key,
    contentType: DOCUMENT_CONTENT_TYPE,
    minBytes: DOCUMENT_MIN_BYTES,
    maxBytes: DOCUMENT_MAX_BYTES,
    expiresInSeconds: UPLOAD_EXPIRY_SECONDS,
  });
  return { key, url: upload.url, fields: upload.fields, expiresAt: upload.expiresAt.toISOString() };
}

export const confirmDocumentSchema = z.object({
  key: z.string().regex(DOCUMENT_KEY_PATTERN),
  filename: z.string().trim().min(1).max(200),
  title: z.string().trim().min(2).max(200),
  kind: z.enum(DOCUMENT_KINDS),
  version: z.string().trim().min(1).max(60),
  audience: z.enum(["PUBLIC", "MEMBERS"]).default("MEMBERS"),
});

export type ConfirmDocumentInput = z.infer<typeof confirmDocumentSchema>;

/** Comprueba el objeto (HEAD, cabecera %PDF-, tamaño), calcula el sha256 y registra el documento en borrador. */
export async function confirmDocument(
  ctx: CommandContext,
  input: ConfirmDocumentInput,
): Promise<{ id: string }> {
  const info = await headObject(input.key);
  if (!info || info.byteSize === null) {
    throw new DomainError(t("T-518"), "file");
  }
  if ((info.contentType ?? "") !== DOCUMENT_CONTENT_TYPE || !sizeAllowed(info.byteSize)) {
    await deleteObject(input.key);
    throw new DomainError(
      t(info.contentType === DOCUMENT_CONTENT_TYPE ? "T-519" : "T-501"),
      "file",
    );
  }
  const bytes = await getObject(input.key);
  if (!isPdfHeader(bytes)) {
    await deleteObject(input.key);
    throw new DomainError(t("T-501"), "file");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [row] = await ctx.tx
    .insert(document)
    .values({
      title: input.title,
      kind: input.kind,
      fileKey: input.key,
      originalFilename: input.filename,
      byteSize: info.byteSize,
      sha256,
      version: input.version,
      audience: input.audience,
      uploadedById: ctx.actor.personId,
    })
    .returning({ id: document.id });
  if (!row) {
    throw new Error("No se pudo registrar el documento");
  }
  await ctx.audit({
    action: "document.uploaded",
    entityType: "document",
    entityId: row.id,
    after: { fileKey: input.key, byteSize: info.byteSize, sha256, kind: input.kind },
  });
  return row;
}

export function confirmDocumentAs(
  actor: Actor,
  input: ConfirmDocumentInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => confirmDocument(ctx, input));
}

export interface DocumentListRow extends DocumentRow {
  articleCount: number;
}

// Con alias explícitos: dentro de un `sql` Drizzle no califica las columnas y `"id"` sería el del artículo.
const articleCount = sql<number>`(
  select count(*)::int from document_article da where da.document_id = document.id
)`;

export async function listDocuments(params: {
  q: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: DocumentListRow[]; total: number }> {
  const db = getDb();
  const where = params.q ? ilike(document.title, `%${params.q}%`) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({ row: document, articleCount })
      .from(document)
      .where(where)
      .orderBy(desc(document.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(document).where(where),
  ]);
  return {
    rows: rows.map((item) => ({ ...item.row, articleCount: item.articleCount })),
    total: totals[0]?.n ?? 0,
  };
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const [row] = await getDb().select().from(document).where(eq(document.id, id)).limit(1);
  return row ?? null;
}

async function setStatus(
  ctx: CommandContext,
  id: string,
  status: "DRAFT" | "PUBLISHED",
): Promise<void> {
  const [row] = await ctx.tx.select().from(document).where(eq(document.id, id));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status === status) {
    return;
  }
  await ctx.tx.update(document).set({ status }).where(eq(document.id, id));
  await ctx.audit({
    action: status === "PUBLISHED" ? "document.published" : "document.unpublished",
    entityType: "document",
    entityId: id,
    before: { status: row.status },
    after: { status },
  });
}

export function publishDocument(ctx: CommandContext, id: string): Promise<void> {
  return setStatus(ctx, id, "PUBLISHED");
}

export function unpublishDocument(ctx: CommandContext, id: string): Promise<void> {
  return setStatus(ctx, id, "DRAFT");
}

/** Reemplaza todos los artículos del documento por los del JSON, en una sola transacción. */
export async function replaceArticles(
  ctx: CommandContext,
  documentId: string,
  json: ArticlesJson,
): Promise<number> {
  const [row] = await ctx.tx
    .select({ id: document.id })
    .from(document)
    .where(eq(document.id, documentId));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx.delete(documentArticle).where(eq(documentArticle.documentId, documentId));
  await ctx.tx.insert(documentArticle).values(
    json.articles.map((article, index) => ({
      documentId,
      articleKey: article.key,
      chapterKey: article.chapterKey,
      chapterTitle: article.chapterTitle,
      number: article.number,
      title: article.title,
      body: article.body,
      pages: article.pages,
      sortOrder: index,
    })),
  );
  await ctx.audit({
    action: "document.articles-replaced",
    entityType: "document",
    entityId: documentId,
    after: { articles: json.articles.length, source: json.source ?? null },
  });
  return json.articles.length;
}

export function publishDocumentAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => publishDocument(ctx, id));
}

export function unpublishDocumentAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => unpublishDocument(ctx, id));
}

export function replaceArticlesAs(actor: Actor, id: string, json: ArticlesJson): Promise<number> {
  return runCommand(actor, (ctx) => replaceArticles(ctx, id, json));
}

export interface PublishedDocument {
  id: string;
  title: string;
  kind: DocumentRow["kind"];
  version: string;
  audience: DocumentRow["audience"];
  byteSize: number;
  updatedAt: Date;
  articleCount: number;
}

/** Lo publicado, para el lector de Mi OE: por tipo (estatutos primero) y título. */
export async function listPublishedDocuments(): Promise<PublishedDocument[]> {
  const rows = await getDb()
    .select({
      id: document.id,
      title: document.title,
      kind: document.kind,
      version: document.version,
      audience: document.audience,
      byteSize: document.byteSize,
      updatedAt: document.updatedAt,
      articleCount,
    })
    .from(document)
    .where(eq(document.status, "PUBLISHED"))
    .orderBy(asc(document.title));
  const order = new Map(DOCUMENT_KINDS.map((kind, index) => [kind, index]));
  return rows.sort((a, b) => (order.get(a.kind) ?? 9) - (order.get(b.kind) ?? 9));
}

export interface PublishedDocumentDetail {
  document: PublishedDocument;
  articles: ArticleRow[];
}

export async function getPublishedDocumentWithArticles(
  id: string,
): Promise<PublishedDocumentDetail | null> {
  const [row] = await getDb()
    .select({
      id: document.id,
      title: document.title,
      kind: document.kind,
      version: document.version,
      audience: document.audience,
      byteSize: document.byteSize,
      updatedAt: document.updatedAt,
      articleCount,
    })
    .from(document)
    .where(and(eq(document.id, id), eq(document.status, "PUBLISHED")))
    .limit(1);
  if (!row) {
    return null;
  }
  const articles = await getDb()
    .select()
    .from(documentArticle)
    .where(eq(documentArticle.documentId, id))
    .orderBy(asc(documentArticle.sortOrder));
  return { document: row, articles };
}

export interface ArticleHit {
  documentId: string;
  documentTitle: string;
  documentKind: DocumentRow["kind"];
  articleKey: string;
  number: string;
  title: string;
  /** Fragmentos con las coincidencias entre `[[` y `]]`, para resaltar sin HTML crudo. */
  headline: string;
}

export const HIGHLIGHT = { start: "[[", end: "]]" } as const;

/** Búsqueda en español sobre los artículos publicados (`websearch_to_tsquery` + `ts_headline`). */
export async function searchArticles(q: string, limit = 20): Promise<ArticleHit[]> {
  const query = q.trim();
  if (!query) {
    return [];
  }
  const tsquery = sql`websearch_to_tsquery('spanish', ${query})`;
  const rows = await getDb()
    .select({
      documentId: document.id,
      documentTitle: document.title,
      documentKind: document.kind,
      articleKey: documentArticle.articleKey,
      number: documentArticle.number,
      title: documentArticle.title,
      headline: sql<string>`ts_headline('spanish', ${documentArticle.body}, ${tsquery}, 'MaxFragments=2, MaxWords=24, MinWords=10, StartSel=[[, StopSel=]], FragmentDelimiter= … ')`,
      rank: sql<number>`ts_rank(${documentArticle.search}, ${tsquery})`,
    })
    .from(documentArticle)
    .innerJoin(document, eq(document.id, documentArticle.documentId))
    .where(and(eq(document.status, "PUBLISHED"), sql`${documentArticle.search} @@ ${tsquery}`))
    .orderBy(
      sql`ts_rank(${documentArticle.search}, ${tsquery}) desc`,
      asc(documentArticle.sortOrder),
    )
    .limit(limit);
  return rows.map(({ rank: _rank, ...hit }) => hit);
}

export type DocumentRedirect =
  | { status: 404 }
  | { status: 403 }
  | { status: 302; url: string; cacheControl: string };

/** El PDF original: solo con sesión y solo publicado (o en borrador para ADMIN); URL de 10 minutos. */
export async function resolveDocumentRedirect(
  id: string,
  viewer: { authenticated: boolean; isAdmin: boolean },
): Promise<DocumentRedirect> {
  const row = await getDocument(id);
  if (!row || (row.status !== "PUBLISHED" && !viewer.isAdmin)) {
    return { status: 404 };
  }
  if (!viewer.authenticated) {
    return { status: 403 };
  }
  const url = await presignRead(row.fileKey, DELIVERY.PRIVATE.expiresInSeconds);
  return { status: 302, url, cacheControl: "private, no-store" };
}
