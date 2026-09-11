import { describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../integration/test-database";

describe("aislamiento de la base de integración", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "[::1]",
  ])("usa otra base en %s y conserva la conexión", (host) => {
    const target = new URL(
      testDatabaseUrl(`postgresql://prueba:clave@${host}:5433/casa?sslmode=disable`),
    );
    expect(target.pathname).toBe("/casa_test");
    expect(target.hostname).toBe(host);
    expect(target.port).toBe("5433");
    expect(target.searchParams.get("sslmode")).toBe("disable");
  });

  it("no agrega dos veces el sufijo al configurar cada worker", () => {
    const first = testDatabaseUrl("postgres://localhost/casa");
    expect(testDatabaseUrl(first)).toBe(first);
  });

  it.each([
    "postgresql://db.example.com/casa_test",
    "postgresql://192.0.2.1/casa",
    "postgresql://localhost/",
    "https://localhost/casa",
    "postgresql://localhost/casa%22",
  ])("rechaza %s antes de poder borrar esquemas", (url) => {
    expect(() => testDatabaseUrl(url)).toThrow(/PostgreSQL local con nombre explícito/);
  });
});
