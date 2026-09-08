import { createHash } from "node:crypto";
import { z } from "zod";

/** Errores operativos imprimibles; nunca contienen cuerpos, credenciales ni consultas SQL. */
export class NormativaImportError extends Error {}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const pathSchema = z.string().trim().min(1).max(4096);

export const normativaManifestSchema = z
  .object({
    documents: z
      .array(
        z
          .object({
            pdf: pathSchema,
            json: pathSchema,
            title: z.string().trim().min(2).max(200),
            version: z.string().trim().min(1).max(60),
            audience: z.literal("MEMBERS"),
            assets: z
              .record(
                z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/),
                z.object({ path: pathSchema, sha256: sha256Schema }).strict(),
              )
              .default({}),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export type NormativaManifestDocument = z.infer<
  typeof normativaManifestSchema
>["documents"][number];

type ComparableBlock =
  | { type: "text"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "image"; assetId: string; alt: string };

interface ComparableUnit {
  key?: string;
  articleKey?: string;
  unitType: "ARTICLE" | "SECTION";
  chapterKey: string;
  chapterTitle: string;
  number: string | null;
  title: string;
  body: string;
  pages: number[];
  blocks: ComparableBlock[];
}

/** El contenido de una imagen se compara por bytes; los IDs locales no cambian la identidad. */
export function normativaContentChecksum(
  articles: ComparableUnit[],
  imageHashes: ReadonlyMap<string, string>,
): string {
  const canonical = articles.map((article) => ({
    key: article.key ?? article.articleKey,
    unitType: article.unitType,
    chapterKey: article.chapterKey,
    chapterTitle: article.chapterTitle,
    number: article.number,
    title: article.title,
    body: article.body,
    pages: article.pages,
    blocks: article.blocks.map((block) => {
      if (block.type === "text") return { type: block.type, text: block.text };
      if (block.type === "table") {
        return { type: block.type, headers: block.headers, rows: block.rows };
      }
      const sha256 = imageHashes.get(block.assetId);
      if (!sha256) throw new NormativaImportError("Falta verificar una imagen del documento");
      return { type: block.type, sha256, alt: block.alt };
    }),
  }));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

interface ImportIdentity {
  kind: string;
  version: string;
  sha256: string;
  title: string;
  audience: string;
}

interface ExistingIdentity extends Omit<ImportIdentity, "sha256"> {
  id: string;
  sha256: string | null;
  status: "DRAFT" | "PUBLISHED";
}

/** Nunca selecciona una versión distinta ni decide entre duplicados ambiguos. */
export function matchNormativaDocument<T extends ExistingIdentity>(
  desired: ImportIdentity,
  candidates: T[],
): T | undefined {
  const matches = candidates.filter(
    (candidate) => candidate.kind === desired.kind && candidate.version === desired.version,
  );
  if (matches.length > 1) {
    throw new NormativaImportError("Hay documentos duplicados para el mismo tipo y versión");
  }
  const existing = matches[0];
  if (
    existing &&
    (existing.sha256 !== desired.sha256 ||
      existing.title !== desired.title ||
      existing.audience !== desired.audience)
  ) {
    throw new NormativaImportError("La versión existente tiene otro PDF, título o audiencia");
  }
  return existing;
}

export function normativaImportIntent(
  existing: { status: "DRAFT" | "PUBLISHED"; identical: boolean } | undefined,
  publish: boolean,
): "create" | "replace" | "publish" | "unchanged" {
  if (publish) {
    if (!existing?.identical) {
      throw new NormativaImportError(
        "Publicar exige una carga previa idéntica; primero ejecutá --apply y revisá el borrador",
      );
    }
    return existing.status === "PUBLISHED" ? "unchanged" : "publish";
  }
  if (!existing) return "create";
  if (existing.identical) return "unchanged";
  if (existing.status === "PUBLISHED") {
    throw new NormativaImportError(
      "El documento publicado tiene otro contenido; despublicalo y revisalo desde el admin",
    );
  }
  return "replace";
}
