import {
  type CORSRule,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Client } from "pg";
import type { Env } from "@/env";

// CORS del bucket de medios para la subida directa (ADR-022). `storage:init` declara la lista
// completa de orígenes de un entorno; el lanzador E2E solo suma el suyo al bucket local (ADR-077).

export function bucketClient(env: Env): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
}

/** Garage debe responder con un solo origen; una regla por origen evita cabeceras múltiples. */
export function corsRule(origin: string): CORSRule {
  return {
    AllowedOrigins: [origin],
    AllowedMethods: ["GET", "HEAD", "PUT", "POST"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  };
}

/** Reglas vigentes; un bucket al que nadie le aplicó CORS responde 404 y equivale a ninguna. */
export async function readCorsRules(s3: S3Client, bucket: string): Promise<CORSRule[]> {
  try {
    const current = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }));
    return current.CORSRules ?? [];
  } catch (error) {
    if ((error as { name?: string }).name === "NoSuchCORSConfiguration") {
      return [];
    }
    throw error;
  }
}

/** Las mismas reglas más la del origen, o `null` si alguna ya lo admite. */
export function withCorsOrigin(rules: CORSRule[], origin: string): CORSRule[] | null {
  const allowed = rules.some((rule) =>
    rule.AllowedOrigins?.some((candidate) => candidate === origin || candidate === "*"),
  );
  return allowed ? null : [...rules, corsRule(origin)];
}

/**
 * Suma un origen sin quitar los de otras sesiones y dice si hizo falta escribir. S3 reemplaza el
 * CORS entero y no ofrece escritura condicional: el candado serializa leer, sumar y escribir entre
 * quienes lo pidan en la misma base de PostgreSQL.
 */
export async function allowCorsOrigin(input: {
  s3: S3Client;
  bucket: string;
  origin: string;
  lock: Client;
}): Promise<boolean> {
  const { s3, bucket, origin, lock } = input;
  await lock.query("begin");
  try {
    await lock.query("select pg_advisory_xact_lock(hashtext($1))", [`bucket-cors:${bucket}`]);
    const rules = withCorsOrigin(await readCorsRules(s3, bucket), origin);
    if (rules) {
      await s3.send(
        new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: rules } }),
      );
    }
    return rules !== null;
  } finally {
    // El candado es de la transacción: cerrarla lo libera también si el bucket falló.
    await lock.query("commit");
  }
}
