import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { getEnv } from "@/env";
import { logger } from "@/shared/log";
import { bucketClient, corsRule, readCorsRules } from "./lib/bucket-cors";

// Prepara el bucket de medios: existe y tiene el CORS que exige la subida directa (ADR-022).
// El mismo script sirve para Garage en local y para el bucket de Railway en staging o producción.

const env = getEnv();
const s3 = bucketClient(env);

async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    logger.info({ bucket: env.S3_BUCKET }, "el bucket ya existe");
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    logger.info({ bucket: env.S3_BUCKET }, "bucket creado");
  }
}

// Declara la lista completa: un origen que ya no esté en el entorno deja de estar permitido.
async function applyCors(): Promise<void> {
  const origins = [new URL(env.APP_URL).origin, ...env.MEDIA_CORS_ORIGINS];
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: env.S3_BUCKET,
      CORSConfiguration: { CORSRules: [...new Set(origins)].map(corsRule) },
    }),
  );
  const current = await readCorsRules(s3, env.S3_BUCKET);
  logger.info({ origins: current.flatMap((rule) => rule.AllowedOrigins ?? []) }, "CORS aplicado");
}

await ensureBucket();
await applyCors();
s3.destroy();
