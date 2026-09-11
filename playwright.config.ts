import { readdirSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { assertOwnedDatabase } from "./tests/e2e/environment";

const prepared = process.env.E2E_RUN === "1";
if (prepared) assertOwnedDatabase(process.env.DATABASE_URL ?? "");
const port = Number(process.env.E2E_PORT ?? "3000");
const baseURL = process.env.APP_URL ?? `http://localhost:${port}`;
const chromium = {
  name: "chromium",
  use: { ...devices["Desktop Chrome"] },
  dependencies: ["setup"],
};
// Un proyecto por archivo permite invertir el orden con la API pública de Playwright.
const scenarios =
  process.env.E2E_ORDER === "reverse"
    ? readdirSync(new URL("./tests/e2e/", import.meta.url), { recursive: true, encoding: "utf8" })
        .filter((name) => /\.(spec|test)\.[cm]?[jt]sx?$/.test(name))
        .sort()
        .reverse()
        .map((name) => ({ ...chromium, name: `chromium:${name}`, testMatch: `**/${name}` }))
    : [chromium];

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: baseURL,
    trace: "retain-on-failure",
    locale: "es-CO",
    timezoneId: "America/Bogota",
  },
  projects: [{ name: "setup", testMatch: /auth\.setup\.ts/ }, ...scenarios],
  // Knip puede leer la configuración. Una ejecución directa falla en globalSetup sin arrancar app.
  webServer: prepared
    ? {
        // CI prueba rutas ya compiladas; solo el proceso de pruebas admite el OTP fijo.
        command: process.env.CI
          ? `npm run start -- --port ${port}`
          : `npm run dev -- --port ${port}`,
        // Hereda el entorno ya preparado por el launcher, sin copiarlo al reporte de Playwright.
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : [],
});
