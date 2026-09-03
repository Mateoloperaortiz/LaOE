// Carga .env si existe (en CI las variables vienen del entorno) y exige una base de datos.
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
