import { z } from "zod";

// Reglas puras de la normativa (ADR-034 regla 9): el PDF firmado como objeto propio del bucket y los
// artículos como JSON del extractor (`scripts/normativa-extract.py`, formato `oe-normativa/1`).

export const DOCUMENT_CONTENT_TYPE = "application/pdf";
export const DOCUMENT_MIN_BYTES = 1024;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_KEY_PATTERN = /^documents\/[a-z0-9]{10,40}\.pdf$/;
export const DOCUMENT_KINDS = ["ESTATUTOS", "REGLAMENTO", "ACTA", "OTRO"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const ARTICLES_FORMAT = "oe-normativa/2";

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

const keySchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,59}$/);
const textSchema = z.string().trim().min(1).max(100_000);
const pageSchema = z.array(z.number().int().positive()).max(500);
const unitFields = {
  key: keySchema,
  chapterKey: keySchema,
  chapterTitle: z.string().trim().max(200).default(""),
  title: z.string().trim().max(200).default(""),
  pages: pageSchema.default([]),
};

export const documentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: textSchema }),
  z
    .object({
      type: z.literal("table"),
      headers: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
      rows: z
        .array(z.array(z.string().trim().max(5000)).min(1).max(20))
        .min(1)
        .max(500),
    })
    .superRefine((table, ctx) => {
      table.rows.forEach((row, index) => {
        if (row.length !== table.headers.length) {
          ctx.addIssue({
            code: "custom",
            path: ["rows", index],
            message: "cantidad de columnas distinta del encabezado",
          });
        }
      });
    }),
  z.object({
    type: z.literal("image"),
    assetId: keySchema,
    alt: z.string().trim().min(1).max(2000),
  }),
]);

export type DocumentBlock = z.infer<typeof documentBlockSchema>;

/** Única derivación del cuerpo buscable: texto, relaciones de tabla y descripción de imagen. */
export function blocksText(blocks: DocumentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "image") return block.alt;
      return [
        block.headers.join(" · "),
        ...block.rows.map((row) =>
          row.map((cell, i) => `${block.headers[i]}: ${cell}`).join(" · "),
        ),
      ].join("\n");
    })
    .join("\n\n");
}

export const articleSchema = z.object({
  ...unitFields,
  number: z.string().trim().min(1).max(20),
  body: z.string().trim().min(1).max(20_000),
});

const unitSchema = z
  .object({
    ...unitFields,
    unitType: z.enum(["ARTICLE", "SECTION"]),
    number: z
      .string()
      .trim()
      .regex(/^\d+[A-Za-z]?$/)
      .max(20)
      .nullable(),
    pages: pageSchema.min(1),
    blocks: z.array(documentBlockSchema).min(1).max(1000),
  })
  .superRefine((unit, ctx) => {
    if (
      unit.unitType === "ARTICLE" &&
      (!unit.number || unit.key !== `art-${unit.number.toLowerCase()}`)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["number"],
        message: "artículo sin número o ancla distinta de art-n",
      });
    }
    if (unit.unitType === "SECTION" && (unit.number !== null || !unit.title)) {
      ctx.addIssue({
        code: "custom",
        path: ["title"],
        message: "una sección lleva título y no número de artículo",
      });
    }
    if (blocksText(unit.blocks).length > 100_000) {
      ctx.addIssue({ code: "custom", path: ["blocks"], message: "contenido demasiado largo" });
    }
  });

const sourceFields = {
  kind: z.enum(DOCUMENT_KINDS).optional(),
  source: z.string().max(200).optional(),
  pages: z.number().int().positive().max(500).optional(),
};

export const articlesJsonSchema = z
  .discriminatedUnion("format", [
    z.object({
      ...sourceFields,
      format: z.literal("oe-normativa/1"),
      articles: z.array(articleSchema).min(1).max(2000),
    }),
    z.object({
      format: z.literal(ARTICLES_FORMAT),
      kind: z.enum(DOCUMENT_KINDS),
      source: z.string().trim().min(1).max(200),
      pages: z.number().int().positive().max(500),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      units: z.array(unitSchema).min(1).max(2000),
    }),
  ])
  .superRefine((value, ctx) => {
    const units = value.format === ARTICLES_FORMAT ? value.units : value.articles;
    const field = value.format === ARTICLES_FORMAT ? "units" : "articles";
    const seen = new Set<string>();
    const chapters = new Map<string, string>();
    const closedChapters = new Set<string>();
    let previousChapter = "";
    units.forEach((article, index) => {
      if (seen.has(article.key)) {
        ctx.addIssue({
          code: "custom",
          path: [field, index, "key"],
          message: `clave repetida: ${article.key}`,
        });
      }
      seen.add(article.key);
      if (value.format !== ARTICLES_FORMAT) return;
      const oldTitle = chapters.get(article.chapterKey);
      if (oldTitle !== undefined && oldTitle !== article.chapterTitle) {
        ctx.addIssue({
          code: "custom",
          path: [field, index, "chapterTitle"],
          message: "títulos distintos para el mismo capítulo",
        });
      }
      chapters.set(article.chapterKey, article.chapterTitle);
      if (article.chapterKey !== previousChapter) {
        if (closedChapters.has(article.chapterKey)) {
          ctx.addIssue({
            code: "custom",
            path: [field, index, "chapterKey"],
            message: "capítulo interrumpido por otro capítulo",
          });
        }
        closedChapters.add(previousChapter);
        previousChapter = article.chapterKey;
      }
      article.pages.forEach((page, pageIndex) => {
        if (page > value.pages || (pageIndex > 0 && page <= (article.pages[pageIndex - 1] ?? 0))) {
          ctx.addIssue({
            code: "custom",
            path: [field, index, "pages", pageIndex],
            message: "páginas fuera del PDF, repetidas o desordenadas",
          });
        }
      });
    });
  })
  .transform((value) => {
    if (value.format === ARTICLES_FORMAT) {
      const { units, ...source } = value;
      return {
        ...source,
        articles: units.map((unit) => ({ ...unit, body: blocksText(unit.blocks) })),
      };
    }
    return {
      ...value,
      sha256: undefined,
      articles: value.articles.map((article) => ({
        ...article,
        unitType: "ARTICLE" as const,
        blocks: [{ type: "text" as const, text: article.body }],
      })),
    };
  });

/** Contrato normalizado común para ambos formatos; el parser exige la procedencia completa en v2. */
export interface ArticlesJson {
  format: "oe-normativa/1" | "oe-normativa/2";
  kind?: DocumentKind | undefined;
  source?: string | undefined;
  pages?: number | undefined;
  sha256?: string | undefined;
  articles: (z.infer<typeof unitSchema> & { body: string })[];
}

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
