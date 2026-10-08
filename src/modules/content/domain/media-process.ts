import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { deleteObject, getObject, headObject, putObject } from "@/shared/adapters/storage";
import { decodeImage, ImageRejectedError } from "@/shared/lib/image-decoder";
import { logger } from "@/shared/log";
import { FULL_VARIANT } from "../media-variants";
import { type MediaVariant, type MediaVariants, mediaAsset } from "../schema";
import {
  FULL_VARIANT_MAX_SIDE,
  fullVariantKey,
  hasFullVariant,
  MEDIA_TYPES,
  variantKey,
  variantName,
  variantWidthsFor,
} from "./media-pure";

// Handler de media.process (ADR-033): descarga el original, lo abre por el decodificador compartido
// (ADR-113 regla 4), escribe las variantes WebP con claves deterministas y marca READY. Además de las
// de ancho escribe siempre la completa, que es lo que se entrega en lugar del original (ADR-114 regla 8).
// Un original que el decodificador rechaza queda FAILED con su motivo y sin reintento; un fallo del
// bucket relanza para que el outbox reintente con backoff.

/** `kept`: un medio ya publicado al que no se le pudo escribir la variante completa y sigue como estaba. */
export type ProcessOutcome = "ready" | "failed" | "skipped" | "kept";

type MediaAssetRow = typeof mediaAsset.$inferSelect;
type Decoded = Awaited<ReturnType<typeof decodeImage>>;

async function storeVariant(
  key: string,
  rendered: Awaited<ReturnType<Decoded["toWebp"]>>,
): Promise<MediaVariant> {
  await putObject(key, rendered.data, "image/webp"); // transitorio: relanza
  return {
    key,
    width: rendered.width,
    height: rendered.height,
    byteSize: rendered.data.byteLength,
    contentType: "image/webp",
  };
}

/**
 * La imagen derecha y sin metadatos, entera si no pasa de `FULL_VARIANT_MAX_SIDE` y reducida a ese lado
 * si lo pasa: el decodificador solo codifica reduciendo (ADR-113 regla 4).
 */
async function storeFullVariant(assetId: string, original: Decoded): Promise<MediaVariant> {
  return storeVariant(
    fullVariantKey(assetId),
    await original.toWebp({ side: FULL_VARIANT_MAX_SIDE }),
  );
}

/**
 * Para cuando el proceso no encontró fila donde anotar lo que escribió: si el medio se borró mientras se
 * procesaba (las fotos de una persona que se anonimiza, ADR-116 regla 8), esas variantes ya no tienen
 * fila que las nombre y se borran aquí. Si la fila sigue, no se toca nada. Dice si lo descartó.
 */
async function discardIfRemoved(assetId: string, written: MediaVariant[]): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: mediaAsset.id })
    .from(mediaAsset)
    .where(eq(mediaAsset.id, assetId))
    .limit(1);
  if (row) {
    return false;
  }
  for (const variant of written) {
    await deleteObject(variant.key); // transitorio: relanza, y el reintento ya no encuentra el medio
  }
  logger.warn({ assetId }, "media.process: el medio se borró mientras se procesaba");
  return true;
}

/** Abre el original de un medio, o lanza `ImageRejectedError` si no es una imagen que se procese. */
async function openOriginal(asset: MediaAssetRow): Promise<Decoded> {
  if (!(asset.contentType in MEDIA_TYPES)) {
    // El tipo guardado ahorra la descarga; el motivo es el del formato, como si lo dijera el contenido.
    throw new ImageRejectedError("format", asset.contentType);
  }
  const bytes = await getObject(asset.objectKey); // un fallo aquí es transitorio: relanza
  return decodeImage(bytes);
}

/**
 * Un medio que quedó READY antes de ADR-114 regla 8: le falta solo la variante completa. Se suma a las
 * que tiene con una sola escritura, sin releer el mapa, y no se le toca el estado. Si el original ya no
 * está en el bucket o el decodificador de hoy no lo abre, el medio sigue publicado como estaba, servido
 * desde su original: qué hacer con él lo decide quien quite ese respaldo (DT-105).
 */
async function addFullVariant(asset: MediaAssetRow, now: Date): Promise<ProcessOutcome> {
  if (!(await headObject(asset.objectKey))) {
    logger.warn({ assetId: asset.id }, "media.process: el original de un medio listo ya no está");
    return "kept";
  }
  try {
    const full = await storeFullVariant(asset.id, await openOriginal(asset));
    const recorded = await getDb()
      .update(mediaAsset)
      .set({
        variants: sql`${mediaAsset.variants} || ${JSON.stringify({ [FULL_VARIANT]: full })}::jsonb`,
        updatedAt: now,
      })
      .where(and(eq(mediaAsset.id, asset.id), eq(mediaAsset.status, "READY")))
      .returning({ id: mediaAsset.id });
    if (recorded.length === 0 && (await discardIfRemoved(asset.id, [full]))) {
      return "skipped";
    }
    return "ready";
  } catch (error) {
    if (error instanceof ImageRejectedError) {
      logger.warn(
        { assetId: asset.id, err: error },
        "media.process: un medio listo no se puede recodificar y se sigue sirviendo su original",
      );
      return "kept";
    }
    throw error;
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
    return hasFullVariant(asset.variants) ? "skipped" : addFullVariant(asset, now);
  }
  try {
    const original = await openOriginal(asset);
    const variants: MediaVariants = {};
    for (const width of variantWidthsFor(original.width)) {
      variants[variantName(width)] = await storeVariant(
        variantKey(asset.id, width),
        await original.toWebp({ width }),
      );
    }
    variants[FULL_VARIANT] = await storeFullVariant(asset.id, original);
    const recorded = await db
      .update(mediaAsset)
      .set({
        width: original.width,
        height: original.height,
        variants,
        status: "READY",
        error: null,
        updatedAt: now,
      })
      .where(eq(mediaAsset.id, asset.id))
      .returning({ id: mediaAsset.id });
    if (recorded.length === 0 && (await discardIfRemoved(asset.id, Object.values(variants)))) {
      return "skipped";
    }
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
