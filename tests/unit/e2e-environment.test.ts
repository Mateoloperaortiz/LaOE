import { describe, expect, it } from "vitest";
import { calendarFor, withinTermInput } from "../e2e/calendar";
import { assertOwnedDatabase, createE2eEnvironment } from "../e2e/environment";

describe("entorno desechable E2E", () => {
  const local = {
    DATABASE_URL: "postgresql://prueba:clave@127.0.0.1:5433/desarrollo",
    S3_ENDPOINT: "http://localhost:3900",
  };
  it("separa cada corrida de desarrollo y de las demás corridas y fuerza transportes sintéticos", () => {
    const first = createE2eEnvironment({
      ...local,
      MAILER: "resend",
      JOBS_ENABLED: "true",
      VAPID_PRIVATE_KEY: "no-heredar",
      GOOGLE_WALLET_ISSUER_ID: "no-heredar",
    });
    const second = createE2eEnvironment(local);
    expect(first.DATABASE_URL).not.toBe(local.DATABASE_URL);
    expect(second.DATABASE_URL).not.toBe(first.DATABASE_URL);
    expect(assertOwnedDatabase(first.DATABASE_URL ?? "").hostname).toBe("127.0.0.1");
    expect(first).toMatchObject({
      MAILER: "console",
      JOBS_ENABLED: "false",
      VAPID_PRIVATE_KEY: "",
      GOOGLE_WALLET_ISSUER_ID: "",
      PUBLIC_API_ORIGINS: "http://localhost:3100,http://localhost:3101",
    });
  });
  it.each([
    "postgresql://db.example.test/desarrollo",
    "https://localhost/desarrollo",
    "postgresql://localhost/",
  ])("rechaza un destino de base no autorizado: %s", (DATABASE_URL) => {
    expect(() => createE2eEnvironment({ ...local, DATABASE_URL })).toThrow();
  });
  it("rechaza un bucket remoto antes de preparar la base", () => {
    expect(() =>
      createE2eEnvironment({ ...local, S3_ENDPOINT: "https://bucket.example.test" }),
    ).toThrow(/bucket local/);
  });
  it.each([
    "postgresql://localhost/desarrollo",
    "postgresql://localhost/casa_digital_test",
    "postgresql://localhost/casa_e2e_",
  ])("no restaura ni elimina %s", (url) => {
    expect(() => assertOwnedDatabase(url)).toThrow(/base desechable/);
  });
});

describe("calendario sintético en Bogotá", () => {
  it.each([
    ["2027-06-29T12:00:00Z", "2027-06-30T18:00"],
    ["2027-06-30T12:00:00Z", "2027-06-30T18:00"],
    ["2027-12-31T12:00:00Z", "2027-12-31T18:00"],
    ["2028-02-28T12:00:00Z", "2028-02-29T18:00"],
  ])("mantiene las actividades dentro del término desde %s", (at, expected) => {
    expect(withinTermInput(18, calendarFor(new Date(at)))).toBe(expected);
  });
  it.each([
    ["2027-01-01T04:59:59Z", "2026-2", "2026-1"],
    ["2027-01-01T05:00:00Z", "2027-1", "2026-2"],
    ["2027-07-01T04:59:59Z", "2027-1", "2026-2"],
    ["2027-07-01T05:00:00Z", "2027-2", "2027-1"],
    ["2028-02-29T12:00:00Z", "2028-1", "2027-2"],
  ])("resuelve %s sin depender del año de creación del proyecto", (at, current, previous) => {
    const calendar = calendarFor(new Date(at));
    expect(calendar.current.code).toBe(current);
    expect(calendar.previous.code).toBe(previous);
    expect(calendar.previous.endsOn < calendar.current.startsOn).toBe(true);
    expect(
      calendar.day >= calendar.current.startsOn && calendar.day <= calendar.current.endsOn,
    ).toBe(true);
  });
});
