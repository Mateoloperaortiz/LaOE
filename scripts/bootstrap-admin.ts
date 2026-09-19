import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { closeDb } from "@/db/client";
import { logger } from "@/shared/log";
import { BootstrapAdminError, bootstrapAdmin } from "./lib/bootstrap-admin";

// Operación puntual de ADR-039. Sin --env-file: Railway aporta las variables y el operador apunta
// DATABASE_URL al túnel del entorno confirmado. --input es un JSON privado, fuera del repositorio.
try {
  const { values } = parseArgs({ options: { input: { type: "string" } }, allowPositionals: false });
  if (!values.input) {
    throw new BootstrapAdminError("Uso: npm run bootstrap:admin -- --input <JSON privado>");
  }
  const input: unknown = JSON.parse(await readFile(values.input, "utf8"));
  const result = await bootstrapAdmin(input);
  logger.info(result, "bootstrap del primer ADMIN terminado");
} catch (error) {
  // No imprimir el JSON ni los errores SQL completos: pueden contener correo, nombres o credenciales.
  logger.error(
    error instanceof BootstrapAdminError
      ? error.message
      : error instanceof Error && error.name === "ZodError"
        ? "El JSON o las variables del bootstrap no cumplen el formato requerido"
        : "El bootstrap no se completó; revisá los datos, el entorno y la conexión al Postgres elegido",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
