import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, runCommand } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { pushSubscription } from "../schema";
import { isKnownPushEndpoint, MAX_DEVICES_PER_PERSON } from "./push-endpoint-pure";

// Suscripciones push (ADR-038 regla 5, ADR-113 regla 6): un dispositivo por endpoint, solo de un
// servicio de push conocido y hasta diez por persona. Registrar el propio lo actualiza; el de otra
// persona no se reasigna. Se borra al quitar, al responder 404/410 o al salir.

export const subscriptionInputSchema = z.object({
  endpoint: z.url().max(2000).refine(isKnownPushEndpoint),
  keys: z.object({
    p256dh: z.string().min(16).max(512),
    auth: z.string().min(8).max(256),
  }),
});

export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;

export interface SubscriptionView {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface SubscriptionRecord {
  id: string;
  personId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** El endpoint ya es de otra persona y no se reasigna (ADR-113 regla 6); la ruta responde 409. */
export class SubscriptionTakenError extends DomainError {
  constructor() {
    super(t("T-3208"), "endpoint");
    this.name = "SubscriptionTakenError";
  }
}

/**
 * Registra el dispositivo del actor. Vuelve a validar el endpoint (no confía en la ruta), y dentro de
 * la transacción comprueba de quién es y cuántos tiene la persona, bajo un candado por persona: dos
 * registros simultáneos hacen fila y el tope no se pasa.
 */
export async function saveSubscriptionAs(
  actor: Actor,
  input: SubscriptionInput,
  userAgent: string | null,
  now = new Date(),
): Promise<{ id: string; created: boolean }> {
  const personId = actor.personId;
  if (!personId) {
    throw new Error("Sin persona");
  }
  const parsed = subscriptionInputSchema.parse(input);
  return runCommand(actor, async (ctx) => {
    await ctx.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`push-subscription:${personId}`}, 0))`,
    );
    const [existing] = await ctx.tx
      .select({ id: pushSubscription.id, personId: pushSubscription.personId })
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, parsed.endpoint))
      .limit(1);
    if (existing) {
      if (existing.personId !== personId) {
        throw new SubscriptionTakenError();
      }
      await ctx.tx
        .update(pushSubscription)
        .set({
          p256dh: parsed.keys.p256dh,
          auth: parsed.keys.auth,
          userAgent,
          lastSeenAt: now,
        })
        .where(eq(pushSubscription.id, existing.id));
      return { id: existing.id, created: false };
    }
    const [devices] = await ctx.tx
      .select({ n: count() })
      .from(pushSubscription)
      .where(eq(pushSubscription.personId, personId));
    // Sin cuenta no se registra: el tope falla cerrado.
    if (!devices || devices.n >= MAX_DEVICES_PER_PERSON) {
      throw new DomainError(t("T-3209"), "endpoint");
    }
    const [row] = await ctx.tx
      .insert(pushSubscription)
      .values({
        personId,
        endpoint: parsed.endpoint,
        p256dh: parsed.keys.p256dh,
        auth: parsed.keys.auth,
        userAgent,
        lastSeenAt: now,
      })
      .onConflictDoNothing({ target: pushSubscription.endpoint })
      .returning({ id: pushSubscription.id });
    if (!row) {
      // Otra persona lo registró entre la lectura y el guardado: el índice único decide.
      throw new SubscriptionTakenError();
    }
    await ctx.audit({
      action: "push-subscription.created",
      entityType: "push_subscription",
      entityId: row.id,
      after: { userAgent },
    });
    return { id: row.id, created: true };
  });
}

/** La persona quita uno de sus dispositivos (por endpoint o por id). */
export async function removeSubscriptionAs(
  actor: Actor,
  selector: { endpoint?: string; id?: string },
): Promise<boolean> {
  const personId = actor.personId;
  if (!personId) {
    throw new Error("Sin persona");
  }
  return runCommand(actor, async (ctx) => {
    const condition = selector.id
      ? and(eq(pushSubscription.id, selector.id), eq(pushSubscription.personId, personId))
      : selector.endpoint
        ? and(
            eq(pushSubscription.endpoint, selector.endpoint),
            eq(pushSubscription.personId, personId),
          )
        : null;
    if (!condition) {
      return false;
    }
    const rows = await ctx.tx
      .delete(pushSubscription)
      .where(condition)
      .returning({ id: pushSubscription.id });
    for (const row of rows) {
      await ctx.audit({
        action: "push-subscription.removed",
        entityType: "push_subscription",
        entityId: row.id,
      });
    }
    return rows.length > 0;
  });
}

export async function listSubscriptionsFor(personId: string): Promise<SubscriptionView[]> {
  return getDb()
    .select({
      id: pushSubscription.id,
      endpoint: pushSubscription.endpoint,
      userAgent: pushSubscription.userAgent,
      createdAt: pushSubscription.createdAt,
      lastSeenAt: pushSubscription.lastSeenAt,
    })
    .from(pushSubscription)
    .where(eq(pushSubscription.personId, personId))
    .orderBy(desc(pushSubscription.lastSeenAt), asc(pushSubscription.createdAt));
}

export async function countSubscriptionsFor(personId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(pushSubscription)
    .where(eq(pushSubscription.personId, personId));
  return row?.n ?? 0;
}

/** Cantidad de dispositivos y último uso, para la Persona 360. */
export async function subscriptionSummaryFor(
  personId: string,
): Promise<{ devices: number; lastSeenAt: Date | null }> {
  const [row] = await getDb()
    .select({ n: count(), last: max(pushSubscription.lastSeenAt) })
    .from(pushSubscription)
    .where(eq(pushSubscription.personId, personId));
  return { devices: row?.n ?? 0, lastSeenAt: row?.last ?? null };
}

/** Suscripciones de varias personas, para el bus. */
export async function listSubscriptionsForPeople(
  personIds: string[],
): Promise<Map<string, SubscriptionRecord[]>> {
  const result = new Map<string, SubscriptionRecord[]>();
  if (personIds.length === 0) {
    return result;
  }
  const rows = await getDb()
    .select({
      id: pushSubscription.id,
      personId: pushSubscription.personId,
      endpoint: pushSubscription.endpoint,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth,
    })
    .from(pushSubscription)
    .where(inArray(pushSubscription.personId, personIds));
  for (const row of rows) {
    const list = result.get(row.personId) ?? [];
    list.push(row);
    result.set(row.personId, list);
  }
  return result;
}

/** Borra las suscripciones cuyo servicio respondió 404 o 410: el dispositivo ya no existe. */
export async function deleteSubscriptionsByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) {
    return 0;
  }
  const rows = await getDb()
    .delete(pushSubscription)
    .where(inArray(pushSubscription.id, ids))
    .returning({ id: pushSubscription.id });
  return rows.length;
}

/** Al salir de la OE o anonimizarse (ADR-030). */
export async function deleteSubscriptionsFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(pushSubscription)
    .where(eq(pushSubscription.personId, personId))
    .returning({ id: pushSubscription.id });
  return rows.length;
}
