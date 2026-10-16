import { parseArgs } from "node:util";
import { closeDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { activatePresenceNotice24hAs } from "@/modules/participation";
import { logger } from "@/shared/log";

// Sin --env-file: DATABASE_URL identifica el entorno confirmado. Ejecutar solo tras SUCCESS del
// código nuevo y retiro del escritor anterior, como indica ADR-132; nunca desde pre-deploy.
try {
  const { values } = parseArgs({
    options: { apply: { type: "boolean" } },
    allowPositionals: false,
  });
  if (!values.apply) {
    process.stdout.write("Uso: npm run presence:activate-notice24h -- --apply\n");
    process.exitCode = 1;
  } else {
    const result = await activatePresenceNotice24hAs(SYSTEM_ACTOR);
    logger.info(result, "aviso presencial de 24 horas activado o ya vigente");
  }
} catch {
  // Los errores SQL pueden contener la conexión; no se imprimen credenciales ni filas.
  logger.error("No se completó la activación; revisá el entorno confirmado y la conexión");
  process.exitCode = 1;
} finally {
  await closeDb();
}
