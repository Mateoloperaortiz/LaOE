import { and, asc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { Tx } from "@/db/tx";
import { OUTBOX_PENDING_KEY_INDEX, outbox } from "@/modules/system/schema";
import { withTimeout } from "@/shared/lib/timeout";
import { logger, withoutQueryValues } from "@/shared/log";
import { backoffFor, isDeadAfter } from "./backoff";
import { getHandlers } from "./registry";

// Poller del outbox (ADR-012, ADR-021, ADR-118). Un evento se entrega en dos pasos:
//
// 1. La toma: una transacción corta elige la fila vencida con FOR UPDATE SKIP LOCKED, le cuenta el
//    intento, corre su `nextAttemptAt` lo que esperaría un fallo de ese intento, le quita la clave de
//    deduplicación y CONFIRMA. Si el proceso muere después, el intento ya está contado y la fila no
//    vuelve de primera. Sin la clave, un emit que llegue mientras corre entra como evento nuevo. La
//    clave queda guardada en `takenDedupeKey`: si el proceso muere con la fila tomada, el arranque
//    siguiente se la devuelve (`restoreTakenKeys`) y el emit que venga se descarta contra ella. Si el
//    emit llegó antes y ya ocupa la clave, ese pendiente hereda los intentos y la espera de la fila que
//    murió, que queda atendida: de una clave nunca quedan dos cuentas de intentos.
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

/**
 * Lo que queda escrito en una fila que llega a la toma con sus intentos gastados. Pueden no ser suyos:
 * un pendiente hereda los de otra fila de su clave que murió tomada (`restoreTakenKeys`), y puede ir a
 * dead letter sin haber corrido nunca.
 */
const UNFINISHED =
  "Gastó sus intentos, propios o heredados de otro evento de su clave, sin terminar el último: el proceso se detuvo con ese intento en curso";

/** Cuántas veces vuelve a intentar un arranque con una clave cuyo ocupante cambia en ese instante. */
const RESTORE_ROUNDS = 3;

interface Taken {
  row: OutboxRow;
  /** La clave de deduplicación de la fila: la que traía o la que quedó guardada de una toma anterior. */
  key: string | null;
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
    // Si un intento anterior no alcanzó a devolverla, la clave es la que quedó guardada.
    const key = row.dedupeKey ?? row.takenDedupeKey;
    if (isDeadAfter(row.attempts)) {
      const lastError = row.lastError
        ? `${UNFINISHED}. Último error: ${row.lastError}`
        : UNFINISHED;
      await tx
        .update(outbox)
        .set({
          deadLetterAt: takenAt,
          lastError: lastError.slice(0, 2_000),
          // En dead letter no choca con ningún pendiente, y es lo que mira quien la reintenta.
          dedupeKey: key,
          takenDedupeKey: null,
        })
        .where(eq(outbox.id, row.id));
      return { row, key, attempt: row.attempts, exhausted: true };
    }
    const attempt = row.attempts + 1;
    await tx
      .update(outbox)
      .set({
        attempts: attempt,
        nextAttemptAt: new Date(takenAt.getTime() + backoffFor(attempt)),
        // La clave deduplica lo que está en cola, y esta fila ya no lo está: el handler puede haber leído
        // antes del cambio que trae el emit siguiente (ADR-118 regla 3). Queda guardada en la fila para
        // devolverla al terminar, al fallar o, si el proceso muere antes, al arrancar.
        dedupeKey: null,
        takenDedupeKey: key,
      })
      .where(eq(outbox.id, row.id));
    return { row, key, attempt, exhausted: false };
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
  const { row, key, attempt } = taken;
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
          // Tomada va sin clave. Si la tiene, un proceso que arrancaba se la devolvió en este instante.
          isNull(outbox.dedupeKey),
        ),
      )
      .for("update");
    if (!held) {
      // Alguien la cerró, la volvió a tomar o le devolvió su clave entre la toma y el bloqueo: este
      // intento ya no es de nadie, y la fila espera su reintento.
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
        .set({ processedAt: clock(), lastError: null, dedupeKey: key, takenDedupeKey: null })
        .where(eq(outbox.id, row.id));
      log.debug("procesado");
      return "processed";
    } catch (error) {
      abandoned = true;
      // Lo que se guarda pasa por el recorte del registro: sin los valores de la consulta que falló,
      // que quedarían en la base y a la vista en /admin/sistema/jobs (ADR-119 regla 16).
      const message =
        error instanceof Error ? withoutQueryValues(error, error.message) : String(error);
      const dead = isDeadAfter(attempt);
      // El handler pudo tardar hasta su límite: la espera corre desde ahora, no desde la toma.
      const failedAt = clock();
      const keyBack = await recordFailure(tx, row.id, key, {
        lastError: message.slice(0, 2_000),
        nextAttemptAt: new Date(failedAt.getTime() + backoffFor(attempt)),
        ...(dead ? { deadLetterAt: failedAt } : {}),
      });
      log.warn({ err: error, deadLetter: dead, keyBack }, "falló");
      return "failed";
    }
  });
}

