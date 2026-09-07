import { createPrivateKey, X509Certificate } from "node:crypto";
import { z } from "zod";

// Variables de entorno validadas una sola vez. Si falta algo, el proceso falla al arrancar
// (lo llama src/instrumentation.ts) o al primer uso desde un script.

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

/** Base64 canónico de un PEM: los errores nunca incluyen el contenido de la credencial. */
function decodePem(value: string): string {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Base64 inválido");
  }
  const decoded = Buffer.from(value, "base64").toString("utf8");
  if (!decoded.startsWith("-----BEGIN ")) {
    throw new Error("PEM inválido");
  }
  return decoded;
}

const base64Pem = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      decodePem(value);
      return true;
    } catch {
      return false;
    }
  }, "Debe ser un PEM codificado en base64");

const commaSeparatedList = z.string().transform((value) =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    APP_TIMEZONE: z.string().min(1).default("America/Bogota"),
    // El proceso corre en UTC (ADR-020); cualquier otro valor es un error de configuración.
    TZ: z.literal("UTC").default("UTC"),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

    DATABASE_URL: z.url().refine((url) => url.startsWith("postgres"), {
      message: "DATABASE_URL debe ser una URL postgresql://",
    }),

    SESSION_SECRET: z.string().min(32, "SESSION_SECRET necesita al menos 32 caracteres"),
    INSTITUTIONAL_EMAIL_DOMAINS: commaSeparatedList.pipe(z.array(z.string().min(3)).min(1)),
    OTP_FIXED_CODE: z
      .string()
      .regex(/^\d{6}$/, "OTP_FIXED_CODE debe tener 6 dígitos")
      .optional(),

    MAILER: z.enum(["console", "resend"]).default("console"),
    EMAIL_FROM: z.string().min(3),
    RESEND_API_KEY: z.string().optional(),
    // Resend gratis permite 100 correos al día: desde 95 el mismo mensaje sale por SES (ADR-023).
    RESEND_DAILY_LIMIT: z.coerce.number().int().min(1).default(95),
    AWS_REGION: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),

    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default("garage"),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanString.default(true),
    MEDIA_CORS_ORIGINS: commaSeparatedList.default([]),

    // Solo producción indexa (ADR-023, ADR-033): staging y local llevan noindex y robots cerrado.
    PUBLIC_INDEXING: booleanString.default(false),

    JOBS_ENABLED: booleanString.default(false),
    JOBS_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(3000),
    JOBS_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),

    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),

    APPLE_PASS_TYPE_ID: z
      .string()
      .regex(/^pass\.[A-Za-z0-9.-]+$/)
      .optional(),
    APPLE_TEAM_ID: z
      .string()
      .regex(/^[A-Z0-9]{10}$/)
      .optional(),
    APPLE_PASS_CERT_BASE64: base64Pem.optional(),
    APPLE_PASS_KEY_BASE64: base64Pem.optional(),
    APPLE_PASS_KEY_PASSPHRASE: z.string().optional(),
    GOOGLE_WALLET_ISSUER_ID: z.string().regex(/^\d+$/).optional(),
    GOOGLE_WALLET_SA_EMAIL: z.email().optional(),
    GOOGLE_WALLET_SA_KEY_BASE64: base64Pem.optional(),
    GOOGLE_WALLET_CLASS_SUFFIX: z
      .string()
      .regex(/^[A-Za-z0-9._-]+$/)
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.OTP_FIXED_CODE !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["OTP_FIXED_CODE"],
        message: "OTP_FIXED_CODE no puede existir en producción (05-acceso.md)",
      });
    }
    if (env.MAILER === "resend" && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "MAILER=resend exige RESEND_API_KEY",
      });
    }

    const appleRequired = [
      "APPLE_PASS_TYPE_ID",
      "APPLE_TEAM_ID",
      "APPLE_PASS_CERT_BASE64",
      "APPLE_PASS_KEY_BASE64",
    ] as const;
    const googleRequired = [
      "GOOGLE_WALLET_ISSUER_ID",
      "GOOGLE_WALLET_SA_EMAIL",
      "GOOGLE_WALLET_SA_KEY_BASE64",
    ] as const;
    for (const [required, optional] of [
      [appleRequired, ["APPLE_PASS_KEY_PASSPHRASE"]],
      // El namespace del entorno puede declararse antes de cargar las credenciales.
      [googleRequired, []],
    ] as const) {
      if ([...required, ...optional].some((key) => env[key] !== undefined)) {
        for (const key of required) {
          if (!env[key]) {
            ctx.addIssue({
              code: "custom",
              path: [key],
              message: "Configurá la plataforma completa",
            });
          }
        }
      }
    }

    if (env.APPLE_PASS_CERT_BASE64) {
      try {
        new X509Certificate(decodePem(env.APPLE_PASS_CERT_BASE64));
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["APPLE_PASS_CERT_BASE64"],
          message: "Certificado PEM inválido",
        });
      }
    }
    for (const key of ["APPLE_PASS_KEY_BASE64", "GOOGLE_WALLET_SA_KEY_BASE64"] as const) {
      const value = env[key];
      if (!value) continue;
      try {
        const passphrase =
          key === "APPLE_PASS_KEY_BASE64" ? env.APPLE_PASS_KEY_PASSPHRASE : undefined;
        const privateKey = createPrivateKey({
          key: decodePem(value),
          ...(passphrase ? { passphrase } : {}),
        });
        if (privateKey.asymmetricKeyType !== "rsa") throw new Error("Se requiere RSA");
        if (key === "APPLE_PASS_KEY_BASE64" && env.APPLE_PASS_CERT_BASE64) {
          const certificate = new X509Certificate(decodePem(env.APPLE_PASS_CERT_BASE64));
          if (!certificate.checkPrivateKey(privateKey)) throw new Error("La clave no corresponde");
        }
      } catch {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Clave RSA PEM inválida, contraseña incorrecta o certificado distinto",
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    GOOGLE_WALLET_CLASS_SUFFIX: env.GOOGLE_WALLET_CLASS_SUFFIX ?? "carnet-oe",
  }));

export type Env = z.infer<typeof envSchema>;

/** Limpia valores vacíos: en Railway y en .env una variable vacía equivale a no definida. */
function withoutEmptyValues(source: Record<string, string | undefined>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== "") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(withoutEmptyValues(source));
  if (!result.success) {
    throw new Error(`Configuración inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

let cache: Env | undefined;

/** Env validado y cacheado por proceso. */
export function getEnv(): Env {
  cache ??= parseEnv();
  return cache;
}
