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
import {
  type NotificationRequested,
  notificationExpired,
  notificationRequestedSchema,
  shouldDeliver,
} from "./pure";
import { isKnownPushEndpoint } from "./push-endpoint-pure";
import {
  deleteSubscriptionsByIds,
  listSubscriptionsForPeople,
  type SubscriptionRecord,
} from "./subscriptions";
import { unlessAnonymized } from "./unless-anonymized";

// Entrega del bus de notificaciones (ADR-038 regla 2): descarta a quienes ya recibieron esa clave,
// aplica la preferencia del tipo, empuja a cada dispositivo de un servicio de push conocido (ADR-113
// regla 6), borra los que ya no existen y registra un `message` por persona, con esa persona retenida
// mientras tanto (ADR-119 regla 11). Sin VAPID el proveedor es `console`, como el mailer de consola.

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
      // El servicio, no el endpoint: completo es la credencial del dispositivo (ADR-118 regla 25).
      logger.info(
        { push: { host: hostOf(subscription.endpoint), ...buildPushPayload(payload) } },
        "push (consola)",
      );
      return { ok: true, statusCode: 200 };
    },
  };
}

/** Solo el host: el endpoint completo es la credencial del dispositivo. */
function hostOf(endpoint: string): string {
  return URL.canParse(endpoint) ? new URL(endpoint).host : "ilegible";
}

/** La clave de `deviceFailures` para un servicio de push que no respondió. */
const NO_RESPONSE = "sin respuesta";

export interface DeliveryStats {
  sent: number;
  failed: number;
  alreadySent: number;
  skippedByPreference: number;
  withoutDevice: number;
  removedDevices: number;
  /**
   * Destinatarios de un aviso que ya había vencido cuando tocó entregarlo (ADR-122 regla 9): no se les
   * envía ni se les registra un `message`.
   */
  expired: number;
  /**
   * Dispositivos que no recibieron el aviso, contados por el código con que respondió el servicio de
   * push (`sin respuesta` si no contestó). Es lo que va al registro: nunca el endpoint ni las claves.
   */
  deviceFailures: Record<string, number>;
}

/** El motivo que queda en `message.error`: el código del servicio adelante, si respondió. */
function failureText(outcome: Extract<PushOutcome, { ok: false }>): string {
  return outcome.statusCode === null
    ? outcome.error
    : `HTTP ${outcome.statusCode}: ${outcome.error}`;
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
    expired: 0,
    deviceFailures: {},
  };
  // Un aviso con vencimiento no sale desde ese instante (ADR-122 regla 9): la cola pudo atrasarse o el
  // evento reintentarse, y avisar de lo que ya empezó confunde. No lee a nadie ni deja `message`: no
  // hubo envío que registrar, y el rastro lo deja quien llama. Se mira una vez, acá: un pedido que
  // arranca a tiempo termina de enviarse aunque el instante llegue a mitad del recorrido.
  if (notificationExpired(request.expiresAt, now)) {
    stats.expired = request.recipients.length;
    return stats;
  }
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
    const stored = subscriptions.get(personId) ?? [];
    // La casa solo le escribe a un servicio de push conocido, también al enviar: una fila guardada
    // antes de esa regla puede traer cualquier dirección. No se le envía ni cuenta como dispositivo;
    // se queda, porque no enviar se deshace sumando el servicio a la lista y borrar no.
    const devices = stored.filter((device) => isKnownPushEndpoint(device.endpoint));
    if (devices.length < stored.length) {
      const hosts = stored
        .filter((device) => !devices.includes(device))
        .map((device) => hostOf(device.endpoint));
      logger.warn({ personId, hosts }, "push: dispositivo fuera de PUSH_SERVICES, no se le envía");
    }
    if (devices.length === 0) {
      stats.withoutDevice += 1;
      continue;
    }
    const payload: PushPayload = recipient.url
      ? { ...payloadBase, url: recipient.url }
      : payloadBase;
    // La persona queda retenida mientras salen sus push y se escribe su registro, y solo ella: un
    // aviso a muchos retiene de a una (ADR-119 regla 11). Si ya fue anonimizada no se le envía.
    const sent = await unlessAnonymized(personId, async () => {
      let delivered = 0;
      let lastError: string | null = null;
      for (const device of devices) {
        const outcome = await provider.send(device, payload);
        if (outcome.ok) {
          delivered += 1;
        } else {
          lastError = failureText(outcome);
          const key = outcome.statusCode === null ? NO_RESPONSE : String(outcome.statusCode);
          stats.deviceFailures[key] = (stats.deviceFailures[key] ?? 0) + 1;
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
      return ok;
    });
    if (sent === null) {
      // Anonimizada entre la lectura de sus dispositivos y su turno: su limpieza se los lleva, así
      // que cuenta como quien ya no tiene dónde recibirlo.
      stats.withoutDevice += 1;
    } else if (sent) {
      stats.sent += 1;
    } else {
      stats.failed += 1;
    }
  }
  stats.removedDevices = await deleteSubscriptionsByIds(gone);
  return stats;
}
