import { createId } from "@paralleldrive/cuid2";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { mediaProcess } from "@/domain-events/content";
import { eventOf } from "@/domain-events/define";
import { deleteObject, headObject, presignRead, presignUpload } from "@/shared/adapters/storage";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { type MediaVariants, mediaAsset } from "../schema";
import {
  DELIVERY,
  isAllowedSize,
  isAllowedType,
  MEDIA_MAX_BYTES,
  MEDIA_MIN_BYTES,
  PHOTO_KEY_PREFIX,
  PHOTO_MAX_BYTES,
  photoKey,
  pickVariant,
  UPLOAD_EXPIRY_SECONDS,
  UPLOAD_KEY_PATTERN,
  uploadKey,
} from "./media-pure";

// Medios (ADR-022, ADR-033): subida directa prefirmada, confirmación, y entrega por redirección.

export type MediaRow = typeof mediaAsset.$inferSelect;

const visibilitySchema = z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC");
// "media" es la subida del admin; "photo" la foto propia de un miembro (ADR-034 regla 8).
const purposeSchema = z.enum(["media", "photo"]).default("media");

export const prepareUploadSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(3).max(100),
  byteSize: z.number().int().positive(),
  visibility: visibilitySchema,
  purpose: purposeSchema,
});

// `purpose` es opcional al llamar (los subidores viejos no lo mandan): sin él es una subida del admin.
export type PrepareUploadInput = Omit<z.infer<typeof prepareUploadSchema>, "purpose"> & {
  purpose?: "media" | "photo";
};

export interface PreparedUpload {
  key: string;
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}

/**
 * Un POST prefirmado de 10 minutos con tipo y tamaño acotados: ADMIN para medios; cualquier
 * persona con sesión para su propia foto (privada, hasta 5 MB, bajo `photos/<personId>/`).
 */
export async function prepareUpload(
  input: PrepareUploadInput,
  owner?: { personId: string },
): Promise<PreparedUpload> {
  const photo = input.purpose === "photo";
  if (photo && !owner) {
    throw new DomainError(t("T-363"), "file");
  }
  if (!isAllowedType(input.contentType)) {
    throw new DomainError(t(photo ? "T-419" : "T-361"), "file");
  }
  const maxBytes = photo ? PHOTO_MAX_BYTES : MEDIA_MAX_BYTES;
  if (!isAllowedSize(input.byteSize, maxBytes)) {
    throw new DomainError(t(photo ? "T-419" : "T-362"), "file");
  }
  const key =
    photo && owner
      ? photoKey(owner.personId, input.contentType, createId())
      : uploadKey(input.contentType, createId());
  const upload = await presignUpload({
    key,
    contentType: input.contentType,
    minBytes: MEDIA_MIN_BYTES,
    maxBytes,
    expiresInSeconds: UPLOAD_EXPIRY_SECONDS,
  });
  return { key, url: upload.url, fields: upload.fields, expiresAt: upload.expiresAt.toISOString() };
}

export const confirmUploadSchema = z.object({
  key: z.string().regex(UPLOAD_KEY_PATTERN),
  filename: z.string().trim().min(1).max(200),
  visibility: visibilitySchema,
  purpose: purposeSchema,
});

export type ConfirmUploadInput = Omit<z.infer<typeof confirmUploadSchema>, "purpose"> & {
  purpose?: "media" | "photo";
};

/** Comprueba el objeto con HEAD, registra el medio en PENDING y encola media.process. */
export async function confirmUpload(
  ctx: CommandContext,
  input: ConfirmUploadInput,
): Promise<{ id: string }> {
  const photo = input.key.startsWith(PHOTO_KEY_PREFIX);
  if (photo && !input.key.startsWith(`${PHOTO_KEY_PREFIX}${ctx.actor.personId}/`)) {
    throw new DomainError(t("T-363"), "file");
  }
  const visibility = photo ? "PRIVATE" : input.visibility;
  const info = await headObject(input.key);
  if (!info || info.byteSize === null) {
    throw new DomainError(t("T-363"), "file");
  }
  const contentType = info.contentType ?? "";
  if (!isAllowedType(contentType)) {
    await deleteObject(input.key);
    throw new DomainError(t(photo ? "T-419" : "T-361"), "file");
  }
  if (!isAllowedSize(info.byteSize, photo ? PHOTO_MAX_BYTES : MEDIA_MAX_BYTES)) {
    await deleteObject(input.key);
    throw new DomainError(t(photo ? "T-419" : "T-362"), "file");
  }
  try {
    const [row] = await ctx.tx
      .insert(mediaAsset)
      .values({
        visibility,
        objectKey: input.key,
        originalFilename: input.filename,
        contentType,
        byteSize: info.byteSize,
        uploadedById: ctx.actor.personId,
        status: "PENDING",
      })
      .returning({ id: mediaAsset.id });
    if (!row) {
      throw new Error("No se pudo registrar el medio");
    }
    await ctx.audit({
      action: "media.uploaded",
      entityType: "media_asset",
      entityId: row.id,
      after: {
        objectKey: input.key,
        contentType,
        byteSize: info.byteSize,
        visibility,
      },
    });
    await ctx.emit(
      eventOf(mediaProcess, { assetId: row.id }, { dedupeKey: `media.process:${row.id}` }),
    );
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "media_asset_object_key_unique")) {
      throw new DomainError(t("T-363"), "file");
    }
    throw error;
  }
}

