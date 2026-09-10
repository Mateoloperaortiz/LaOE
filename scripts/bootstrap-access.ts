import { parseArgs } from "node:util";
import { closeDb } from "@/db/client";
import { logger } from "@/shared/log";
import { BootstrapAccessError, bootstrapAccess } from "./lib/bootstrap-access";

// Operación puntual de ADR-051. Sin --env-file: el operador apunta DATABASE_URL y APP_URL al
// entorno confirmado. El enlace va a stdout y nunca al log, que puede quedar en un archivo.
try {
  const { values } = parseArgs({
    options: { email: { type: "string" }, kind: { type: "string" } },
    allowPositionals: false,
  });
  const result = await bootstrapAccess({
    email: values.email,
    ...(values.kind ? { kind: values.kind } : {}),
  });
  logger.info(
    { personId: result.personId, expiresAt: result.expiresAt.toISOString() },
    "enlace de acceso emitido por el arranque",
  );
  process.stdout.write(`${result.url}\n`);
} catch (error) {
  // No imprimir el error completo: puede traer el correo o fragmentos de la conexión.
  logger.error(
    error instanceof BootstrapAccessError
      ? error.message
      : "El arranque no se completó; revisá el correo, el entorno y la conexión al Postgres elegido",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
