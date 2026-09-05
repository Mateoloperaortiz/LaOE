import { closeDb } from "@/db/client";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";

// CI corre con JOBS_ENABLED=false: los e2e que dependen de un handler drenan el outbox desde la prueba.
export async function drenarOutbox(): Promise<void> {
  let result = await drain(50);
  while (result.processed > 0) {
    result = await drain(50);
  }
  await closeDb();
}
