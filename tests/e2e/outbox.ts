import { closeDb } from "@/db/client";
import "@/jobs/handlers";
import { isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { drain } from "@/jobs/poller";
import { outbox } from "@/modules/system/schema";

// CI corre con JOBS_ENABLED=false: los e2e que dependen de un handler drenan el outbox desde la prueba.
export async function drenarOutbox(): Promise<void> {
  try {
    for (let batch = 0; batch < 100; batch++) {
      const result = await drain(50);
      const errors = await getDb()
        .select({ type: outbox.eventType, error: outbox.lastError })
        .from(outbox)
        .where(isNotNull(outbox.lastError));
      if (result.failed > 0 || errors.length > 0) {
        throw new Error(`Falló el outbox E2E: ${JSON.stringify(errors)}`);
      }
      if (result.processed === 0) return;
    }
    throw new Error("El outbox E2E no terminó después de 5000 trabajos");
  } finally {
    await closeDb();
  }
}
