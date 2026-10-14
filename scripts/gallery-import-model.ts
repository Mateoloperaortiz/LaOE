import { posix } from "node:path";
import { z } from "zod";

export const GALLERY_WIDTHS = [480, 960, 1600, 2400] as const;
export const GALLERY_PREPARATION_VERSION = 1;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const positive = z.number().int().positive();

export class GalleryImportError extends Error {}

export const sourceEntrySchema = z.object({
  relativePath: z.string(),
  byteSize: positive,
  mtimeMs: z.number(),
  ctimeMs: z.number(),
  sourceHash: sha256,
});
export type SourceEntry = z.infer<typeof sourceEntrySchema>;

export const sourceIndexSchema = z.object({
  version: z.literal(GALLERY_PREPARATION_VERSION),
  sourceRoot: z.string(),
  complete: z.boolean(),
  entries: z.array(sourceEntrySchema),
});

export const preparedPhotoSchema = z.object({
  version: z.literal(GALLERY_PREPARATION_VERSION),
  sourceHash: sha256,
  sourceByteSize: positive,
  width: positive,
  height: positive,
  variants: z
    .array(
      z.object({
        path: z.string(),
        key: z.string(),
        width: positive,
        height: positive,
        byteSize: positive,
        sha256,
        contentType: z.literal("image/webp"),
      }),
    )
    .min(1),
});
export type PreparedPhoto = z.infer<typeof preparedPhotoSchema>;

const albumSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  caption: z.string(),
  sortOrder: z.number().int().nonnegative(),
  sourceHashes: z.array(sha256),
  coverSourceHash: sha256,
});

export const preparationSchema = z.object({
  version: z.literal(GALLERY_PREPARATION_VERSION),
  sourceRoot: z.string(),
  collection: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1),
    description: z.string(),
  }),
  sourceCount: positive,
  uniqueCount: positive,
  expectedSourceCount: positive.optional(),
  expectedUniqueCount: positive.optional(),
  preparedCount: z.number().int().nonnegative(),
  complete: z.boolean(),
  heroSourceHash: sha256,
  featuredSourceHashes: z.array(sha256),
  albums: z.array(albumSchema).min(1),
});
export type Preparation = z.infer<typeof preparationSchema>;

const albumDefinitions = [
  ["feria", "Feria"],
  ["gap", "GAP"],
  ["the-show", "The Show"],
  ["partidos", "Partidos"],
  ["taller-de-suenos", "Taller de sueños"],
  ["taller-de-carnes", "Taller de carnes"],
  ["totes", "TOTES"],
  ["general", "General"],
  ["carnival", "Carnival"],
  ["the-games", "The Games"],
  ["the-challenge", "The Challenge"],
  ["viernes", "Viernes"],
  ["la-oe-en-dias", "La OE en DÍAS"],
] as const;

function normalized(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function isExcludedGalleryDirectory(name: string): boolean {
  return normalized(name).includes("jugador");
}

export function isGalleryPhotoPath(path: string): boolean {
  return /\.(?:jpe?g|heic|heif|png|webp|avif)$/i.test(path);
}

export function safeRelativePath(path: string): string {
  if (!path || path.includes("\\") || path.startsWith("/") || path.includes("\0")) {
    throw new GalleryImportError("Una ruta del manifiesto no es relativa y segura");
  }
  const clean = posix.normalize(path);
  if (clean === ".." || clean.startsWith("../") || clean === ".") {
    throw new GalleryImportError("Una ruta del manifiesto sale de la carpeta elegida");
  }
  return clean;
}

/** La procedencia editorial no se convierte en una fecha de captura. */
export function albumForSource(path: string): { slug: string; title: string; sortOrder: number } {
  const parts = safeRelativePath(path).split("/").slice(0, -1);
  if (parts.some(isExcludedGalleryDirectory)) {
    throw new GalleryImportError("Una foto pertenece a una carpeta de jugadores excluida");
  }
  const folders = normalized(parts.join("/"));
  let slug: string;
  if (/^oe (?:jueves|viernes)(?:\/|$)/.test(folders)) slug = "la-oe-en-dias";
  else if (/dias - viernes\/camara [123](?:\/|$)/.test(folders)) slug = "viernes";
  else if (folders.includes("the show")) slug = "the-show";
  else if (folders.includes("the games")) slug = "the-games";
  else if (folders.includes("the challenge")) slug = "the-challenge";
  else if (folders.includes("carnival")) slug = "carnival";
  else if (folders.includes("taller de suenos")) slug = "taller-de-suenos";
  else if (folders.includes("taller de carnes")) slug = "taller-de-carnes";
  else if (folders.includes("fotos partidos")) slug = "partidos";
  else
    slug =
      normalized(parts.at(-1) ?? "General")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "general";
  const found = albumDefinitions.find(([key]) => key === slug);
  return {
    slug,
    title: found?.[1] ?? parts.at(-1) ?? "General",
    sortOrder: found
      ? albumDefinitions.findIndex(([key]) => key === slug)
      : albumDefinitions.length,
  };
}

export function groupGallerySources(entries: SourceEntry[]): Map<string, SourceEntry[]> {
  const grouped = new Map<string, SourceEntry[]>();
  for (const entry of [...entries].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, "es"),
  )) {
    const copies = grouped.get(entry.sourceHash) ?? [];
    if (copies.some((copy) => copy.byteSize !== entry.byteSize)) {
      throw new GalleryImportError("Un mismo SHA256 aparece con tamaños incompatibles");
    }
    copies.push(entry);
    grouped.set(entry.sourceHash, copies);
  }
  return grouped;
}

export function planGalleryAlbums(entries: SourceEntry[]): Preparation["albums"] {
  const albums = new Map<string, Omit<Preparation["albums"][number], "coverSourceHash">>();
  for (const [hash, copies] of groupGallerySources(entries)) {
    for (const copy of copies) {
      const definition = albumForSource(copy.relativePath);
      const album = albums.get(definition.slug) ?? {
        ...definition,
        caption: "",
        sourceHashes: [],
      };
      if (!album.sourceHashes.includes(hash)) album.sourceHashes.push(hash);
      albums.set(album.slug, album);
    }
  }
  return [...albums.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
    .map((album) => ({ ...album, coverSourceHash: album.sourceHashes[0] ?? "" }));
}

export function galleryVariantWidths(width: number): number[] {
  if (!Number.isInteger(width) || width < 1) throw new GalleryImportError("Ancho de foto inválido");
  return [...new Set(GALLERY_WIDTHS.map((target) => Math.min(target, width)))];
}

export function galleryObjectKey(collection: string, hash: string, width: number): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collection) || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new GalleryImportError("Colección o SHA256 inválidos para una clave privada");
  }
  return `fotos/${collection}/${hash}/w${width}.webp`;
}