/**
 * Anota el fallo y le devuelve a la fila su clave de deduplicación: mientras espera el reintento vuelve
 * a ser el único pendiente de su clave. Si otro pendiente la ocupó mientras corría, la fila queda sin
 * clave y reintenta por su cuenta; devuelve si la recuperó. Lo decide el índice único y no una lectura
 * previa, porque el emit puede estar confirmándose en este instante, y va en un savepoint para que su
 * rechazo no aborte la transacción de la entrega. Una fila que va a dead letter nunca choca.
 */
async function recordFailure(
  tx: Tx,
  id: string,
  key: string | null,
  failure: Pick<OutboxRow, "lastError" | "nextAttemptAt"> & { deadLetterAt?: Date },
): Promise<boolean> {
  try {
    await tx.transaction((savepoint) =>
      savepoint
        .update(outbox)
        .set({ ...failure, dedupeKey: key, takenDedupeKey: null })
        .where(eq(outbox.id, id)),
    );
    return true;
  } catch (error) {
    if (!isUniqueViolation(error, OUTBOX_PENDING_KEY_INDEX)) {
      throw error;
    }
    // Sigue sin clave y la conserva guardada: la recupera en otro intento. En un arranque la recupera
    // o, si sigue ocupada, queda atendida por el pendiente que la ocupa (`restoreTakenKeys`).
    await tx.update(outbox).set(failure).where(eq(outbox.id, id));
    return false;
  }
}

/**
 * Atiende las filas que quedaron tomadas sin nadie que las corra (ADR-118 regla 3): el proceso murió con
 * el evento tomado, o el evento falló con su clave ocupada, y la fila espera su reintento sin clave.
 * Corre al arrancar el poller.
 *
 * - Si la clave está libre, se la devuelve. Sin esto el emit siguiente de esa clave entra como evento
 *   nuevo, vencido de inmediato y con sus cinco intentos, y un evento que tumba el proceso lo vuelve a
 *   tumbar con cada emit.
 * - Si otro pendiente ya la ocupa, ese pendiente hereda sus intentos y su espera y la fila se da por
 *   atendida (`supersede`). Es el emit que llegó con el evento en curso: sin esto es justo ese evento
 *   nuevo y vencido, y el proceso cae otra vez en cada arranque mientras haya actividad.
 *
 * La fila que otro poller está corriendo tiene su bloqueo y se salta. Van en orden fijo, de la más
 * vieja a la más nueva: de dos con la misma clave y ningún pendiente, la más vieja la recupera y
 * hereda de la otra. Devuelve cuántas recuperaron su clave y cuántas quedaron atendidas por otra.
 */
export async function restoreTakenKeys(
  clock: Clock = systemClock,
): Promise<{ restored: number; superseded: number }> {
  const orphaned = and(
    isNotNull(outbox.takenDedupeKey),
    isNull(outbox.dedupeKey),
    isNull(outbox.processedAt),
    isNull(outbox.deadLetterAt),
  );
  const candidates = await getDb()
    .select({ id: outbox.id })
    .from(outbox)
    .where(orphaned)
    .orderBy(asc(outbox.createdAt), asc(outbox.id));
  const result = { restored: 0, superseded: 0 };
  for (const { id } of candidates) {
    const outcome = await getDb().transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(outbox)
        .where(and(eq(outbox.id, id), orphaned))
        .for("update", { skipLocked: true });
      const key = row?.takenDedupeKey;
      if (!row || !key) {
        return null;
      }
      // Que la clave está ocupada lo decide el índice, y quién la ocupa puede cambiar entre su rechazo
      // y el bloqueo del ocupante: si otro poller lo tomó en ese instante, la clave quedó libre y se
      // vuelve a intentar devolverla. Acotado: lo que no se resuelva espera al arranque siguiente.
      for (let round = 0; round < RESTORE_ROUNDS; round += 1) {
        if (await giveKeyBack(tx, id, key)) {
          return { restored: true as const };
        }
        const heirId = await supersede(tx, row, key, clock());
        if (heirId) {
          return { restored: false as const, heirId, job: row.eventType, attempts: row.attempts };
        }
      }
      return null;
    });
    if (outcome?.restored) {
      result.restored += 1;
    } else if (outcome) {
      result.superseded += 1;
      // Con los dos ids alcanza para seguirle el rastro en /admin/sistema/jobs; nada del payload.
      logger.warn(
        {
          job: outcome.job,
          outboxId: id,
          supersededBy: outcome.heirId,
          attempts: outcome.attempts,
        },
        "evento tomado sin dueño dado por atendido: el pendiente de su clave hereda sus intentos y su espera",
      );
    }
  }
  return result;
}

