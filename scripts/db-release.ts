import { closeDb } from "@/db/client";
import { applyMigrationsAndVerify } from "./lib/release";

// Pre-deploy en Railway y `npm run db:migrate` en local: migra y verifica, nunca seed.
try {
  await applyMigrationsAndVerify();
} finally {
  await closeDb();
}
