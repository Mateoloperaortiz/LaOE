import { parseArgs } from "node:util";
import { closeDb } from "@/db/client";
import { logger } from "@/shared/log";
import { prepareTheGamesRehearsal, RehearsalError } from "./lib/the-games-ensayo";

// Ensayo de The Games en producción (runbook, sección The Games). Sin --env-file: Railway aporta las
// variables y el operador apunta DATABASE_URL al túnel del entorno confirmado.
// Uso: npm run the-games:ensayo -- --admin <correo del ADMIN> [--slug ensayo-2026]
try {
  const { values } = parseArgs({
    options: { admin: { type: "string" }, slug: { type: "string", default: "ensayo-2026" } },
    allowPositionals: false,
  });
  if (!values.admin) {
    throw new RehearsalError("Uso: npm run the-games:ensayo -- --admin <correo> [--slug …]");
  }
  const result = await prepareTheGamesRehearsal({ adminEmail: values.admin, slug: values.slug });
  logger.info(
    result.created ? result : { ...result, codes: undefined },
    result.created ? "ensayo de The Games preparado" : "el ensayo ya existía; no se tocó",
  );
} catch (error) {
  logger.error(
    error instanceof RehearsalError
      ? error.message
      : "El ensayo no se preparó; revisá el entorno y la conexión al Postgres elegido",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
