import { defineConfig, devices } from "@playwright/test";
import walletCredentials from "./tests/fixtures/wallet/toy-credentials.json" with { type: "json" };

try {
  process.loadEnvFile(".env");
} catch {
  // En CI las variables vienen del entorno.
}

// La suite controla su servidor y nunca hereda credenciales reales de billeteras del .env.
const walletTestEnv = {
  NODE_ENV: "test",
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
Object.assign(process.env, walletTestEnv);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "es-CO",
    timezoneId: "America/Bogota",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
  webServer: {
    // CI prueba rutas ya compiladas; solo el proceso de pruebas admite el OTP fijo.
    command: process.env.CI ? "npm run start" : "npm run dev",
    env: walletTestEnv,
    url: "http://localhost:3000/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
