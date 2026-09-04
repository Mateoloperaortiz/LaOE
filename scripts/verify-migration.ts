import { Client } from "pg";
import { closeDb } from "@/db/client";
import { logger } from "@/shared/log";
import { verifyMigration } from "./lib/migrate-ghpoints";

// Verificación obligatoria (08-migracion-ghpoints.md): conteos y sumas origen/destino; sale con error
// si difieren. Las advertencias (tasa cruda de los scores congelados, reversiones sin original,
// ediciones sin mapa) se imprimen aparte y no bloquean.

const url = process.env.GHPOINTS_DATABASE_URL;
if (!url) {
  throw new Error("Falta GHPOINTS_DATABASE_URL");
}

const source = new Client({ connectionString: url });
try {
  await source.connect();
  await source.query("set default_transaction_read_only = on");
  const { rows, warnings } = await verifyMigration(source);
  let differences = 0;
  for (const row of rows) {
    const ok = row.source === row.target;
    if (!ok) {
      differences += 1;
    }
    logger.info({ origen: row.source, destino: row.target, ok }, row.name);
  }
  for (const warning of warnings) {
    logger.warn(warning);
  }
  if (differences > 0) {
    logger.error({ differences }, "la migración tiene diferencias");
    process.exitCode = 1;
  } else {
    logger.info({ advertencias: warnings.length }, "migración verificada: cero diferencias");
  }
} finally {
  await source.end();
  await closeDb();
}
