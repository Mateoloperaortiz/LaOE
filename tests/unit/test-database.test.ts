import { describe, expect, it } from "vitest";
import {
  integrationPoolId,
  integrationWorkers,
  isTestDatabaseUrl,
  testDatabaseUrl,
  testDatabaseUrls,
} from "../integration/test-database";

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

  it("da una base por ranura de worker y normaliza una URL ya derivada", () => {
    const workerTwo = testDatabaseUrl("postgres://localhost/casa", 2);
    expect(new URL(workerTwo).pathname).toBe("/casa_test_w2");
    expect(new URL(testDatabaseUrl(workerTwo, 3)).pathname).toBe("/casa_test_w3");
    expect(new URL(testDatabaseUrl(workerTwo)).pathname).toBe("/casa_test");
    expect(
      testDatabaseUrls("postgres://localhost/casa", 3).map((url) => new URL(url).pathname),
    ).toEqual(["/casa_test", "/casa_test_w2", "/casa_test_w3"]);
  });

  it("reconoce las bases de integración de cualquier ranura y solo esas", () => {
    expect(isTestDatabaseUrl("postgres://localhost/casa_test")).toBe(true);
    expect(isTestDatabaseUrl("postgres://localhost/casa_test_w2")).toBe(true);
    expect(isTestDatabaseUrl("postgres://localhost/casa_test_w4")).toBe(true);
    expect(isTestDatabaseUrl("postgres://localhost/casa")).toBe(false);
    expect(isTestDatabaseUrl("postgres://localhost/casa_testing")).toBe(false);
    expect(isTestDatabaseUrl("postgres://localhost/casa_test_w")).toBe(false);
    expect(isTestDatabaseUrl("no-es-una-url")).toBe(false);
  });

  it("lee cuántos workers y qué ranura tiene este proceso, y rechaza valores fuera de rango", () => {
    expect(integrationWorkers({})).toBe(2);
    expect(integrationWorkers({ INTEGRATION_WORKERS: "3" })).toBe(3);
    expect(integrationPoolId({}, 2)).toBe(1);
    expect(integrationPoolId({ VITEST_POOL_ID: "2" }, 2)).toBe(2);
    expect(() => integrationWorkers({ INTEGRATION_WORKERS: "0" })).toThrow(/INTEGRATION_WORKERS/);
    expect(() => integrationWorkers({ INTEGRATION_WORKERS: "x" })).toThrow(/INTEGRATION_WORKERS/);
    expect(() => integrationPoolId({ VITEST_POOL_ID: "3" }, 2)).toThrow(/VITEST_POOL_ID/);
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