/** Para la ruta de confirmación (src/app no abre transacciones). */
export function confirmUploadAs(actor: Actor, input: ConfirmUploadInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => confirmUpload(ctx, input));
}

export interface MediaListParams {
  q: string;
  status?: string | undefined;
  page: number;
  pageSize: number;
}

export async function listMedia(
  params: MediaListParams,
): Promise<{ rows: MediaRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(ilike(mediaAsset.originalFilename, `%${params.q}%`));
  }
  if (params.status === "PENDING" || params.status === "READY" || params.status === "FAILED") {
    conditions.push(eq(mediaAsset.status, params.status));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(mediaAsset)
      .where(where)
      .orderBy(desc(mediaAsset.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(mediaAsset).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getMedia(id: string): Promise<MediaRow | null> {
  const [row] = await getDb().select().from(mediaAsset).where(eq(mediaAsset.id, id)).limit(1);
  return row ?? null;
}

/** Lo que una portada necesita para renderizarse con `srcset`. */
export interface MediaRef {
  id: string;
  width: number | null;
  height: number | null;
  variants: MediaVariants;
}

const refColumns = {
  id: mediaAsset.id,
  width: mediaAsset.width,
  height: mediaAsset.height,
  variants: mediaAsset.variants,
};

/** Medio público y listo por id, o null; para portadas de eventos y ediciones. */
export const getPublicMediaRef = cache(async (id: string): Promise<MediaRef | null> => {
  const [row] = await getDb()
    .select(refColumns)
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.id, id),
        eq(mediaAsset.visibility, "PUBLIC"),
        eq(mediaAsset.status, "READY"),
      ),
    )
    .limit(1);
  return row ?? null;
});

/** Opciones para elegir una portada en el admin: medios públicos listos, los más nuevos primero. */
export async function listReadyPublicMedia(): Promise<Array<{ id: string; label: string }>> {
  const rows = await getDb()
    .select({
      id: mediaAsset.id,
      originalFilename: mediaAsset.originalFilename,
      width: mediaAsset.width,
      height: mediaAsset.height,
    })
    .from(mediaAsset)
    .where(and(eq(mediaAsset.visibility, "PUBLIC"), eq(mediaAsset.status, "READY")))
    .orderBy(desc(mediaAsset.createdAt), asc(mediaAsset.originalFilename))
    .limit(200);
  return rows.map((row) => ({
    id: row.id,
    label:
      row.width && row.height
        ? `${row.originalFilename} · ${row.width}×${row.height}`
        : row.originalFilename,
  }));
}

export type MediaRedirect =
  | { status: 404 }
  | { status: 403 }
  | { status: 302; url: string; cacheControl: string };

/** Decide el 302 de GET /api/media/[id]: variante por ancho, visibilidad y estado (ADR-022). */
export async function resolveMediaRedirect(
  id: string,
  requestedWidth: number | null,
  viewer: { authenticated: boolean },
): Promise<MediaRedirect> {
  const asset = await getMedia(id);
  if (!asset || asset.status !== "READY") {
    return { status: 404 };
  }
  if (asset.visibility === "PRIVATE" && !viewer.authenticated) {
    return { status: 403 };
  }
  const variant = pickVariant(asset.variants, requestedWidth);
  const delivery = DELIVERY[asset.visibility];
  const url = await presignRead(variant?.key ?? asset.objectKey, delivery.expiresInSeconds);
  return { status: 302, url, cacheControl: delivery.cacheControl };
}
