import { z } from "zod";
import { getEnv } from "@/env";
import { registerHandler } from "@/jobs/registry";
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
} from "./domain/events";
import { deleteMessagesFor } from "./domain/messages";
import { deliverNotification } from "./domain/notify";
import { deletePreferencesFor } from "./domain/preferences";
import { sendTransactionalEmail } from "./domain/send";
import { deleteSubscriptionsFor } from "./domain/subscriptions";

// Handlers de comms (ADR-037 regla 12, ADR-038): los correos transaccionales de la fase 5 (bienvenida
// T-200 y respuesta a una solicitud T-205), el bus de notificaciones y la limpieza al salir de la OE.

// Bus de notificaciones (ADR-038 regla 2): cualquier módulo emite `notification.requested` con
// destinatarios, textos, URL y clave; aquí se entrega por push respetando la preferencia de cada quien.
registerHandler("notification.requested", async (payload, ctx) => {
  const stats = await deliverNotification(payload);
  ctx.log.info(stats, "notificación entregada");
});

// Push por evento (ADR-038 reglas 6 y 7).
registerHandler("announcement.push-requested", async (payload, ctx) => {
  const stats = await pushAnnouncement(payload);
  ctx.log.info(stats, "push del anuncio entregado");
});

registerHandler("checkin.approved", async (payload, ctx) => {
  const stats = await pushPointsCredited(payload);
  if (stats) {
    ctx.log.info(stats, "push de puntos entregado");
  }
});

registerHandler("call.opened", async (payload, ctx) => {
  const stats = await pushCallOpened(payload);
  ctx.log.info(stats, "push de convocatoria entregado");
});

// La titular se entera de que se emitió un enlace para su cuenta aunque el enlace se lo hayan
// entregado a otra persona (ADR-051, amenaza aceptada).
registerHandler("access-grant.issued", async (payload, ctx) => {
  const stats = await pushAccessGrantIssued(payload);
  ctx.log.info(stats, "push del enlace de acceso entregado");
});

registerHandler("recognition.granted", async (payload, ctx) => {
  const stats = await pushRecognition(payload);
  ctx.log.info(stats, "push de reconocimiento entregado");
});

// Gamificación (ADR-067): reto publicado a su audiencia, decisión de la entrega e insignia nueva.
registerHandler("challenge.published", async (payload, ctx) => {
  const stats = await pushChallengePublished(payload);
  ctx.log.info(stats, "push de reto publicado entregado");
});

registerHandler("challenge.completed", async (payload, ctx) => {
  const stats = await pushChallengeCompleted(payload);
  ctx.log.info(stats, "push de reto completado entregado");
});

registerHandler("challenge.rejected", async (payload, ctx) => {
  const stats = await pushChallengeRejected(payload);
  ctx.log.info(stats, "push de reto rechazado entregado");
});

registerHandler("badge.unlocked", async (payload, ctx) => {
  const stats = await pushBadgeUnlocked(payload);
  if (stats) {
    ctx.log.info(stats, "push de insignia entregado");
  }
});

// Resultado de permanencia (ADR-038 regla 10): correo T-202 a quien cumple; una vez por término.
registerHandler("permanence.decided", async (payload, ctx) => {
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
for (const type of ["comms.campaign-tick", "campaign.start"]) {
  registerHandler(type, async (_payload, ctx) => {
    const result = await runCampaignTick();
    if (result.started > 0 || result.sent > 0) {
      ctx.log.info(result, "campañas procesadas");
    }
  });
}

const membershipChanged = z.object({
  personId: z.string().min(1),
  to: z.enum(["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"]),
});

// Al salir de la OE se borran suscripciones y preferencias (ADR-030, ADR-038 regla 5).
registerHandler("membership.changed", async (payload, ctx) => {
  const { personId, to } = membershipChanged.parse(payload);
  if (to !== "INACTIVE") {
    return;
  }
  const subscriptions = await deleteSubscriptionsFor(personId);
  const preferences = await deletePreferencesFor(personId);
  ctx.log.info({ personId, subscriptions, preferences }, "comunicaciones depuradas al salir");
});

const personEvent = z.object({ personId: z.string().min(1) });

// Anonimizar borra además los mensajes: no son historia institucional (ADR-030).
registerHandler("person.anonymized", async (payload, ctx) => {
  const { personId } = personEvent.parse(payload);
  const subscriptions = await deleteSubscriptionsFor(personId);
  const preferences = await deletePreferencesFor(personId);
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

async function send(
  personId: string,
  to: string,
  code: "T-200" | "T-205",
  values: Record<string, string>,
) {
  const { subject, body } = splitMail(code, values);
  const pie = t("T-208").replace("{enlace de baja si aplica}", "").trim();
  return sendTransactionalEmail({
    personId,
    to,
    subject,
    text: `${renderPlain(body)}\n\n${pie}`,
    html: `<p>${renderHtml(body)}</p><p style="color:#666;font-size:12px">${renderHtml(pie)}</p>`,
  });
}

const admitted = z.object({
  personId: z.string().min(1),
  email: z.string().min(3),
  firstName: z.string(),
  committees: z.array(z.string()).default([]),
});

registerHandler("person.admitted", async (payload, ctx) => {
  const { personId, email, firstName, committees } = admitted.parse(payload);
  const receipt = await send(personId, email, "T-200", {
    nombre: firstName || t("T-1056"),
    url: `${getEnv().APP_URL}/ingresar`,
    comités: committees.join(", "),
  });
  ctx.log.info(
    { personId, status: receipt.status, provider: receipt.provider },
    "bienvenida enviada",
  );
});

const decided = z.object({
  personId: z.string().min(1),
  email: z.string().min(3),
  firstName: z.string(),
  kindLabel: z.string(),
  status: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().nullable().optional(),
});

registerHandler("request.decided", async (payload, ctx) => {
  const { personId, email, firstName, kindLabel, status, reason } = decided.parse(payload);
  const [aprobó, noAprobó] = tList("T-1061") as [string, string];
  const receipt = await send(personId, email, "T-205", {
    nombre: firstName || t("T-1056"),
    tipo: kindLabel,
    decisión: status === "APPROVED" ? aprobó : noAprobó,
    motivo: reason ? ` ${t("T-1062", { motivo: reason })}` : "",
  });
  ctx.log.info(
    { personId, status: receipt.status, provider: receipt.provider },
    "respuesta a la solicitud enviada",
  );
  // Y el push T-189 (ADR-038 regla 7): transaccional, no depende de la preferencia.
  const stats = await pushRequestDecided(payload);
  ctx.log.info(stats, "push de la solicitud entregado");
});
