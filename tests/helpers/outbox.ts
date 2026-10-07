import "@/jobs/handlers";
import { isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type DrainResult, drain } from "@/jobs/poller";
import { outbox } from "@/modules/system/schema";

// El único drenado del outbox de las pruebas de integración y de las E2E. Importarlo registra los
// handlers de todos los módulos. La semántica es la de ADR-052 regla 5: eventos encadenados hasta
// agotarlos, tope de 5000 trabajos, lo agendado no se adelanta y cualquier fallo rompe la llamada.

const BATCH_SIZE = 50;
const MAX_ROUNDS = 100;

interface DrainOutboxOptions {
  /**
   * El instante que ve el poller en vez del reloj real: adelantarlo alcanza el reintento de un fallo
   * o un evento agendado. Sin esto, nada que todavía no venza se procesa.
   */
  now?: Date;
  /**
   * Tipos de evento cuyo fallo la prueba espera. Un fallo de cualquier otro tipo rompe la llamada, y
   * también que uno de estos no esté fallido al terminar: la declaración no puede quedarse vieja.
   */
  expectFailures?: readonly string[];
}

/**
 * Drena el outbox hasta el reposo: no queda nada listo para correr, tampoco lo que encolaron los
 * handlers por el camino. Al terminar, ninguna fila puede tener error (ni esperando reintento ni en
 * dead letter, ni de una llamada anterior), salvo las de `expectFailures`.
 */
export async function drainOutbox(options: DrainOutboxOptions = {}): Promise<DrainResult> {
  const total: DrainResult = { processed: 0, failed: 0 };
  let resting = false;
  for (let round = 0; round < MAX_ROUNDS && !resting; round += 1) {
    // Reloj fresco en cada ronda: lo que encola un handler nace después del reloj de la ronda que lo
    // produjo, así que esa ronda no lo ve. Un fallo queda con backoff y tampoco se repite.
    const result = await drain(BATCH_SIZE, options.now ?? new Date());
    total.processed += result.processed;
    total.failed += result.failed;
    resting = result.processed + result.failed === 0;
  }
  if (!resting) {
    throw new Error(`El outbox no llegó al reposo después de ${MAX_ROUNDS * BATCH_SIZE} trabajos`);
  }

  const failures = await getDb()
    .select({ type: outbox.eventType, error: outbox.lastError })
    .from(outbox)
    .where(isNotNull(outbox.lastError));
  const expected = new Set(options.expectFailures ?? []);
  const unexpected = failures.filter((row) => !expected.has(row.type));
  // Un fallo de esta llamada cuenta aunque su fila ya no esté para leerla.
  if (unexpected.length > 0 || (expected.size === 0 && total.failed > 0)) {
    throw new Error(
      `Falló el outbox (${total.failed} en esta llamada): ${JSON.stringify(unexpected)}`,
    );
  }
  const missing = [...expected].filter((type) => !failures.some((row) => row.type === type));
  if (missing.length > 0) {
    throw new Error(`La prueba esperaba un fallo que no ocurrió: ${missing.join(", ")}`);
  }
  return total;
}
