import { closeDb } from "@/db/client";
import { clearConfigCache } from "@/modules/system";
import { drainOutbox } from "../helpers/outbox";

// CI corre con JOBS_ENABLED=false: los e2e que dependen de un handler drenan el outbox desde la prueba.
// El drenado es el de todas las pruebas (ADR-052 regla 5); acá solo se suelta la conexión del proceso
// de Playwright, también cuando el drenado falla.
export async function drenarOutbox(): Promise<void> {
  try {
    // Las acciones del servidor cambian la base desde otro proceso: su invalidación no alcanza
    // la memoria de Playwright. Los handlers deben ver esas decisiones al drenar (ADR-052).
    clearConfigCache();
    await drainOutbox();
  } finally {
    await closeDb();
  }
}
