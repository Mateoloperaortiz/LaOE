import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { page } from "../schema";

// Páginas fijas del portal (La OE, Unirse, Privacidad): cuerpo en Markdown, publicación y audiencia (ADR-033).

export type PageRow = typeof page.$inferSelect;

export const SLUG_PATTERN = /^[a-z0-9-]+$/;

export const pageInputSchema = z.object({
  slug: z.string().trim().toLowerCase().min(2).max(60).regex(SLUG_PATTERN),
  title: z.string().trim().min(2).max(120),
  body: z.string().max(50_000).default(""),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  audience: z.enum(["PUBLIC", "MEMBERS"]).default("PUBLIC"),
});

export type PageInput = z.infer<typeof pageInputSchema>;

export interface PageListParams {
  q: string;
  status?: string | undefined;
  audience?: string | undefined;
  page: number;
  pageSize: number;
}

export async function listPages(
  params: PageListParams,
): Promise<{ rows: PageRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(or(ilike(page.title, `%${params.q}%`), ilike(page.slug, `%${params.q}%`)));
  }
  if (params.status === "DRAFT" || params.status === "PUBLISHED") {
    conditions.push(eq(page.status, params.status));
  }
  if (params.audience === "PUBLIC" || params.audience === "MEMBERS") {
    conditions.push(eq(page.audience, params.audience));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(page)
      .where(where)
      .orderBy(asc(page.title))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(page).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getPage(id: string): Promise<PageRow | null> {
  const [row] = await getDb().select().from(page).where(eq(page.id, id)).limit(1);
  return row ?? null;
}

function toValues(input: PageInput) {
  return {
    slug: input.slug,
    title: input.title,
    body: input.body,
    status: input.status,
    audience: input.audience,
  };
}

export async function createPage(ctx: CommandContext, input: PageInput): Promise<{ id: string }> {
  try {
    const [row] = await ctx.tx.insert(page).values(toValues(input)).returning({ id: page.id });
    if (!row) {
      throw new Error("No se pudo crear la página");
    }
    await ctx.audit({
      action: "page.created",
      entityType: "page",
      entityId: row.id,
      after: toValues(input),
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "page_slug_unique")) {
      throw new DomainError(t("T-367"), "slug");
    }
    throw error;
  }
}

export async function updatePage(ctx: CommandContext, id: string, input: PageInput): Promise<void> {
  const [before] = await ctx.tx.select().from(page).where(eq(page.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = { ...toValues(input), slug: before.slug }; // el identificador es la URL: no cambia
  await ctx.tx.update(page).set(values).where(eq(page.id, id));
  await ctx.audit({
    action: "page.updated",
    entityType: "page",
    entityId: id,
    before,
    after: values,
  });
}

/** Lo que el portal muestra de una página: en borrador se ve el título y "en preparación". */
export interface PublicPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  status: PageRow["status"];
  updatedAt: Date;
}

/** Páginas públicas y publicadas, para el sitemap. */
export const listPublishedPublicPages = cache(
  async (): Promise<Array<{ slug: string; updatedAt: Date }>> => {
    return getDb()
      .select({ slug: page.slug, updatedAt: page.updatedAt })
      .from(page)
      .where(and(eq(page.audience, "PUBLIC"), eq(page.status, "PUBLISHED")))
      .orderBy(asc(page.slug));
  },
);

/** Página de audiencia pública por su slug, publicada o no; se comparte entre metadata y página. */
export const findPublicPage = cache(async (slug: string): Promise<PublicPage | null> => {
  const [row] = await getDb()
    .select({
      id: page.id,
      slug: page.slug,
      title: page.title,
      body: page.body,
      status: page.status,
      updatedAt: page.updatedAt,
    })
    .from(page)
    .where(and(eq(page.slug, slug), eq(page.audience, "PUBLIC")))
    .limit(1);
  return row ?? null;
});
