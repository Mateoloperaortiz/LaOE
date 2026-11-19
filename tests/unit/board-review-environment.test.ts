import { describe, expect, it } from "vitest";
import { reviewTarget } from "../../scripts/lib/board-review-environment";

describe("sesión local de la Junta", () => {
  const local: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://localhost/casa_r6_rediseno",
    S3_ENDPOINT: "http://127.0.0.1:3900",
    SESSION_SECRET: "clave-de-desarrollo-sintetica-para-pruebas",
    MAILER: "resend",
  };
  const database = "casa_junta_0123456789abcdef";
  it("reabre la misma sesión y reserva una clave distinta para cada base ficticia", () => {
    const first = reviewTarget(database, 3650, local);
    expect(new URL(first.env.DATABASE_URL).pathname).toBe(`/${database}`);
    expect(new URL(first.adminUrl).pathname).toBe("/postgres");
    expect(first.env.SESSION_SECRET).toBe(reviewTarget(database, 3650, local).env.SESSION_SECRET);
    expect(first.env.SESSION_SECRET).not.toBe(
      reviewTarget("casa_junta_0123456789abcdee", 3651, local).env.SESSION_SECRET,
    );
    expect(first.env).toMatchObject({
      APP_URL: "http://127.0.0.1:3650",
      MAILER: "console",
      INSTITUTIONAL_EMAIL_DOMAINS: "junta.example",
    });
    expect(local.DATABASE_URL).toBe("postgresql://localhost/casa_r6_rediseno");
  });
  it("protege ambas bases de desarrollo y exige servicios locales para la sesión", () => {
    for (const name of ["casa_r6", "casa_r6_rediseno"]) {
      expect(() => reviewTarget(name, 3650, local)).toThrow();
    }
    for (const overrides of [
      { DATABASE_URL: "postgresql://fuera.example/casa" },
      { DATABASE_URL: "postgresql://localhost/casa?host=fuera.example" },
      { S3_ENDPOINT: "https://archivos.example" },
    ])
      expect(() => reviewTarget(database, 3650, { ...local, ...overrides })).toThrow();
  });
});
