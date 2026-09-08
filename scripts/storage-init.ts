import {
  CreateBucketCommand,
  GetBucketCorsCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getEnv } from "@/env";
import { logger } from "@/shared/log";

// Prepara el bucket de medios: existe y tiene el CORS que exige la subida directa (ADR-022).
// El mismo script sirve para Garage en local y para el bucket de Railway en staging o producción.

const env = getEnv();
const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    logger.info({ bucket: env.S3_BUCKET }, "el bucket ya existe");
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    logger.info({ bucket: env.S3_BUCKET }, "bucket creado");
  }
}

async function applyCors(): Promise<void> {
  const origins = [new URL(env.APP_URL).origin, ...env.MEDIA_CORS_ORIGINS];
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: env.S3_BUCKET,
      CORSConfiguration: {
        // Garage debe responder con un solo origen; una regla por origen evita cabeceras múltiples.
        CORSRules: [...new Set(origins)].map((origin) => ({
          AllowedOrigins: [origin],
          AllowedMethods: ["GET", "HEAD", "PUT", "POST"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        })),
      },
    }),
  );
  const current = await s3.send(new GetBucketCorsCommand({ Bucket: env.S3_BUCKET }));
  logger.info(
    { origins: current.CORSRules?.flatMap((rule) => rule.AllowedOrigins ?? []) },
    "CORS aplicado",
  );
}

await ensureBucket();
await applyCors();
s3.destroy();
