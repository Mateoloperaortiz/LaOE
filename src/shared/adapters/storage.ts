import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "@/env";

// Bucket privado S3 (ADR-022): subida directa con POST prefirmado y condiciones, entrega por URL prefirmada.
// En local apunta a Garage; en Railway, al bucket del proyecto.

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  key: string;
  expiresAt: Date;
}

export interface PresignUploadInput {
  key: string;
  contentType: string;
  minBytes?: number;
  maxBytes?: number;
  expiresInSeconds?: number;
}

export interface ObjectInfo {
  contentType: string | null;
  byteSize: number | null;
}

let client: S3Client | undefined;

function s3(): S3Client {
  if (client) {
    return client;
  }
  const env = getEnv();
  client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    // ADR-079: conectar y cada tramo sin datos tienen límite; un bucket mudo no cuelga a quien llama.
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
  });
  return client;
}

export async function presignUpload(input: PresignUploadInput): Promise<PresignedUpload> {
  const env = getEnv();
  const minBytes = input.minBytes ?? 5 * 1024;
  const maxBytes = input.maxBytes ?? 20 * 1024 * 1024;
  const expiresIn = input.expiresInSeconds ?? 600;
  const { url, fields } = await createPresignedPost(s3(), {
    Bucket: env.S3_BUCKET,
    Key: input.key,
    Conditions: [
      ["content-length-range", minBytes, maxBytes],
      ["eq", "$Content-Type", input.contentType],
    ],
    Fields: { "Content-Type": input.contentType },
    Expires: expiresIn,
  });
  return { url, fields, key: input.key, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

export async function headObject(key: string): Promise<ObjectInfo | null> {
  try {
    const result = await s3().send(new HeadObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: key }));
    return { contentType: result.ContentType ?? null, byteSize: result.ContentLength ?? null };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) {
      return null;
    }
    throw error;
  }
}

/** Bytes de un objeto (para generar variantes en el servidor); lanza si no existe. */
export async function getObject(key: string): Promise<Uint8Array> {
  const result = await s3().send(new GetObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: key }));
  if (!result.Body) {
    throw new Error(`Objeto sin cuerpo: ${key}`);
  }
  return result.Body.transformToByteArray();
}

/** Entrega autenticada de la galería: stream con cancelación, sin cargar todo el objeto en memoria. */
export async function getObjectStream(
  key: string,
  signal?: AbortSignal,
  options: { inactivityTimeoutMs?: number } = {},
): Promise<{
  body: ReadableStream<Uint8Array>;
  byteSize: number | null;
} | null> {
  try {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: key }),
      signal ? { abortSignal: signal } : {},
    );
    if (!result.Body) throw new Error(`Objeto sin cuerpo: ${key}`);
    return {
      body: limitStreamInactivity(
        result.Body.transformToWebStream(),
        signal,
        options.inactivityTimeoutMs ?? 30_000,
      ),
      byteSize: result.ContentLength ?? null,
    };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw error;
  }
}

/** El SDK termina su requestTimeout al recibir headers; el cuerpo necesita su propio límite. */
function limitStreamInactivity(
  source: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (reason: unknown) => void;
  const abort = () => stop(signal?.reason ?? new DOMException("Petición cancelada", "AbortError"));
  const cleanup = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    signal?.removeEventListener("abort", abort);
  };
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        stop = (reason) => {
          if (finished) return;
          finished = true;
          cleanup();
          controller.error(reason);
          void reader.cancel(reason).catch(() => undefined);
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      },
      async pull(controller) {
        timer = setTimeout(
          () => stop(new DOMException("El objeto dejó de enviar datos", "TimeoutError")),
          timeoutMs,
        );
        try {
          const chunk = await reader.read();
          if (finished) return;
          if (timer !== undefined) clearTimeout(timer);
          timer = undefined;
          if (chunk.done) {
            finished = true;
            cleanup();
            controller.close();
          } else {
            controller.enqueue(chunk.value);
          }
        } catch (error) {
          stop(error);
        }
      },
      async cancel(reason) {
        if (finished) return;
        finished = true;
        cleanup();
        await reader.cancel(reason);
      },
    },
    // El plazo solo corre cuando falta una lectura del bucket, no cuando el cliente hace pausa.
    { highWaterMark: 0 },
  );
}

export async function presignRead(key: string, expiresInSeconds: number): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/** @public Subida desde el servidor (scripts, jobs, variantes); nunca desde el navegador. */
export async function putObject(
  key: string,
  body: Uint8Array | string,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: getEnv().S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: key }));
}
