import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";
import walletCredentials from "../fixtures/wallet/toy-credentials.json";

const baseEnv: Record<string, string> = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://casa:casa@127.0.0.1:5433/casa_digital",
  SESSION_SECRET: "x".repeat(32),
  INSTITUTIONAL_EMAIL_DOMAINS: "EAFIT.edu.co, ejemplo.test ,",
  EMAIL_FROM: "OE <noreply@localhost>",
  S3_ENDPOINT: "http://127.0.0.1:3900",
  S3_BUCKET: "media",
  S3_ACCESS_KEY_ID: "GK",
  S3_SECRET_ACCESS_KEY: "secreto",
};

describe("parseEnv", () => {
  it("acepta la configuración mínima y aplica los valores por defecto", () => {
    const env = parseEnv(baseEnv);
    expect(env.NODE_ENV).toBe("development");
    expect(env.TZ).toBe("UTC");
    expect(env.APP_TIMEZONE).toBe("America/Bogota");
    expect(env.JOBS_ENABLED).toBe(false);
    expect(env.MAILER).toBe("console");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.MEDIA_CORS_ORIGINS).toEqual([]);
    expect(env.PUBLIC_API_ORIGINS).toEqual([]);
    expect(env.RESEND_DAILY_LIMIT).toBe(95);
    expect(env.JOBS_POLL_INTERVAL_MS).toBe(3000);
    expect(env.DB_CONNECTION_TIMEOUT_MS).toBe(10_000);
    expect(env.DB_STATEMENT_TIMEOUT_MS).toBe(60_000);
    expect(env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS).toBe(900_000);
    expect(env.JOBS_HANDLER_TIMEOUT_MS).toBe(600_000);
  });

  it("exige que la base espere más que el poller, salvo que alguno esté desactivado (ADR-079)", () => {
    expect(() =>
      parseEnv({
        ...baseEnv,
        DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "600000",
        JOBS_HANDLER_TIMEOUT_MS: "600000",
      }),
    ).toThrow("DB_IDLE_IN_TRANSACTION_TIMEOUT_MS");
    expect(
      parseEnv({ ...baseEnv, DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "0" })
        .DB_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    ).toBe(0);
  });

  it("normaliza los dominios institucionales en minúsculas y sin vacíos", () => {
    expect(parseEnv(baseEnv).INSTITUTIONAL_EMAIL_DOMAINS).toEqual(["eafit.edu.co", "ejemplo.test"]);
  });

  it("trata una variable vacía como no definida", () => {
    const env = parseEnv({ ...baseEnv, OTP_FIXED_CODE: "", RESEND_API_KEY: "" });
    expect(env.OTP_FIXED_CODE).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("rechaza un secreto de sesión corto", () => {
    expect(() => parseEnv({ ...baseEnv, SESSION_SECRET: "corto" })).toThrow(/SESSION_SECRET/);
  });

  it("rechaza una zona horaria del proceso distinta de UTC", () => {
    expect(() => parseEnv({ ...baseEnv, TZ: "America/Bogota" })).toThrow(/TZ/);
  });

  it("rechaza el código fijo de OTP en producción", () => {
    expect(() =>
      parseEnv({ ...baseEnv, NODE_ENV: "production", OTP_FIXED_CODE: "123456" }),
    ).toThrow(/OTP_FIXED_CODE/);
    expect(parseEnv({ ...baseEnv, OTP_FIXED_CODE: "123456" }).OTP_FIXED_CODE).toBe("123456");
  });

  // DT-159 inciso b (ADR-121 regla 9): en producción el correo no cae a la consola por omisión.
  it("en producción exige MAILER explícito, y vacío vale como ausente", () => {
    const production = { ...baseEnv, NODE_ENV: "production" };
    expect(() => parseEnv(production)).toThrow(/MAILER/);
    expect(() => parseEnv({ ...production, MAILER: "" })).toThrow(/MAILER/);
    expect(parseEnv({ ...production, MAILER: "console" }).MAILER).toBe("console");
    expect(
      parseEnv({ ...production, MAILER: "resend", RESEND_API_KEY: "re_sintetica" }).MAILER,
    ).toBe("resend");
  });

  it.each([
    "development",
    "test",
  ])("con NODE_ENV=%s, sin MAILER el correo va a la consola", (mode) => {
    expect(parseEnv({ ...baseEnv, NODE_ENV: mode }).MAILER).toBe("console");
    expect(parseEnv({ ...baseEnv, NODE_ENV: mode, MAILER: "" }).MAILER).toBe("console");
  });

  it("exige la clave de Resend cuando el mailer es resend", () => {
    expect(() => parseEnv({ ...baseEnv, MAILER: "resend" })).toThrow(/RESEND_API_KEY/);
  });

  const appleEnv = {
    APPLE_PASS_TYPE_ID: "pass.test.oe",
    APPLE_TEAM_ID: "TESTTEAM00",
    APPLE_PASS_CERT_BASE64: walletCredentials.signerCert,
    APPLE_PASS_KEY_BASE64: walletCredentials.signerKey,
  };
  const googleEnv = {
    GOOGLE_WALLET_ISSUER_ID: "1234567890",
    GOOGLE_WALLET_SA_EMAIL: "wallet@test-project.iam.gserviceaccount.com",
    GOOGLE_WALLET_SA_KEY_BASE64: walletCredentials.googleKey,
  };

  it("acepta ambas plataformas completas y deja los sufijos opcionales", () => {
    const env = parseEnv({ ...baseEnv, ...appleEnv, ...googleEnv });
    expect(env.APPLE_PASS_TYPE_ID).toBe(appleEnv.APPLE_PASS_TYPE_ID);
    expect(env.GOOGLE_WALLET_CLASS_SUFFIX).toBe("carnet-oe");
    expect(
      parseEnv({ ...baseEnv, ...googleEnv, GOOGLE_WALLET_CLASS_SUFFIX: "carnet-oe-staging" })
        .GOOGLE_WALLET_CLASS_SUFFIX,
    ).toBe("carnet-oe-staging");
  });

  it.each(Object.keys(appleEnv))("rechaza Apple parcial si falta %s", (key) => {
    expect(() => parseEnv({ ...baseEnv, ...appleEnv, [key]: "" })).toThrow(key);
  });

  it.each(Object.keys(googleEnv))("rechaza Google parcial si falta %s", (key) => {
    expect(() => parseEnv({ ...baseEnv, ...googleEnv, [key]: "" })).toThrow(key);
  });

  it("una contraseña exige Apple completo, pero un namespace no habilita Google", () => {
    expect(() => parseEnv({ ...baseEnv, APPLE_PASS_KEY_PASSPHRASE: "juguete" })).toThrow(
      "APPLE_PASS_TYPE_ID",
    );
    const env = parseEnv({ ...baseEnv, GOOGLE_WALLET_CLASS_SUFFIX: "carnet-oe-staging" });
    expect(env.GOOGLE_WALLET_ISSUER_ID).toBeUndefined();
    expect(env.GOOGLE_WALLET_CLASS_SUFFIX).toBe("carnet-oe-staging");
  });

  it.each([
    ["APPLE_PASS_TYPE_ID", "com.test"],
    ["APPLE_TEAM_ID", "short"],
    ["GOOGLE_WALLET_ISSUER_ID", "issuer"],
    ["GOOGLE_WALLET_SA_EMAIL", "sin-correo"],
    ["GOOGLE_WALLET_CLASS_SUFFIX", "../otro"],
  ])("valida el formato de %s", (key, value) => {
    expect(() =>
      parseEnv({ ...baseEnv, ...appleEnv, ...googleEnv, [key as string]: value }),
    ).toThrow(key);
  });

  it("rechaza base64 que no contiene un PEM parseable sin revelar el valor", () => {
    const secret = Buffer.from(
      "-----BEGIN PRIVATE KEY-----\ncontenido-sensible\n-----END PRIVATE KEY-----",
    ).toString("base64");
    let message = "";
    try {
      parseEnv({ ...baseEnv, ...googleEnv, GOOGLE_WALLET_SA_KEY_BASE64: secret });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("GOOGLE_WALLET_SA_KEY_BASE64");
    expect(message).not.toContain(secret);
    expect(message).not.toContain("contenido-sensible");
    expect(() =>
      parseEnv({ ...baseEnv, ...appleEnv, APPLE_PASS_CERT_BASE64: "no es base64" }),
    ).toThrow("APPLE_PASS_CERT_BASE64");
  });

  it("rechaza claves Apple que no corresponden al certificado", () => {
    expect(() =>
      parseEnv({ ...baseEnv, ...appleEnv, APPLE_PASS_KEY_BASE64: walletCredentials.googleKey }),
    ).toThrow("APPLE_PASS_KEY_BASE64");
  });
});
