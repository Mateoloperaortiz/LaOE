import { Cron } from "croner";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { logger } from "@/shared/log";
import type { ScheduleEntry } from "./schedule";

// Encola los eventos de una entrada programada. Un lock transaccional por nombre y una clave
// de deduplicación por minuto evitan duplicados si hay más de una réplica.

export async function enqueueScheduled(entry: ScheduleEntry, now = new Date()): Promise<number> {
  const bucket = now.toISOString().slice(0, 16); // minuto
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`scheduler:${entry.name}`}))`);
    let enqueued = 0;
    for (const eventType of entry.events) {
      await enqueueEvent(tx, {
        type: eventType,
        payload: { scheduled: entry.name, at: now.toISOString() },
        dedupeKey: `scheduled:${eventType}:${bucket}`,
      });
      enqueued += 1;
    }
    return enqueued;
  });
}

export interface Scheduler {
  stop(): void;
}

export function startScheduler(schedule: ScheduleEntry[], timezone: string): Scheduler {
  const jobs = schedule.map(
    (entry) =>
      new Cron(entry.cron, { timezone, name: entry.name, protect: true }, async () => {
        try {
          const n = await enqueueScheduled(entry);
          logger.info({ schedule: entry.name, events: n }, "programado encolado");
        } catch (error) {
          logger.error({ err: error, schedule: entry.name }, "no se pudo encolar el programado");
        }
      }),
  );
  logger.info({ entries: schedule.map((entry) => entry.name), timezone }, "scheduler arrancado");
  return {
    stop() {
      for (const job of jobs) {
        job.stop();
      }
    },
  };
}
