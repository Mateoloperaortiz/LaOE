import { getDb } from "@/db/client";
import { campaignStart, notificationRequested } from "@/domain-events/comms";
import { announcementPushRequested } from "@/domain-events/content";
import { callOpened, recognitionGranted, requestDecided } from "@/domain-events/crm";
import { accessGrantIssued } from "@/domain-events/identity";
import {
  badgeUnlocked,
  challengeCompleted,
  challengePublished,
  challengeRejected,
  checkinApproved,
} from "@/domain-events/participation";
import { membershipChanged, personAdmitted, personAnonymized } from "@/domain-events/people";
import { permanenceDecided } from "@/domain-events/permanence";
import { getEnv } from "@/env";
import { type JobContext, onEvent, registerHandler } from "@/jobs/registry";
import { purgeIfMembershipEnded } from "@/modules/people";
import { t, tList } from "@/shared/copy";
import { renderHtml, renderPlain } from "@/shared/copy/render";
import { runCampaignTick } from "./domain/campaigns";
import {
  emailPermanenceOutcome,
  pushAccessGrantIssued,
  pushAnnouncement,
  pushBadgeUnlocked,
  pushCallOpened,
  pushChallengeCompleted,
  pushChallengePublished,
  pushChallengeRejected,
  pushPointsCredited,
  pushRecognition,
  pushRequestDecided,
  unlessAnonymized,
} from "./domain/events";
import { deleteMessagesFor } from "./domain/messages";
import { type DeliveryStats, deliverNotification } from "./domain/notify";
import { deletePreferencesFor } from "./domain/preferences";
import { sendTransactionalEmail } from "./domain/send";
import { deleteSubscriptionsFor } from "./domain/subscriptions";

// Handlers de comms (ADR-037 regla 12, ADR-038): los correos transaccionales de la fase 5 (bienvenida
// T-200 y respuesta a una solicitud T-205), el bus de notificaciones y la limpieza al salir de la OE.

/**
 * Lo que un envío por push deja en el registro (ADR-118 regla 25). Si a alguien con dispositivo no le
 * llegó a ninguno, es una advertencia y no dice «entregado». Las cuentas llevan el código con que
 * respondió el servicio de push (`deviceFailures`), nunca el endpoint ni las claves del dispositivo.
 */
function logDelivery(ctx: JobContext, stats: DeliveryStats, delivered: string): void {
  if (stats.failed > 0) {
    ctx.log.warn(stats, "push sin entregar");
    return;
  }
  ctx.log.info(stats, delivered);
}

// Bus de notificaciones (ADR-038 regla 2): cualquier módulo emite `notification.requested` con
// destinatarios, textos, URL y clave; aquí se entrega por push respetando la preferencia de cada quien.
onEvent(notificationRequested, async (payload, ctx) => {
  const stats = await deliverNotification(payload);
  logDelivery(ctx, stats, "notificación entregada");
});

// Push por evento (ADR-038 reglas 6 y 7).
onEvent(announcementPushRequested, async (payload, ctx) => {
  const stats = await pushAnnouncement(payload);
  logDelivery(ctx, stats, "push del anuncio entregado");
});

onEvent(checkinApproved, async (payload, ctx) => {
  const stats = await pushPointsCredited(payload);
  if (stats) {
    logDelivery(ctx, stats, "push de puntos entregado");
  }
});

onEvent(callOpened, async (payload, ctx) => {
  const stats = await pushCallOpened(payload);
  logDelivery(ctx, stats, "push de convocatoria entregado");
});

// La titular se entera de que se emitió un enlace para su cuenta aunque el enlace se lo hayan
// entregado a otra persona (ADR-051, amenaza aceptada).
onEvent(accessGrantIssued, async (payload, ctx) => {
  const stats = await pushAccessGrantIssued(payload, ctx.id);
  logDelivery(ctx, stats, "push del enlace de acceso entregado");
});

onEvent(recognitionGranted, async (payload, ctx) => {
  const stats = await pushRecognition(payload);
  logDelivery(ctx, stats, "push de reconocimiento entregado");
});

// Gamificación (ADR-067): reto publicado a su audiencia, decisión de la entrega e insignia nueva.
onEvent(challengePublished, async (payload, ctx) => {
  const stats = await pushChallengePublished(payload);
  logDelivery(ctx, stats, "push de reto publicado entregado");
});

onEvent(challengeCompleted, async (payload, ctx) => {
  const stats = await pushChallengeCompleted(payload);
  logDelivery(ctx, stats, "push de reto completado entregado");
});

onEvent(challengeRejected, async (payload, ctx) => {
  const stats = await pushChallengeRejected(payload);
  logDelivery(ctx, stats, "push de reto rechazado entregado");
});

onEvent(badgeUnlocked, async (payload, ctx) => {
  const stats = await pushBadgeUnlocked(payload);
  if (stats) {
    logDelivery(ctx, stats, "push de insignia entregado");
  }
});

// Resultado de permanencia (ADR-038 regla 10): correo T-202 a quien cumple; una vez por término.
onEvent(permanenceDecided, async (payload, ctx) => {
  const receipt = await emailPermanenceOutcome(payload);
  if (receipt) {
    ctx.log.info(
      { status: receipt.status, provider: receipt.provider },
      "resultado de permanencia enviado",
    );
  }
});

