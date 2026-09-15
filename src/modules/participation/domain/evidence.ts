import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/db/client";
import {
  deleteObject,
  getObject,
  headObject,
  presignRead,
  presignUpload,
  putObject,
} from "@/shared/adapters/storage";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { tList } from "@/shared/copy";
import { logger } from "@/shared/log";
import { challengeEvidenceFile, challengeParticipation } from "../schema";

// Evidencias de las misiones (ADR-067 regla 6): subida directa al bucket bajo
// `evidence/<personId>/`, fuera de `media_asset`; el job re-encodea a WebP sin metadatos y solo
// entonces `/api/retos/evidencia/[id]` redirige al autor o a un ADMIN.

export const EVIDENCE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const EVIDENCE_MIN_BYTES = 5 * 1024;
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_MAX_FILES = 3;
export const EVIDENCE_KEY_PREFIX = "evidence/";
export const EVIDENCE_KEY_PATTERN = /^evidence\/[a-z0-9]{10,40}\/[a-z0-9]{10,40}\.(jpg|png|webp)$/;
const UPLOAD_EXPIRY_SECONDS = 600;
const READ_EXPIRY_SECONDS = 300;
const WEBP_QUALITY = 82;

export function evidenceKey(personId: string, contentType: string, id: string): string {
  return `${EVIDENCE_KEY_PREFIX}${personId}/${id}.${EVIDENCE_TYPES[contentType] ?? "bin"}`;
}

export interface PreparedEvidenceUpload {
  key: string;
  url: string;
  fields: Record<string, string>;
  expiresAt: string;
}

/** Un POST prefirmado de 10 minutos, acotado a una imagen de 5 KB a 5 MB bajo `evidence/<personId>/`. */
export async function prepareEvidenceUpload(
  input: { contentType: string; byteSize: number },
  owner: { personId: string },
): Promise<PreparedEvidenceUpload> {
  const errors = tList("T-2430");
  if (!(input.contentType in EVIDENCE_TYPES)) {
    throw new DomainError(errors[0] ?? "", "file");
  }
  if (input.byteSize < EVIDENCE_MIN_BYTES || input.byteSize > EVIDENCE_MAX_BYTES) {
    throw new DomainError(errors[1] ?? "", "file");
  }
  const key = evidenceKey(owner.personId, input.contentType, createId());
  const upload = await presignUpload({
    key,
    contentType: input.contentType,
    minBytes: EVIDENCE_MIN_BYTES,
    maxBytes: EVIDENCE_MAX_BYTES,
    expiresInSeconds: UPLOAD_EXPIRY_SECONDS,
  });
  return { key, url: upload.url, fields: upload.fields, expiresAt: upload.expiresAt.toISOString() };
}

/**
 * Confirma por HEAD que cada clave es del miembro, existe, tiene un tipo admitido y entra en el
 * rango de tamaño. Un objeto inválido propio se borra; el de otra persona solo rechaza.
 */
export async function verifyEvidenceObjects(
  personId: string,
  keys: string[],
): Promise<Array<{ key: string; contentType: string; byteSize: number }>> {
  const errors = tList("T-2430");
  const unique = [...new Set(keys)];
  if (unique.length > EVIDENCE_MAX_FILES) {
    throw new DomainError(errors[2] ?? "", "files");
  }
  const prefix = `${EVIDENCE_KEY_PREFIX}${personId}/`;
  const verified: Array<{ key: string; contentType: string; byteSize: number }> = [];
  for (const key of unique) {
    if (!key.startsWith(prefix) || !EVIDENCE_KEY_PATTERN.test(key)) {
      throw new DomainError(errors[0] ?? "", "files");
    }
    const info = await headObject(key);
    if (!info || info.byteSize === null) {
      throw new DomainError(errors[0] ?? "", "files");
    }
    const contentType = info.contentType ?? "";
    if (!(contentType in EVIDENCE_TYPES)) {
      await deleteObject(key).catch(() => undefined);
      throw new DomainError(errors[0] ?? "", "files");
    }
    if (info.byteSize < EVIDENCE_MIN_BYTES || info.byteSize > EVIDENCE_MAX_BYTES) {
      await deleteObject(key).catch(() => undefined);
      throw new DomainError(errors[1] ?? "", "files");
    }
    verified.push({ key, contentType, byteSize: info.byteSize });
  }
  return verified;
}

class PermanentEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentEvidenceError";
  }
}

export type EvidenceProcessOutcome = "ready" | "failed" | "skipped";

/**
 * Re-encodea la imagen a WebP sin metadatos (sharp no copia EXIF si no se pide `withMetadata`).
 * Un original indecodificable queda FAILED sin reintento; un fallo del bucket relanza.
 */
