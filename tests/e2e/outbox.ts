import { closeDb } from "@/db/client";
import { drainOutbox } from "../helpers/outbox";

// CI corre con JOBS_ENABLED=false: los e2e que dependen de un handler drenan el outbox desde la prueba.
// El drenado es el de todas las pruebas (ADR-052 regla 5); acá solo se suelta la conexión del proceso
// de Playwright, también cuando el drenado falla.
export async function drenarOutbox(): Promise<void> {
  try {
    await drainOutbox();
  } finally {
    await closeDb();
  }
}
