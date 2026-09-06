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
