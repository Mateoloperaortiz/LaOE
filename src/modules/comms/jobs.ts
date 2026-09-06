import { z } from "zod";
import { getEnv } from "@/env";
import { registerHandler } from "@/jobs/registry";
import { t, tList } from "@/shared/copy";
import { renderHtml, renderPlain } from "@/shared/copy/render";
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
});
