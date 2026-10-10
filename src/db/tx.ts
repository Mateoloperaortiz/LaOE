import { sql } from "drizzle-orm";
import { auditLog, outbox } from "@/modules/system/schema";
import { type Db, getDb } from "./client";

// Un comando es una transacción con la mutación, su auditoría y sus eventos de dominio
// (ADR-012). Si algo falla, no queda nada: ni mutación, ni auditoría, ni evento.

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Base o transacción: lo que reciben los comandos del dominio. */
export type Executor = Db | Tx;

/**
 * Quién ejecuta el comando y desde qué IP. `personId` nulo es el sistema (jobs, scripts). La IP es
 * obligatoria (ADR-121 regla 1): quien arma un actor dice de dónde la saca, o escribe `null` porque no
 * hay request (un trabajo, un script) o porque esa auditoría va sin IP a propósito.
 */
export interface Actor {
  personId: string | null;
  ip: string | null;
}

export const SYSTEM_ACTOR: Actor = { personId: null, ip: null };

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export interface DomainEvent {
  type: string;
  payload: Record<string, unknown>;
  /** Con clave, un evento pendiente igual no se duplica. */
  dedupeKey?: string;
}

export interface CommandContext {
  tx: Tx;
  actor: Actor;
  audit(entry: AuditEntry): Promise<void>;
  emit(event: DomainEvent): Promise<void>;
}

/**
 * Encola un evento de dominio; con dedupeKey no duplica un pendiente igual. `nextAttemptAt` se
 * estampa con el reloj de la app, el mismo que usa el poller: si el reloj de Postgres va unos
 * milisegundos adelante (pasa en OrbStack), la fila no queda "todavía no vencida" al encolarla.
 */
export async function enqueueEvent(
  exec: Executor,
  event: DomainEvent,
  now = new Date(),
): Promise<void> {
  const insert = exec.insert(outbox).values({
    eventType: event.type,
    payload: event.payload,
    dedupeKey: event.dedupeKey ?? null,
    nextAttemptAt: now,
  });
  if (event.dedupeKey === undefined) {
    await insert;
    return;
  }
  await insert.onConflictDoNothing({
    target: outbox.dedupeKey,
    where: sql`${outbox.processedAt} is null and ${outbox.deadLetterAt} is null`,
  });
}

export async function runCommand<T>(
  actor: Actor,
  command: (ctx: CommandContext) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    const ctx: CommandContext = {
      tx,
      actor,
      async audit(entry) {
        await tx.insert(auditLog).values({
          actorId: actor.personId,
          ip: actor.ip,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: entry.before ?? null,
          after: entry.after ?? null,
        });
      },
      async emit(event) {
        await enqueueEvent(tx, event);
      },
    };
    return command(ctx);
  });
}
