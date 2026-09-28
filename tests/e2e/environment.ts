import { randomBytes } from "node:crypto";
import walletCredentials from "../fixtures/wallet/toy-credentials.json" with { type: "json" };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function localDatabaseUrl(base: string): URL {
  const url = new URL(base);
  if (
    !LOCAL_HOSTS.has(url.hostname) ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname)
  ) {
    throw new Error("E2E necesita una base PostgreSQL local con nombre explícito");
  }
  return url;
}

export function assertOwnedDatabase(base: string): URL {
  const url = localDatabaseUrl(base);
  if (!/^\/casa_e2e_[a-f0-9]{16}$/.test(url.pathname)) {
    throw new Error("E2E solo puede restaurar o eliminar su base desechable casa_e2e_<id>");
  }
  return url;
}

/** El launcher y el servidor reciben exactamente el mismo entorno sintético. */
export function createE2eEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const database = localDatabaseUrl(source.DATABASE_URL ?? "");
  const storage = new URL(source.S3_ENDPOINT ?? "http://sin-configurar.invalid");
  if (!LOCAL_HOSTS.has(storage.hostname)) throw new Error("E2E necesita un bucket local");
  const port = Number(source.E2E_PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("E2E_PORT inválido");
  database.pathname = `/casa_e2e_${randomBytes(8).toString("hex")}`;
  return {
    DATABASE_URL: database.toString(),
    E2E_RUN: "1",
    NODE_ENV: "test",
    APP_URL: `http://localhost:${port}`,
    APP_TIMEZONE: "America/Bogota",
    TZ: "UTC",
    SESSION_SECRET: "e2e-sesion-sintetica-local-que-no-es-real-0000000000",
    OTP_FIXED_CODE: "123456",
    MAILER: "console",
    JOBS_ENABLED: "false",
    LOG_LEVEL: "warn",
    PUBLIC_INDEXING: "false",
    // DÍAS en local (ADR-090 y ADR-096): la vitrina y el hub de capitanes aceptan estos orígenes,
    // igual que staging, sin depender del .env de quien corre las pruebas.
    PUBLIC_API_ORIGINS: "http://localhost:3100,http://localhost:3101",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    VAPID_SUBJECT: "",
    APPLE_PASS_TYPE_ID: "pass.test.oe",
    APPLE_TEAM_ID: "TESTTEAM00",
    APPLE_PASS_CERT_BASE64: walletCredentials.signerCert,
    APPLE_PASS_KEY_BASE64: walletCredentials.signerKey,
    APPLE_PASS_KEY_PASSPHRASE: "",
    GOOGLE_WALLET_ISSUER_ID: "",
    GOOGLE_WALLET_SA_EMAIL: "",
    GOOGLE_WALLET_SA_KEY_BASE64: "",
    GOOGLE_WALLET_CLASS_SUFFIX: "",
  };
}
