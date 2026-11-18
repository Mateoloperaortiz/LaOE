import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { z } from "zod";
import { DomainError } from "@/shared/lib/errors";
import { getObject, headObject, presignUpload, putObject } from "./storage";

/** Archivos privados que se conservan tal como los revisó la junta. */
export const REVIEW_FILE_MAX_BYTES = 20 * 1024 * 1024;
const binary = "application/octet-stream";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const reviewId = z.cuid2().length(24);
export const reviewFile = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[^/\\\p{Cc}]+$/u),
  digest,
});
export const submittedReviewFile = reviewFile.extend({ key: z.string().max(400) });
export const reviewUpload = z.object({
  id: reviewId,
  digest,
  byteSize: z.number().int().positive().max(REVIEW_FILE_MAX_BYTES),
});

export function signReviewUpload(prefix: string, byteSize: number) {
  return presignUpload({
    key: `${prefix}/${createId()}`,
    contentType: binary,
    minBytes: byteSize,
    maxBytes: byteSize,
  });
}

export function ownsReviewUpload(prefix: string, key: string) {
  return key.startsWith(`${prefix}/`) && reviewId.safeParse(key.slice(prefix.length + 1)).success;
}

/** La dirección del navegador solo escribe en la zona temporal. El archivo de revisión se crea con los bytes verificados. */
export async function archiveReviewFile(
  source: string,
  destination: string,
  expectedDigest: string,
  invalid: string,
) {
  const info = await headObject(source);
  if (!info?.byteSize || info.byteSize > REVIEW_FILE_MAX_BYTES || info.contentType !== binary)
    throw new DomainError(invalid);
  const bytes = await getObject(source);
  if (
    bytes.byteLength !== info.byteSize ||
    createHash("sha256").update(bytes).digest("hex") !== expectedDigest
  )
    throw new DomainError(invalid);
  await putObject(destination, bytes, binary);
}