export async function processEvidenceFile(
  fileId: string,
  now = new Date(),
): Promise<EvidenceProcessOutcome> {
  const db = getDb();
  const [file] = await db
    .select()
    .from(challengeEvidenceFile)
    .where(eq(challengeEvidenceFile.id, fileId))
    .limit(1);
  if (!file) {
    logger.warn({ fileId }, "gamification.evidence-process: la fila no existe");
    return "skipped";
  }
  if (file.status === "READY") {
    return "skipped";
  }
  try {
    if (!(file.contentType in EVIDENCE_TYPES)) {
      throw new PermanentEvidenceError(`Tipo no permitido: ${file.contentType}`);
    }
    const bytes = await getObject(file.objectKey); // transitorio: relanza
    let rendered: Buffer;
    try {
      rendered = await sharp(bytes).rotate().webp({ quality: WEBP_QUALITY }).toBuffer();
    } catch (error) {
      throw new PermanentEvidenceError(
        `No se pudo decodificar la imagen: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const key = file.objectKey.replace(/\.(jpg|png|webp)$/, ".webp");
    await putObject(key, rendered, "image/webp"); // transitorio: relanza
    if (key !== file.objectKey) {
      await deleteObject(file.objectKey).catch(() => undefined);
    }
    await db
      .update(challengeEvidenceFile)
      .set({
        objectKey: key,
        contentType: "image/webp",
        byteSize: rendered.byteLength,
        status: "READY",
        error: null,
        updatedAt: now,
      })
      .where(eq(challengeEvidenceFile.id, file.id));
    return "ready";
  } catch (error) {
    if (error instanceof PermanentEvidenceError) {
      await db
        .update(challengeEvidenceFile)
        .set({ status: "FAILED", error: error.message.slice(0, 500), updatedAt: now })
        .where(eq(challengeEvidenceFile.id, file.id));
      logger.warn({ fileId, err: error }, "evidencia que no es una imagen válida");
      return "failed";
    }
    throw error;
  }
}

export type EvidenceRedirect =
  | { status: 404 }
  | { status: 403 }
  | { status: 302; url: string; cacheControl: "private, no-store" };

/** Solo la entrega READY, al autor o a un ADMIN: 302 corto al bucket, sin bytes por la app. */
export async function resolveEvidenceRedirect(
  fileId: string,
  viewer: { personId: string; isAdmin: boolean },
): Promise<EvidenceRedirect> {
  const db = getDb();
  const [file] = await db
    .select({
      id: challengeEvidenceFile.id,
      objectKey: challengeEvidenceFile.objectKey,
      status: challengeEvidenceFile.status,
      personId: challengeParticipation.personId,
    })
    .from(challengeEvidenceFile)
    .innerJoin(
      challengeParticipation,
      eq(challengeParticipation.id, challengeEvidenceFile.participationId),
    )
    .where(eq(challengeEvidenceFile.id, fileId))
    .limit(1);
  if (!file || file.status !== "READY") {
    return { status: 404 };
  }
  if (file.personId !== viewer.personId && !viewer.isAdmin) {
    return { status: 403 };
  }
  const url = await presignRead(file.objectKey, READ_EXPIRY_SECONDS);
  return { status: 302, url, cacheControl: "private, no-store" };
}

/** Retiro de datos personales (ADR-067): borra objetos y filas y vacía el texto de evidencia. */
export async function deleteEvidenceFor(personId: string): Promise<number> {
  const db = getDb();
  const participations = await db
    .select({ id: challengeParticipation.id })
    .from(challengeParticipation)
    .where(eq(challengeParticipation.personId, personId));
  const ids = participations.map((row) => row.id);
  if (ids.length === 0) {
    return 0;
  }
  const files = await db
    .select()
    .from(challengeEvidenceFile)
    .where(inArray(challengeEvidenceFile.participationId, ids));
  for (const file of files) {
    await deleteObject(file.objectKey).catch(() => undefined);
  }
  await db.delete(challengeEvidenceFile).where(inArray(challengeEvidenceFile.participationId, ids));
  await db
    .update(challengeParticipation)
    .set({ evidenceText: null })
    .where(
      and(eq(challengeParticipation.personId, personId), inArray(challengeParticipation.id, ids)),
    );
  return files.length;
}

/**
 * Metadatos de las evidencias de la persona para "Mis datos" (ADR-034 regla 12): nunca
 * `objectKey`, que es la dirección interna del objeto en el bucket.
 */
export async function listEvidenceFilesFor(personId: string): Promise<
  Array<{
    id: string;
    participationId: string;
    ordinal: number;
    status: string;
    byteSize: number;
    createdAt: Date;
  }>
> {
  const db = getDb();
  const participations = db
    .select({ id: challengeParticipation.id })
    .from(challengeParticipation)
    .where(eq(challengeParticipation.personId, personId));
  return db
    .select({
      id: challengeEvidenceFile.id,
      participationId: challengeEvidenceFile.participationId,
      ordinal: challengeEvidenceFile.ordinal,
      status: challengeEvidenceFile.status,
      byteSize: challengeEvidenceFile.byteSize,
      createdAt: challengeEvidenceFile.createdAt,
    })
    .from(challengeEvidenceFile)
    .where(inArray(challengeEvidenceFile.participationId, participations));
}
