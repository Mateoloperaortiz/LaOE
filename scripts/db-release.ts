import { closeDb } from "@/db/client";
import { applyMigrationsAndVerify } from "./lib/release";

// Pre-deploy en Railway y `npm run db:migrate` en local: migra y verifica, nunca seed.
// Una migración puede tardar más que una consulta de la app: aquí la sentencia no lleva límite (ADR-079).
process.env.DB_STATEMENT_TIMEOUT_MS ??= "0";
try {
  await applyMigrationsAndVerify();
} finally {
  await closeDb();
}
