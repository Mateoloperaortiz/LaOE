import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getObject, putObject } from "@/shared/adapters/storage";
import { decodeImage, ImageRejectedError } from "@/shared/lib/image-decoder";
import { logger } from "@/shared/log";
import { type MediaVariants, mediaAsset } from "../schema";
import { MEDIA_TYPES, variantKey, variantName, variantWidthsFor } from "./media-pure";

// Handler de media.process (ADR-033): descarga el original, lo abre por el decodificador compartido
// (ADR-113 regla 4), escribe las variantes WebP con claves deterministas y marca READY. Un original
// que el decodificador rechaza queda FAILED con su motivo y sin reintento; un fallo del bucket
// relanza para que el outbox reintente con backoff.

export type ProcessOutcome = "ready" | "failed" | "skipped";

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
      // El tipo guardado ahorra la descarga; el motivo es el del formato, como si lo dijera el contenido.
      throw new ImageRejectedError("format", asset.contentType);
    }
    const bytes = await getObject(asset.objectKey); // un fallo aquí es transitorio: relanza
    const original = await decodeImage(bytes);
    const variants: MediaVariants = {};
    for (const width of variantWidthsFor(original.width)) {
      const rendered = await original.toWebp({ width });
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
    if (error instanceof ImageRejectedError) {
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
