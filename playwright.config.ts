import { readdirSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { assertOwnedDatabase } from "./tests/e2e/environment";
import { decidedE2eServer } from "./tests/e2e/server-mode";

const prepared = process.env.E2E_RUN === "1";
if (prepared) assertOwnedDatabase(process.env.DATABASE_URL ?? "");
const port = Number(process.env.E2E_PORT ?? "3000");
const baseURL = process.env.APP_URL ?? `http://localhost:${port}`;
const available = readdirSync(new URL("./tests/e2e/", import.meta.url), {
  recursive: true,
  encoding: "utf8",
})
  .filter((name) => /\.(spec|test)\.[cm]?[jt]sx?$/.test(name))
  .sort();
// ADR-054: cada runner de CI recibe su partición por archivo; el proyecto setup no se reparte.
const assigned =
  process.env.E2E_FILES === undefined
    ? null
    : process.env.E2E_FILES.split(",")
        .map((name) => name.trim())
        .filter(Boolean);
if (assigned) {
  const unknown = assigned.filter((name) => !available.includes(name));
  if (assigned.length === 0 || unknown.length > 0) {
    throw new Error(`E2E_FILES vacío o con archivos inexistentes: ${unknown.join(", ")}`);
  }
}
const selected = assigned ? available.filter((name) => assigned.includes(name)) : available;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matcher = (name: string) => new RegExp(`(^|/)${literal(name)}$`);
const chromium = {
  name: "chromium",
  use: { ...devices["Desktop Chrome"] },
  dependencies: ["setup"],
  ...(assigned ? { testMatch: selected.map(matcher) } : {}),
};
// Un proyecto por archivo permite invertir el orden con la API pública de Playwright.
const scenarios =
  process.env.E2E_ORDER === "reverse"
    ? [...selected]
        .reverse()
        .map((name) => ({ ...chromium, name: `chromium:${name}`, testMatch: matcher(name) }))
    : [chromium];

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
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
        // El lanzador ya eligió: rutas compiladas, como el CI, o dev para una corrida parcial
        // (ADR-123 regla 1). Solo el proceso de pruebas admite el OTP fijo.
        command: `npm run ${decidedE2eServer(process.env) === "build" ? "start" : "dev"} -- --port ${port}`,
        // Hereda el entorno ya preparado por el launcher, sin copiarlo al reporte de Playwright.
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : [],
});
