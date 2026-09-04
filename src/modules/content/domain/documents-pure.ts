import { z } from "zod";

// Reglas puras de la normativa (ADR-034 regla 9): el PDF firmado como objeto propio del bucket y los
// artículos como JSON del extractor (`scripts/normativa-extract.py`, formato `oe-normativa/1`).

export const DOCUMENT_CONTENT_TYPE = "application/pdf";
export const DOCUMENT_MIN_BYTES = 1024;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_KEY_PATTERN = /^documents\/[a-z0-9]{10,40}\.pdf$/;
export const DOCUMENT_KINDS = ["ESTATUTOS", "REGLAMENTO", "ACTA", "OTRO"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const ARTICLES_FORMAT = "oe-normativa/1";

export function documentKey(id: string): string {
  return `documents/${id}.pdf`;
}

/** Los primeros bytes de todo PDF: `%PDF-`. */
export function isPdfHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export const articleSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
  chapterKey: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
  chapterTitle: z.string().trim().max(200).default(""),
  number: z.string().trim().min(1).max(20),
  title: z.string().trim().max(200).default(""),
  body: z.string().trim().min(1).max(20_000),
  pages: z.array(z.number().int().positive()).max(60).default([]),
});

export const articlesJsonSchema = z
  .object({
    format: z.literal(ARTICLES_FORMAT),
    kind: z.enum(DOCUMENT_KINDS).optional(),
    source: z.string().max(200).optional(),
    pages: z.number().int().positive().optional(),
    articles: z.array(articleSchema).min(1).max(2000),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.articles.forEach((article, index) => {
      if (seen.has(article.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["articles", index, "key"],
          message: `clave repetida: ${article.key}`,
        });
      }
      seen.add(article.key);
    });
  });

export type ArticlesJson = z.infer<typeof articlesJsonSchema>;

export type ParsedArticles = { ok: true; data: ArticlesJson } | { ok: false; detail: string };

/** Lee el JSON del extractor; el detalle del error es la primera falla, con su ruta. */
export function parseArticlesJson(raw: string): ParsedArticles {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, detail: "no es JSON" };
  }
  const parsed = articlesJsonSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.map(String).join(".") ?? "";
    return {
      ok: false,
      detail: path ? `${path}: ${issue?.message ?? ""}` : (issue?.message ?? ""),
    };
  }
  return { ok: true, data: parsed.data };
}

export interface ChapterGroup<T extends { chapterKey: string; chapterTitle: string }> {
  key: string;
  title: string;
  articles: T[];
}

/** Agrupa los artículos por capítulo conservando el orden de aparición (índice del lector). */
export function chaptersOf<T extends { chapterKey: string; chapterTitle: string }>(
  articles: T[],
): ChapterGroup<T>[] {
  const groups: ChapterGroup<T>[] = [];
  for (const article of articles) {
    let group = groups.find((item) => item.key === article.chapterKey);
    if (!group) {
      group = { key: article.chapterKey, title: article.chapterTitle, articles: [] };
      groups.push(group);
    }
    group.articles.push(article);
  }
  return groups;
}
