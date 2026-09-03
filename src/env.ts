import { z } from "zod";

// Variables de entorno validadas una sola vez. Si falta algo, el proceso falla al arrancar
// (lo llama src/instrumentation.ts) o al primer uso desde un script.

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

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

    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default("garage"),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanString.default(true),
    MEDIA_CORS_ORIGINS: commaSeparatedList.default([]),

    JOBS_ENABLED: booleanString.default(false),

    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),
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
  });

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