// Campañas (ADR-038 regla 8): el programado `campaigns` encola un tick por minuto; "Enviar ahora"
// emite `campaign.start` para no esperar al minuto. Los dos corren la misma rutina.
async function campaignTick(ctx: JobContext): Promise<void> {
  const result = await runCampaignTick();
  if (result.started > 0 || result.sent > 0) {
    ctx.log.info(result, "campañas procesadas");
  }
}

registerHandler("comms.campaign-tick", (_payload, ctx) => campaignTick(ctx));
onEvent(campaignStart, (_payload, ctx) => campaignTick(ctx));

// Al salir de la OE se borran suscripciones y preferencias (ADR-030, ADR-038 regla 5), si la baja
// sigue vigente cuando corre el evento (ADR-118 regla 5): uno atrasado no se lleva las de quien volvió.
onEvent(membershipChanged, async ({ personId, to }, ctx) => {
  if (to !== "INACTIVE") {
    return;
  }
  const purged = await purgeIfMembershipEnded(personId, async (command) => ({
    subscriptions: await deleteSubscriptionsFor(command.tx, personId),
    preferences: await deletePreferencesFor(command.tx, personId),
  }));
  if (!purged) {
    ctx.log.info({ personId }, "baja atrasada: la persona ya volvió y conserva sus avisos");
    return;
  }
  ctx.log.info({ personId, ...purged }, "comunicaciones depuradas al salir");
});

// Anonimizar borra además los mensajes: no son historia institucional (ADR-030).
onEvent(personAnonymized, async ({ personId }, ctx) => {
  const subscriptions = await deleteSubscriptionsFor(getDb(), personId);
  const preferences = await deletePreferencesFor(getDb(), personId);
  const messages = await deleteMessagesFor(personId);
  ctx.log.info({ personId, subscriptions, preferences, messages }, "comunicaciones anonimizadas");
});

/** "Asunto · Cuerpo" del inventario de correos: la primera parte es el asunto. */
function splitMail(
  code: "T-200" | "T-205",
  values: Record<string, string>,
): {
  subject: string;
  body: string;
} {
  const [subject = "", ...rest] = t(code, values).split(" · ");
  return { subject, body: rest.join(" · ") };
}

/**
 * El correo de un evento sale una sola vez (ADR-115 regla 8). Su clave es el id de la fila del outbox,
 * que es el mismo en cada reintento del evento, más el código del texto: con el registro de `message`
 * por persona y clave, el reintento que provoca otro handler encuentra el registro y no reenvía. Quien
 * lo llama lo envuelve en `unlessAnonymized`: ese registro se borra al anonimizar (ADR-116 regla 9).
 */
async function sendEventEmail(
  ctx: JobContext,
  personId: string,
  to: string,
  code: "T-200" | "T-205",
  values: Record<string, string>,
) {
  const { subject, body } = splitMail(code, values);
  const pie = t("T-208").replace("{enlace de baja si aplica}", "").trim();
  return sendTransactionalEmail(
    {
      personId,
      to,
      subject,
      text: `${renderPlain(body)}\n\n${pie}`,
      html: `<p>${renderHtml(body)}</p><p style="color:#666;font-size:12px">${renderHtml(pie)}</p>`,
    },
    new Date(),
    { dedupeKey: `event:${ctx.id}:${code}` },
  );
}

onEvent(personAdmitted, async ({ personId, email, firstName, committees }, ctx) => {
  const receipt = await unlessAnonymized(personId, () =>
    sendEventEmail(ctx, personId, email, "T-200", {
      nombre: firstName || t("T-1056"),
      url: `${getEnv().APP_URL}/ingresar`,
      comités: committees.join(", "),
    }),
  );
  if (!receipt) {
    ctx.log.info({ personId }, "bienvenida sin enviar: la persona ya fue anonimizada");
    return;
  }
  ctx.log.info(
    { personId, status: receipt.status, provider: receipt.provider },
    "bienvenida enviada",
  );
});

onEvent(requestDecided, async (payload, ctx) => {
  const { personId, email, firstName, kindLabel, status, reason } = payload;
  // El estado viaja como texto (ADR-084 regla 5). Una decisión que este código no conozca no se le
  // comunica a nadie como «no aprobada»: se deja constancia y no se envía nada.
  if (status !== "APPROVED" && status !== "REJECTED") {
    ctx.log.warn({ personId, status }, "solicitud decidida con un estado desconocido; no se avisa");
    return;
  }
  const [aprobó, noAprobó] = tList("T-1061");
  // El correo y el push T-189 (ADR-038 regla 7): transaccional, no depende de la preferencia. Ninguno
  // se repite en un reintento (el bus registra el push con la clave de la solicitud), y ninguno sale
  // si la persona ya fue anonimizada.
  const delivered = await unlessAnonymized(personId, async () => {
    const receipt = await sendEventEmail(ctx, personId, email, "T-205", {
      nombre: firstName || t("T-1056"),
      tipo: kindLabel,
      decisión: status === "APPROVED" ? aprobó : noAprobó,
      motivo: reason ? ` ${t("T-1062", { motivo: reason })}` : "",
    });
    return { receipt, stats: await pushRequestDecided(payload) };
  });
  if (!delivered) {
    ctx.log.info(
      { personId },
      "respuesta a la solicitud sin enviar: la persona ya fue anonimizada",
    );
    return;
  }
  ctx.log.info(
    { personId, status: delivered.receipt.status, provider: delivered.receipt.provider },
    "respuesta a la solicitud enviada",
  );
  logDelivery(ctx, delivered.stats, "push de la solicitud entregado");
});
