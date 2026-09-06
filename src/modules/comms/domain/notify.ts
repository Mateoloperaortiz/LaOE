import {
  buildPushPayload,
  isPushConfigured,
  type PushOutcome,
  type PushPayload,
  sendPush,
} from "@/shared/adapters/pusher";
import { logger } from "@/shared/log";
import { listAlreadyNotified, recordMessage } from "./messages";
import { listPreferencesFor } from "./preferences";
import { type NotificationRequested, notificationRequestedSchema, shouldDeliver } from "./pure";
import {
  deleteSubscriptionsByIds,
  listSubscriptionsForPeople,
  type SubscriptionRecord,
} from "./subscriptions";

// Entrega del bus de notificaciones (ADR-038 regla 2): descarta a quienes ya recibieron esa clave,
// aplica la preferencia del tipo, empuja a cada dispositivo, borra los que ya no existen y registra un
// `message` por persona. Sin VAPID el proveedor es `console`, como el mailer de consola.

export type PushSender = (
  subscription: SubscriptionRecord,
  payload: PushPayload,
) => Promise<PushOutcome>;

interface PushProvider {
  name: "webpush" | "console";
  send: PushSender;
}

let senderOverride: PushSender | undefined;

/** Solo para pruebas: reemplaza el envío real (undefined vuelve al del entorno). */
export function setPushSenderForTests(sender: PushSender | undefined): void {
  senderOverride = sender;
}

function resolveProvider(): PushProvider {
  if (senderOverride) {
    return { name: "webpush", send: senderOverride };
  }
  if (isPushConfigured()) {
    return {
      name: "webpush",
      send: (subscription, payload) =>
        sendPush(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        ),
    };
  }
  return {
    name: "console",
    send: async (subscription, payload) => {
      logger.info(
        { push: { endpoint: subscription.endpoint, ...buildPushPayload(payload) } },
        "push (consola)",
      );
      return { ok: true, statusCode: 200 };
    },
  };
}

export interface DeliveryStats {
  sent: number;
  failed: number;
  alreadySent: number;
  skippedByPreference: number;
  withoutDevice: number;
  removedDevices: number;
}

export async function deliverNotification(raw: unknown, now = new Date()): Promise<DeliveryStats> {
  const request: NotificationRequested = notificationRequestedSchema.parse(raw);
  const stats: DeliveryStats = {
    sent: 0,
    failed: 0,
    alreadySent: 0,
    skippedByPreference: 0,
    withoutDevice: 0,
    removedDevices: 0,
  };
  const personIds = [...new Set(request.recipients.map((item) => item.personId))];
  const [already, preferences, subscriptions] = await Promise.all([
    listAlreadyNotified(personIds, request.dedupeKey),
    listPreferencesFor(personIds),
    listSubscriptionsForPeople(personIds),
  ]);
  const provider = resolveProvider();
  const gone: string[] = [];
  const payloadBase = buildPushPayload({
    title: request.title,
    body: request.body,
    url: request.url,
    ...(request.tag ? { tag: request.tag } : {}),
  });

  for (const recipient of request.recipients) {
    const personId = recipient.personId;
    if (already.has(personId)) {
      stats.alreadySent += 1;
      continue;
    }
    already.add(personId);
    const flags = preferences.get(personId);
    if (flags && !shouldDeliver(request.kind, flags)) {
      stats.skippedByPreference += 1;
      continue;
    }
    const devices = subscriptions.get(personId) ?? [];
    if (devices.length === 0) {
      stats.withoutDevice += 1;
      continue;
    }
    const payload: PushPayload = recipient.url
      ? { ...payloadBase, url: recipient.url }
      : payloadBase;
    let delivered = 0;
    let lastError: string | null = null;
    for (const device of devices) {
      const outcome = await provider.send(device, payload);
      if (outcome.ok) {
        delivered += 1;
      } else {
        lastError = outcome.error;
        if (outcome.gone) {
          gone.push(device.id);
        }
      }
    }
    const ok = delivered > 0;
    await recordMessage({
      personId,
      channel: "PUSH",
      kind: request.kind === "TRANSACTIONAL" ? "TRANSACTIONAL" : request.kind,
      subject: payload.title,
      status: ok ? "SENT" : "FAILED",
      provider: provider.name,
      error: ok ? null : lastError,
      dedupeKey: request.dedupeKey,
      sentAt: ok ? now : null,
    });
    if (ok) {
      stats.sent += 1;
    } else {
      stats.failed += 1;
    }
  }
  stats.removedDevices = await deleteSubscriptionsByIds(gone);
  return stats;
}
