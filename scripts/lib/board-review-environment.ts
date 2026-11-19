import { createHmac } from "node:crypto";

const hosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function reviewTarget(
  database: string,
  port: number,
  source: NodeJS.ProcessEnv = process.env,
) {
  if (
    !/^casa_junta_[a-f0-9]{16}$/.test(database) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error("Se necesita una sesión de revisión válida y un puerto entre 1024 y 65535.");
  const db = new URL(source.DATABASE_URL ?? "");
  const bucket = new URL(source.S3_ENDPOINT ?? "");
  if (
    !hosts.has(db.hostname) ||
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    db.search ||
    db.hash ||
    !hosts.has(bucket.hostname) ||
    !["http:", "https:"].includes(bucket.protocol)
  )
    throw new Error("El ensayo necesita PostgreSQL y almacenamiento locales.");
  db.pathname = `/${database}`;
  const admin = new URL(db);
  admin.pathname = "/postgres";
  const appUrl = `http://127.0.0.1:${port}`;
  if (!source.SESSION_SECRET) throw new Error("Falta configurar la clave de sesión local.");
  const env = {
    ...source,
    DATABASE_URL: db.href,
    APP_URL: appUrl,
    APP_TIMEZONE: "America/Bogota",
    TZ: "UTC",
    PUBLIC_INDEXING: "false",
    SESSION_SECRET: createHmac("sha256", source.SESSION_SECRET).update(database).digest("hex"),
    INSTITUTIONAL_EMAIL_DOMAINS: "junta.example",
    OTP_FIXED_CODE: "",
    EMAIL_FROM: "ensayo@junta.example",
    MAILER: "console",
    RESEND_API_KEY: "",
    AWS_ACCESS_KEY_ID: "",
    AWS_SECRET_ACCESS_KEY: "",
    GOOGLE_CALENDAR_JUNTA_ID: "",
    GOOGLE_WALLET_SA_EMAIL: "",
    GOOGLE_WALLET_SA_KEY_BASE64: "",
    GOOGLE_WALLET_ISSUER_ID: "",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    APPLE_PASS_TYPE_ID: "",
    APPLE_TEAM_ID: "",
    APPLE_PASS_KEY_PASSPHRASE: "",
    APPLE_PASS_CERT_BASE64: "",
    APPLE_PASS_KEY_BASE64: "",
    JOBS_ENABLED: "true",
    LOG_LEVEL: "warn",
    PUBLIC_API_ORIGINS: "",
    MEDIA_CORS_ORIGINS: appUrl,
  };
  return { appUrl, adminUrl: admin.href, env };
}
