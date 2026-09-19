import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { outbox } from "@/modules/system/schema";
import { withTimeout } from "@/shared/lib/timeout";
import { logger } from "@/shared/log";
import { backoffFor, isDeadAfter } from "./backoff";
import { getHandlers } from "./registry";

// Poller del outbox (ADR-012, ADR-021): toma una fila pendiente con FOR UPDATE SKIP LOCKED, corre sus
// handlers y la marca. La transacción del poller solo sostiene el bloqueo de la fila: los handlers
// trabajan con sus propias conexiones (getDb, runCommand), no dentro de ella. Dos pollers nunca
// procesan la misma fila.

export type ProcessOutcome = "idle" | "processed" | "failed";

/**
 * `handlerTimeoutMs` es el último recurso de ADR-079 y cubre todos los handlers del evento: pasado ese
 * tiempo el intento se registra como fallido y la cola sigue. El handler abandonado termina solo,
 * acotado por los límites de red y de base.
 */
export async function processOne(now = new Date(), handlerTimeoutMs = 0): Promise<ProcessOutcome> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(outbox)
      .where(
        and(
          isNull(outbox.processedAt),
          isNull(outbox.deadLetterAt),
          lte(outbox.nextAttemptAt, now),
        ),
      )
      .orderBy(asc(outbox.nextAttemptAt), asc(outbox.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) {
      return "idle";
    }
    const attempt = row.attempts + 1;
    const log = logger.child({ job: row.eventType, outboxId: row.id, attempt });
    const handlers = getHandlers(row.eventType);
    // Tras un límite vencido, la cadena abandonada no arranca los handlers que le faltaban.
    let abandoned = false;
    try {
      if (handlers.length === 0) {
        // Un evento de dominio sin suscriptores todavía (ADR-034) se da por procesado: no es un error.
        log.warn("sin handler: evento descartado");
      }
      const runHandlers = async () => {
        for (const handler of handlers) {
          if (abandoned) {
            return;
          }
          await handler(row.payload, { id: row.id, attempt, log });
        }
      };
      await withTimeout(runHandlers(), handlerTimeoutMs, `El evento ${row.eventType}`);
      await tx
        .update(outbox)
        .set({ processedAt: now, attempts: attempt, lastError: null })
        .where(eq(outbox.id, row.id));
      log.debug("procesado");
      return "processed";
    } catch (error) {
      abandoned = true;
      const message = error instanceof Error ? error.message : String(error);
      const dead = isDeadAfter(attempt);
      await tx
        .update(outbox)
        .set({
          attempts: attempt,
          lastError: message.slice(0, 2_000),
          nextAttemptAt: new Date(now.getTime() + backoffFor(attempt)),
          ...(dead ? { deadLetterAt: now } : {}),
        })
        .where(eq(outbox.id, row.id));
      log.warn({ err: error, deadLetter: dead }, "falló");
      return "failed";
    }
  });
}

export interface DrainResult {
  processed: number;
  failed: number;
}

/** Procesa hasta `batchSize` filas listas. */
export async function drain(
  batchSize: number,
  now = new Date(),
  handlerTimeoutMs = 0,
): Promise<DrainResult> {
  const result: DrainResult = { processed: 0, failed: 0 };
  for (let i = 0; i < batchSize; i += 1) {
    const outcome = await processOne(now, handlerTimeoutMs);
    if (outcome === "idle") {
      break;
    }
    result[outcome]++;
  }
  return result;
}

export interface PollerOptions {
  intervalMs: number;
  batchSize: number;
  handlerTimeoutMs: number;
}

export interface Poller {
  stop(): Promise<void>;
}

export function startPoller(options: PollerOptions): Poller {
  let stopped = false;
  let running: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) {
      return;
    }
    try {
      const result = await drain(options.batchSize, new Date(), options.handlerTimeoutMs);
      if (result.processed + result.failed > 0) {
        logger.info(result, "outbox drenado");
      }
    } catch (error) {
      logger.error({ err: error }, "el poller falló");
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          running = tick();
        }, options.intervalMs);
      }
    }
  };

  running = tick();
  logger.info(
    { intervalMs: options.intervalMs, batchSize: options.batchSize },
    "poller del outbox arrancado",
  );

  return {
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
      await running;
    },
  };
}
