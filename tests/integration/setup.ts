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
