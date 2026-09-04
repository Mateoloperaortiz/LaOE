import { Client } from "pg";
import { closeDb } from "@/db/client";
import { drain } from "@/jobs/poller";
import { logger } from "@/shared/log";
import { migrateGhpoints } from "./lib/migrate-ghpoints";
import "@/jobs/handlers";

// Ensayo de migración desde GHPOINTS (ADR-018, ADR-034, ADR-035): lee de GHPOINTS_DATABASE_URL (la
// restauración local del dump, en una sesión de solo lectura) y escribe en DATABASE_URL. Nunca contra
// producción. Al final drena el outbox para que el score de cada ocasión migrada quede calculado antes
// de `migrate:verify`.

const url = process.env.GHPOINTS_DATABASE_URL;
if (!url) {
  throw new Error("Falta GHPOINTS_DATABASE_URL (la copia local de GHPOINTS; nunca la base viva)");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("La migración se ensaya en local; el cutover es la fase 7");
}

const source = new Client({ connectionString: url });
try {
  await source.connect();
  await source.query("set default_transaction_read_only = on");
  const summary = await migrateGhpoints(source, { actorId: null });
  logger.info({ ...summary, warnings: summary.warnings.length }, "migración en seco aplicada");
  for (const warning of summary.warnings) {
    logger.warn(warning);
  }
  const drained = { processed: 0, failed: 0 };
  for (;;) {
    const batch = await drain(100);
    drained.processed += batch.processed;
    drained.failed += batch.failed;
    if (batch.processed + batch.failed === 0) {
      break;
    }
  }
  logger.info(drained, "outbox drenado (scores de comité recalculados)");
} finally {
  await source.end();
  await closeDb();
}
