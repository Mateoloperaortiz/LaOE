import { describe, expect, it } from "vitest";
import { parsearEntorno } from "@/env";

const base: Record<string, string> = {
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

describe("parsearEntorno", () => {
  it("acepta la configuración mínima y aplica los valores por defecto", () => {
    const env = parsearEntorno(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.TZ).toBe("UTC");
    expect(env.APP_TIMEZONE).toBe("America/Bogota");
    expect(env.JOBS_ENABLED).toBe(false);
    expect(env.MAILER).toBe("console");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.MEDIA_CORS_ORIGINS).toEqual([]);
  });

  it("normaliza los dominios institucionales en minúsculas y sin vacíos", () => {
    expect(parsearEntorno(base).INSTITUTIONAL_EMAIL_DOMAINS).toEqual([
      "eafit.edu.co",
      "ejemplo.test",
    ]);
  });

  it("trata una variable vacía como no definida", () => {
    const env = parsearEntorno({ ...base, OTP_FIXED_CODE: "", RESEND_API_KEY: "" });
    expect(env.OTP_FIXED_CODE).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("rechaza un secreto de sesión corto", () => {
    expect(() => parsearEntorno({ ...base, SESSION_SECRET: "corto" })).toThrow(/SESSION_SECRET/);
  });

  it("rechaza una zona horaria del proceso distinta de UTC", () => {
    expect(() => parsearEntorno({ ...base, TZ: "America/Bogota" })).toThrow(/TZ/);
  });

  it("rechaza el código fijo de OTP en producción", () => {
    expect(() =>
      parsearEntorno({ ...base, NODE_ENV: "production", OTP_FIXED_CODE: "123456" }),
    ).toThrow(/OTP_FIXED_CODE/);
    expect(parsearEntorno({ ...base, OTP_FIXED_CODE: "123456" }).OTP_FIXED_CODE).toBe("123456");
  });

  it("exige la clave de Resend cuando el mailer es resend", () => {
    expect(() => parsearEntorno({ ...base, MAILER: "resend" })).toThrow(/RESEND_API_KEY/);
  });
});
