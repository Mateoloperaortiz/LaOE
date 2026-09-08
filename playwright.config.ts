import { defineConfig, devices } from "@playwright/test";
import walletCredentials from "./tests/fixtures/wallet/toy-credentials.json" with { type: "json" };

try {
  process.loadEnvFile(".env");
} catch {
  // En CI las variables vienen del entorno.
}

// La suite controla su servidor y nunca hereda credenciales reales de billeteras del .env.
const port = Number(process.env.E2E_PORT ?? "3000");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("E2E_PORT inválido");
const walletTestEnv = {
  NODE_ENV: "test",
  APP_URL: `http://localhost:${port}`,
  APP_TIMEZONE: "America/Bogota",
  TZ: "UTC",
  SESSION_SECRET: "e2e-sesion-sintetica-local-que-no-es-real-0000000000",
  OTP_FIXED_CODE: "123456",
  MAILER: "console",
  JOBS_ENABLED: "false",
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
  VAPID_SUBJECT: "",
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
    baseURL: walletTestEnv.APP_URL,
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
    command: process.env.CI ? `npm run start -- --port ${port}` : `npm run dev -- --port ${port}`,
    env: walletTestEnv,
    url: `${walletTestEnv.APP_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
