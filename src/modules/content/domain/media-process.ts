import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/db/client";
import { getObject, putObject } from "@/shared/adapters/storage";
import { logger } from "@/shared/log";
import { type MediaVariants, mediaAsset } from "../schema";
import { MEDIA_TYPES, variantKey, variantName, variantWidthsFor } from "./media-pure";

// Handler de media.process (ADR-033): descarga el original, lee sus dimensiones, escribe las variantes
// WebP con claves deterministas y marca READY. Un original que no se puede decodificar queda FAILED
// sin reintento; un fallo del bucket relanza para que el outbox reintente con backoff.

sharp.concurrency(1);

const DECODABLE = new Set(["jpeg", "png", "webp"]);
const WEBP_QUALITY = 82;

export type ProcessOutcome = "ready" | "failed" | "skipped";

class PermanentMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentMediaError";
  }
}

async function readMetadata(bytes: Uint8Array) {
  try {
    return await sharp(bytes).metadata();
  } catch (error) {
    throw new PermanentMediaError(
      `No se pudo decodificar la imagen: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function decode(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const metadata = await readMetadata(bytes);
  if (!metadata.format || !DECODABLE.has(metadata.format)) {
    throw new PermanentMediaError(`Formato no admitido: ${metadata.format ?? "desconocido"}`);
  }
  if (!metadata.width || !metadata.height) {
    throw new PermanentMediaError("La imagen no tiene dimensiones");
  }
  return { width: metadata.width, height: metadata.height };
}

async function renderVariant(
  bytes: Uint8Array,
  width: number,
): Promise<{ data: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(bytes)
      .rotate() // respeta la orientación EXIF
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (error) {
    throw new PermanentMediaError(
      `No se pudo generar la variante de ${width}px: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function processMedia(assetId: string, now = new Date()): Promise<ProcessOutcome> {
  const db = getDb();
  const [asset] = await db.select().from(mediaAsset).where(eq(mediaAsset.id, assetId)).limit(1);
  if (!asset) {
    logger.warn({ assetId }, "media.process: el medio no existe");
    return "skipped";
  }
  if (asset.status === "READY") {
    return "skipped";
  }
  try {
    if (!(asset.contentType in MEDIA_TYPES)) {
      throw new PermanentMediaError(`Tipo no permitido: ${asset.contentType}`);
    }
    const bytes = await getObject(asset.objectKey); // un fallo aquí es transitorio: relanza
    const original = await decode(bytes);
    const variants: MediaVariants = {};
    for (const width of variantWidthsFor(original.width)) {
      const rendered = await renderVariant(bytes, width);
      const key = variantKey(asset.id, width);
      await putObject(key, rendered.data, "image/webp"); // transitorio: relanza
      variants[variantName(width)] = {
        key,
        width: rendered.width,
        height: rendered.height,
        byteSize: rendered.data.byteLength,
        contentType: "image/webp",
      };
    }
    await db
      .update(mediaAsset)
      .set({
        width: original.width,
        height: original.height,
        variants,
        status: "READY",
        error: null,
        updatedAt: now,
      })
      .where(eq(mediaAsset.id, asset.id));
    return "ready";
  } catch (error) {
    if (error instanceof PermanentMediaError) {
      await db
        .update(mediaAsset)
        .set({ status: "FAILED", error: error.message.slice(0, 500), updatedAt: now })
        .where(eq(mediaAsset.id, asset.id));
      logger.warn({ assetId, err: error }, "media.process: el objeto no es una imagen válida");
      return "failed";
    }
    throw error;
  }
}
