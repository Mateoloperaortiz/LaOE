import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { outbox } from "@/modules/system/schema";
import { withTimeout } from "@/shared/lib/timeout";
import { logger } from "@/shared/log";
import { backoffFor, isDeadAfter } from "./backoff";
import { getHandlers } from "./registry";

// Poller del outbox (ADR-012, ADR-021, ADR-118). Un evento se entrega en dos pasos:
//
// 1. La toma: una transacción corta elige la fila vencida con FOR UPDATE SKIP LOCKED, le cuenta el
//    intento, corre su `nextAttemptAt` lo que esperaría un fallo de ese intento y CONFIRMA. Si el proceso
//    muere después, el intento ya está contado y la fila no vuelve de primera.
// 2. La entrega: otra transacción vuelve a bloquear la fila y la sostiene mientras corren los handlers,
//    que trabajan con sus propias conexiones (getDb, runCommand), no dentro de ella. Al final anota el
//    resultado.
//
// Dos pollers nunca procesan la misma fila: mientras corre la protege el bloqueo, como antes, y entre la
// toma y el bloqueo ya no está vencida.
//
// El reloj entra como función (ADR-118 regla 2): cada instante que se escribe (la toma, el fallo, el
// cierre) se lee cuando pasa, no al arrancar el lote.

type Clock = () => Date;

const systemClock: Clock = () => new Date();

export type ProcessOutcome = "idle" | "processed" | "failed";

type OutboxRow = typeof outbox.$inferSelect;

/** Lo que queda escrito en una fila que gastó sus intentos sin que ninguno terminara. */
const UNFINISHED =
  "Gastó sus intentos sin terminar el último: el proceso se detuvo con el evento tomado";

interface Taken {
  row: OutboxRow;
  attempt: number;
  /** Ya había gastado sus intentos: la toma la dejó en dead letter y sus handlers no corren. */
  exhausted: boolean;
}

/**
 * Toma la fila vencida más vieja y confirma: el intento queda contado antes de correr nada (ADR-118
 * regla 1). Una fila que llega acá con todos sus intentos gastados no terminó ninguno, porque un fallo
 * anotado la habría dejado en dead letter: va a dead letter sin volver a correr.
 */
async function take(dueBy: Date, clock: Clock): Promise<Taken | null> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(outbox)
      .where(
        and(
          isNull(outbox.processedAt),
          isNull(outbox.deadLetterAt),
          lte(outbox.nextAttemptAt, dueBy),
        ),
      )
      .orderBy(asc(outbox.nextAttemptAt), asc(outbox.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) {
      return null;
    }
    const takenAt = clock();
    if (isDeadAfter(row.attempts)) {
      const lastError = row.lastError
        ? `${UNFINISHED}. Último error: ${row.lastError}`
        : UNFINISHED;
      await tx
        .update(outbox)
        .set({ deadLetterAt: takenAt, lastError: lastError.slice(0, 2_000) })
        .where(eq(outbox.id, row.id));
      return { row, attempt: row.attempts, exhausted: true };
    }
    const attempt = row.attempts + 1;
    await tx
      .update(outbox)
      .set({
        attempts: attempt,
        nextAttemptAt: new Date(takenAt.getTime() + backoffFor(attempt)),
      })
      .where(eq(outbox.id, row.id));
    return { row, attempt, exhausted: false };
  });
}

/**
 * `handlerTimeoutMs` es el último recurso de ADR-079 y cubre todos los handlers del evento: pasado ese
 * tiempo el intento se registra como fallido y la cola sigue. El handler abandonado termina solo,
 * acotado por los límites de red y de base.
 *
 * `dueBy` es hasta qué instante una fila cuenta como vencida: un lote pasa el de su arranque, para que
 * lo que encolen sus handlers espere al lote siguiente. La espera de un fallo no sale de ahí: se cuenta
 * desde el reloj del fallo (ADR-118 regla 2).
 */
export async function processOne(
  clock: Clock = systemClock,
  handlerTimeoutMs = 0,
  dueBy: Date = clock(),
): Promise<ProcessOutcome> {
  const taken = await take(dueBy, clock);
  if (!taken) {
    return "idle";
  }
  const { row, attempt } = taken;
  const log = logger.child({ job: row.eventType, outboxId: row.id, attempt });
  if (taken.exhausted) {
    log.warn({ deadLetter: true }, "gastó sus intentos sin terminar: no corre más");
    return "failed";
  }
  return getDb().transaction(async (tx) => {
    // El bloqueo de la fila cubre los handlers, como antes de la toma confirmada: otro poller la salta
    // aunque su espera venza mientras corre.
    const [held] = await tx
      .select({ id: outbox.id })
      .from(outbox)
      .where(
        and(
          eq(outbox.id, row.id),
          eq(outbox.attempts, attempt),
          isNull(outbox.processedAt),
          isNull(outbox.deadLetterAt),
        ),
      )
      .for("update");
    if (!held) {
      // Alguien la cerró o la volvió a tomar entre la toma y el bloqueo: este intento ya no es de nadie.
      log.warn("la fila tomada cambió antes de correr: se deja");
      return "idle";
    }
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
        .set({ processedAt: clock(), lastError: null })
        .where(eq(outbox.id, row.id));
      log.debug("procesado");
      return "processed";
    } catch (error) {
      abandoned = true;
      const message = error instanceof Error ? error.message : String(error);
      const dead = isDeadAfter(attempt);
      // El handler pudo tardar hasta su límite: la espera corre desde ahora, no desde la toma.
      const failedAt = clock();
      await tx
        .update(outbox)
        .set({
          lastError: message.slice(0, 2_000),
          nextAttemptAt: new Date(failedAt.getTime() + backoffFor(attempt)),
          ...(dead ? { deadLetterAt: failedAt } : {}),
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

/** Procesa hasta `batchSize` filas que ya estaban vencidas cuando arrancó el lote. */
export async function drain(
  batchSize: number,
  clock: Clock = systemClock,
  handlerTimeoutMs = 0,
): Promise<DrainResult> {
  const result: DrainResult = { processed: 0, failed: 0 };
  const dueBy = clock();
  for (let i = 0; i < batchSize; i += 1) {
    const outcome = await processOne(clock, handlerTimeoutMs, dueBy);
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
      const result = await drain(options.batchSize, systemClock, options.handlerTimeoutMs);
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
