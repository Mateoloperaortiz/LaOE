import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "@/db/tx";
import type { PushOutcome } from "@/shared/adapters/pusher";
import { message, pushDelivery, pushSubscription } from "../schema";
import { type MessageInsert, recordMessage } from "./messages";
import { isKnownPushEndpoint } from "./push-endpoint-pure";
import type { SubscriptionRecord } from "./subscriptions";

// Checkpoint del bus (ADR-144). Cada reserva y dispositivo usan la conexión de unlessAnonymized:
// nunca se pide otra del pool mientras se retiene a la persona. Cada dispositivo confirma aparte.

export async function lockPushNotification(
  tx: Tx,
  personId: string,
  dedupeKey: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["push", personId, dedupeKey])}, 0))`,
  );
}

export async function reservePushDeliveries(
  tx: Tx,
  input: MessageInsert & { dedupeKey: string },
  subscriptionIds: string[],
) {
  const [existing] = await tx
    .select({ id: message.id, channel: message.channel, status: message.status })
    .from(message)
    .where(and(eq(message.personId, input.personId), eq(message.dedupeKey, input.dedupeKey)));
  if (existing && existing.channel !== "PUSH") {
    throw new Error("No se pudo reservar el registro del push");
  }
  const previous = existing
    ? await tx.select().from(pushDelivery).where(eq(pushDelivery.messageId, existing.id))
    : [];
  if (existing && (previous.length > 0 || existing.status === "SENT")) {
    return { messageId: existing.id, deliveries: previous };
  }
  // El dispositivo puede desaparecer mientras el aviso espera su turno. La reserva toma sus claves
  // antes de crear las referencias: no convierte ese retiro en un fallo de FK ni sigue el endpoint.
  const devices = await tx
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(
      and(
        eq(pushSubscription.personId, input.personId),
        inArray(pushSubscription.id, subscriptionIds),
      ),
    )
    .orderBy(asc(pushSubscription.id))
    .for("key share");
  if (devices.length === 0) return null;
  const messageId = existing?.id ?? (await recordMessage(input, tx));
  if (!messageId) throw new Error("No se pudo reservar el registro del push");
  const currentIds = new Set(devices.map((device) => device.id));
  const deliveries = await tx
    .insert(pushDelivery)
    .values(
      subscriptionIds
        .filter((id) => currentIds.has(id))
        .map((subscriptionId) => ({ messageId, subscriptionId })),
    )
    .returning();
  return { messageId, deliveries };
}

function canRetry(outcome: Extract<PushOutcome, { ok: false }>): boolean {
  return (
    !outcome.gone &&
    (outcome.statusCode === null ||
      outcome.statusCode === 408 ||
      outcome.statusCode === 429 ||
      (outcome.statusCode >= 500 && outcome.statusCode <= 599))
  );
}

/** El motivo que queda en el registro: el código del servicio adelante, si respondió. */
function failureText(outcome: Extract<PushOutcome, { ok: false }>): string {
  return outcome.statusCode === null
    ? outcome.error
    : `HTTP ${outcome.statusCode}: ${outcome.error}`;
}

/** Relee el recibo y su dispositivo con el candado del aviso tomado; solo envía lo todavía pendiente. */
export async function sendPushDelivery(
  tx: Tx,
  personId: string,
  messageId: string,
  deliveryId: string,
  send: (device: SubscriptionRecord) => Promise<PushOutcome>,
  now: Date,
) {
  const [receipt] = await tx
    .select()
    .from(pushDelivery)
    .where(and(eq(pushDelivery.id, deliveryId), eq(pushDelivery.messageId, messageId)));
  if (!receipt?.retryable || !receipt.subscriptionId) return null;
  // En exclusiva desde la lectura: dos avisos que reciban 410 no convierten sendos candados
  // compartidos en dos borrados que se esperan entre sí. El retiro espera solo al envío en curso.
  // Un endpoint retirado y registrado por otra persona nunca se sigue por su texto.
  const [device] = await tx
    .select()
    .from(pushSubscription)
    .where(
      and(eq(pushSubscription.id, receipt.subscriptionId), eq(pushSubscription.personId, personId)),
    )
    .for("update");
  if (!device || !isKnownPushEndpoint(device.endpoint)) return null;
  let outcome: PushOutcome;
  try {
    outcome = await send(device);
  } catch {
    outcome = {
      ok: false,
      gone: false,
      statusCode: null,
      error: "Sin respuesta del servicio de push",
    };
  }
  const retryable = !outcome.ok && canRetry(outcome);
  await tx
    .update(pushDelivery)
    .set({
      status: outcome.ok ? "SENT" : "FAILED",
      retryable,
      error: outcome.ok ? null : failureText(outcome),
      sentAt: outcome.ok ? now : null,
    })
    .where(eq(pushDelivery.id, deliveryId));
  const deliveries = await tx
    .select({ sentAt: pushDelivery.sentAt })
    .from(pushDelivery)
    .where(eq(pushDelivery.messageId, messageId));
  const sentAt = deliveries
    .flatMap((row) => (row.sentAt ? [row.sentAt] : []))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  await tx
    .update(message)
    .set({
      status: sentAt ? "SENT" : "FAILED",
      error: sentAt || outcome.ok ? null : failureText(outcome),
      sentAt: sentAt ?? null,
    })
    .where(eq(message.id, messageId));
  // Resultado y limpieza confirman juntos: un fallo posterior no deja un 410 definitivo sin retirar.
  const removed =
    !outcome.ok && outcome.gone
      ? (
          await tx
            .delete(pushSubscription)
            .where(eq(pushSubscription.id, device.id))
            .returning({ id: pushSubscription.id })
        ).length
      : 0;
  return { outcome, retryable, removed };
}
