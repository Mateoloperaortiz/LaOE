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

async function asegurarBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    logger.info({ bucket: env.S3_BUCKET }, "el bucket ya existe");
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    logger.info({ bucket: env.S3_BUCKET }, "bucket creado");
  }
}

async function aplicarCors(): Promise<void> {
  const origenes = [new URL(env.APP_URL).origin, ...env.MEDIA_CORS_ORIGINS];
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: env.S3_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origenes,
            AllowedMethods: ["GET", "HEAD", "PUT", "POST"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  const actual = await s3.send(new GetBucketCorsCommand({ Bucket: env.S3_BUCKET }));
  logger.info(
    { origenes: actual.CORSRules?.flatMap((regla) => regla.AllowedOrigins ?? []) },
    "CORS aplicado",
  );
}

await asegurarBucket();
await aplicarCors();
s3.destroy();
