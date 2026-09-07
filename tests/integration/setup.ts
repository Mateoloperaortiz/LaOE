import walletCredentials from "../fixtures/wallet/toy-credentials.json";
import { testDatabaseUrl } from "./test-database";

// Cada worker apunta a la base de pruebas (creada y migrada por global-setup.ts).
try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: se usan las variables del proceso.
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Las pruebas de integración necesitan DATABASE_URL (copiá .env.example a .env y corré npm run db:up)",
  );
}
process.env.DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL);

// Las pruebas nunca mandan push de verdad: sin claves VAPID el proveedor es `console`, como en CI,
// aunque el `.env` local tenga un par para probar en Chrome (10-verificacion).
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

// Reemplaza credenciales reales del .env antes del primer getEnv(). Las pruebas de Google
// deben instalar su transporte; este emisor de juguete nunca sirve para emitir pases reales.
process.env.APPLE_PASS_TYPE_ID = "pass.test.oe";
process.env.APPLE_TEAM_ID = "TESTTEAM00";
process.env.APPLE_PASS_CERT_BASE64 = walletCredentials.signerCert;
process.env.APPLE_PASS_KEY_BASE64 = walletCredentials.signerKey;
delete process.env.APPLE_PASS_KEY_PASSPHRASE;
process.env.GOOGLE_WALLET_ISSUER_ID = "1234567890";
process.env.GOOGLE_WALLET_SA_EMAIL = "wallet@test-project.iam.gserviceaccount.com";
process.env.GOOGLE_WALLET_SA_KEY_BASE64 = walletCredentials.googleKey;
process.env.GOOGLE_WALLET_CLASS_SUFFIX = "carnet-oe-test";
