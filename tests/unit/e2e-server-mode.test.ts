import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";
import { createE2eEnvironment } from "../e2e/environment";
import { decidedE2eServer, e2eBuildEnvironment, planE2eServer } from "../e2e/server-mode";

// DT-338 (ADR-123 regla 1): una corrida completa contra `next dev` sin nada compilado se atasca
// hacia su minuto 8; sin filtro va contra el build, como el CI.
describe("servidor de la E2E", () => {
  const build = { server: "build", compile: true };
  const dev = { server: "dev", compile: false };

  it("la corrida completa en local va contra el build y lo compila antes", () => {
    expect(planE2eServer({}, [])).toEqual(build);
  });

  it.each([
    [["--reporter=list"]],
    [["--reporter", "list"]],
    [["--workers", "1", "--retries=0"]],
    [["-j", "1", "-x"]],
    [["--project", "chromium", "setup"]],
    [["--grep-invert", "sudoku"]],
    [["-G", "sudoku"]],
    [["--only-changed", "main"]],
    [["--last-failed"]],
    [["--headed", "--trace", "on"]],
  ])("una opción que no elige archivos ni nombres no la vuelve parcial: %j", (args) => {
    expect(planE2eServer({}, args)).toEqual(build);
  });

  it.each([
    ["E2E_FILES", { E2E_FILES: "sudoku.spec.ts" }, []],
    ["un archivo", {}, ["tests/e2e/normativa.spec.ts"]],
    ["un archivo con su línea", {}, ["sudoku.spec.ts:42"]],
    ["un archivo después de una opción sin valor", {}, ["--headed", "sudoku"]],
    ["un archivo después de una opción con su valor", {}, ["--workers", "1", "sudoku"]],
    ["un archivo después de una opción escrita con =", {}, ["--project=chromium", "sudoku"]],
    ["un archivo después de --", {}, ["--headed", "--", "sudoku"]],
    ["--grep", {}, ["--grep", "busca un artículo"]],
    ["--grep=", {}, ["--grep=busca un artículo"]],
    ["-g", {}, ["-g", "busca un artículo"]],
    ["un archivo después de un nombre vacío", {}, ["-g", "", "sudoku"]],
    ["un nombre después de un argumento vacío", {}, ["", "-g", "ayudas"]],
    ["un archivo después de -- y de un argumento vacío", {}, ["--", "", "sudoku"]],
  ])("una corrida parcial por %s sigue contra dev y no compila el build", (_filter, env, args) => {
    expect(planE2eServer(env, args)).toEqual(dev);
  });

  // Playwright no recorta nada con un filtro vacío: corre la suite entera, igual que sin argumentos.
  // Es lo que llega con `-g "$PATRON"` y la variable sin definir.
  it.each([
    [[""]],
    [["-g", ""]],
    [["--grep", ""]],
    [["--grep="]],
    [["--", ""]],
    [["--headed", "", "--workers", "1"]],
    [["-g", "", "--grep="]],
  ])("un filtro vacío no recorta nada y no la vuelve parcial: %j", (args) => {
    expect(planE2eServer({}, args)).toEqual(build);
  });

  it("en el CI va contra el build y no lo compila: ya lo hizo su propio paso", () => {
    const ci = { server: "build", compile: false };
    expect(planE2eServer({ CI: "true" }, [])).toEqual(ci);
    expect(planE2eServer({ CI: "true", E2E_FILES: "sudoku.spec.ts" }, ["--workers=1"])).toEqual(ci);
    expect(planE2eServer({ CI: "true" }, ["sudoku.spec.ts", "-g", "ayudas"])).toEqual(ci);
  });

  it("E2E_SERVER fuerza cualquiera de los dos modos, con filtro o sin él", () => {
    expect(planE2eServer({ E2E_SERVER: "build", E2E_FILES: "sudoku.spec.ts" }, [])).toEqual(build);
    expect(planE2eServer({ E2E_SERVER: "build" }, ["-g", "ayudas"])).toEqual(build);
    expect(planE2eServer({ E2E_SERVER: "dev" }, [])).toEqual(dev);
    expect(planE2eServer({ E2E_SERVER: "dev", CI: "true" }, [])).toEqual(dev);
    expect(planE2eServer({ E2E_SERVER: "build", CI: "true" }, [])).toEqual({
      server: "build",
      compile: false,
    });
  });

  it("una E2E_SERVER vacía equivale a no escrita", () => {
    expect(planE2eServer({ E2E_SERVER: "" }, [])).toEqual(build);
    expect(planE2eServer({ E2E_SERVER: "" }, ["sudoku"])).toEqual(dev);
  });

  it.each([
    "start",
    "production",
    "BUILD",
    "1",
  ])("rechaza la E2E_SERVER que no reconoce: %s", (value) => {
    expect(() => planE2eServer({ E2E_SERVER: value }, [])).toThrow(/E2E_SERVER/);
    expect(() => decidedE2eServer({ E2E_SERVER: value })).toThrow(/E2E_SERVER/);
  });

  it("Playwright levanta lo que el lanzador dejó escrito y sin esa marca no elige nada", () => {
    expect(decidedE2eServer({ E2E_SERVER: "build" })).toBe("build");
    expect(decidedE2eServer({ E2E_SERVER: "dev", CI: "true" })).toBe("dev");
    expect(() => decidedE2eServer({ CI: "true" })).toThrow(/E2E_SERVER/);
    expect(() => decidedE2eServer({ E2E_SERVER: "" })).toThrow(/E2E_SERVER/);
  });

  // Si Playwright suma una opción con valor y la lista de acá no la conoce, su valor pasaría por un
  // archivo y una corrida completa volvería a dev sin que nada avisara.
  it("conoce cada opción de `playwright test`: la que lleva valor no pasa por un archivo", () => {
    const help = spawnSync(
      process.execPath,
      ["node_modules/@playwright/test/cli.js", "test", "--help"],
      { encoding: "utf8" },
    );
    expect(help.status).toBe(0);
    const options = [
      ...help.stdout.matchAll(/^ {2}(?:(-\w), )?(--[\w-]+|-\w)(?: ([<[]))?/gm),
    ].flatMap(([, short, long, value]) =>
      [short, long]
        .filter((name) => name !== undefined && name !== "--help" && name !== "-h")
        .map((name) => ({ name: name as string, takesValue: value !== undefined })),
    );
    expect(options.length).toBeGreaterThan(30);
    for (const { name, takesValue } of options) {
      const grep = name === "-g" || name === "--grep";
      const expected = grep || !takesValue ? "dev" : "build";
      expect(`${name}: ${planE2eServer({}, [name, "sudoku"]).server}`).toBe(`${name}: ${expected}`);
    }
  });
});

describe("entorno del build de la E2E", () => {
  const run = createE2eEnvironment({
    DATABASE_URL: "postgresql://prueba:clave@127.0.0.1:5433/desarrollo",
    S3_ENDPOINT: "http://localhost:3900",
    E2E_PORT: "3105",
  });
  // Lo que la casa pide además del entorno sintético y en local sale del `.env`.
  const rest = {
    INSTITUTIONAL_EMAIL_DOMAINS: "eafit.edu.co",
    EMAIL_FROM: "OE <noreply@localhost>",
    S3_ENDPOINT: "http://localhost:3900",
    S3_BUCKET: "media",
    S3_ACCESS_KEY_ID: "GK",
    S3_SECRET_ACCESS_KEY: "secreto",
  };

  it("compila como producción, con lo que fija el paso del CI y el origen de la corrida", () => {
    const built = e2eBuildEnvironment({ ...rest, ...run });
    expect(built).toMatchObject({
      NODE_ENV: "production",
      OTP_FIXED_CODE: "",
      APP_URL: "http://localhost:3105",
      MAILER: "console",
      DATABASE_URL: run.DATABASE_URL,
    });
    // ADR-121 regla 9: con NODE_ENV=production la casa no arranca sin MAILER escrito.
    expect(parseEnv(built)).toMatchObject({ NODE_ENV: "production", MAILER: "console" });
    expect(parseEnv(built).OTP_FIXED_CODE).toBeUndefined();
    expect(() => parseEnv({ ...built, MAILER: "" })).toThrow(/MAILER/);
  });

  it("el OTP fijo solo lo admite el proceso de pruebas: el build no lo recibe", () => {
    expect(run).toMatchObject({ NODE_ENV: "test", OTP_FIXED_CODE: "123456" });
    expect(parseEnv({ ...rest, ...run }).OTP_FIXED_CODE).toBe("123456");
    expect(() => parseEnv({ ...rest, ...run, NODE_ENV: "production" })).toThrow(/OTP_FIXED_CODE/);
    // Vacía y no ausente: Next lee el `.env` al compilar y no pisa una variable que ya viene escrita.
    expect(e2eBuildEnvironment({ ...rest, ...run }).OTP_FIXED_CODE).toBe("");
  });

  it("no cambia el entorno que recibe", () => {
    const source = { ...rest, ...run };
    e2eBuildEnvironment(source);
    expect(source).toMatchObject({ NODE_ENV: "test", OTP_FIXED_CODE: "123456" });
  });
});