/**
 * Le devuelve su clave a una fila tomada, o responde `false` si otro pendiente ya la ocupa. Lo decide
 * el índice único y no una lectura previa, dentro de un savepoint para que su rechazo no aborte la
 * transacción.
 */
async function giveKeyBack(tx: Tx, id: string, key: string): Promise<boolean> {
  try {
    await tx.transaction((savepoint) =>
      savepoint
        .update(outbox)
        .set({ dedupeKey: key, takenDedupeKey: null })
        .where(eq(outbox.id, id)),
    );
    return true;
  } catch (error) {
    if (!isUniqueViolation(error, OUTBOX_PENDING_KEY_INDEX)) {
      throw error;
    }
    return false;
  }
}

/**
 * La clave de una fila sin dueño ya la ocupa otro pendiente. Dos eventos de un mismo tipo y una misma
 * clave valen el uno por el otro (el outbox descarta el segundo cuando el primero está en cola, y acá
 * el más nuevo cubre al más viejo), así que el pendiente hace también el trabajo de la fila: hereda
 * sus intentos y su espera, el mayor de los dos intentos y la más tardía de las dos esperas, y la fila
 * se da por atendida con su clave, como el dead letter que se reintenta con la clave ocupada (ADR-113
 * regla 8). Con la cuenta heredada, un evento con clave que tumba el proceso gasta sus cinco intentos
 * aunque en cada corrida llegue un emit (ADR-118 regla 1).
 *
 * Bloquea al pendiente antes de escribirle y devuelve su id. Responde `null` si ya no está en cola
 * (otro poller lo tomó, y con eso la clave quedó libre) o si es de otro tipo de evento: ahí la fila
 * sigue sin clave y reintenta por su cuenta, como la que falla con su clave ocupada.
 */
async function supersede(
  tx: Tx,
  orphan: OutboxRow,
  key: string,
  now: Date,
): Promise<string | null> {
  const [heir] = await tx
    .select({ id: outbox.id })
    .from(outbox)
    .where(
      and(
        eq(outbox.dedupeKey, key),
        // Solo vale por la fila un evento de su mismo tipo: los handlers de otro no hacen su trabajo.
        eq(outbox.eventType, orphan.eventType),
        isNull(outbox.processedAt),
        isNull(outbox.deadLetterAt),
      ),
    )
    .for("update");
  if (!heir) {
    return null;
  }
  await tx
    .update(outbox)
    .set({
      attempts: sql`greatest(${outbox.attempts}, ${orphan.attempts})`,
      nextAttemptAt: sql`greatest(${outbox.nextAttemptAt}, ${orphan.nextAttemptAt.toISOString()}::timestamptz)`,
    })
    .where(eq(outbox.id, heir.id));
  // Sale de la cola sin correr: conserva sus intentos y, como todo lo procesado, queda sin error.
  await tx
    .update(outbox)
    .set({ processedAt: now, lastError: null, dedupeKey: key, takenDedupeKey: null })
    .where(eq(outbox.id, orphan.id));
  return heir.id;
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

  const start = async () => {
    try {
      const { restored, superseded } = await restoreTakenKeys();
      if (restored + superseded > 0) {
        logger.warn(
          { restored, superseded },
          "eventos que quedaron tomados: claves devueltas o trabajo heredado por otro pendiente",
        );
      }
    } catch (error) {
      logger.error({ err: error }, "no se pudieron atender los eventos que quedaron tomados");
    }
    await tick();
  };

  running = start();
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
