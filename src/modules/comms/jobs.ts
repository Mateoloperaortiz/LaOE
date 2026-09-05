import { z } from "zod";
import { getEnv } from "@/env";
import { registerHandler } from "@/jobs/registry";
import { t, tList } from "@/shared/copy";
import { renderHtml, renderPlain } from "@/shared/copy/render";
import { sendTransactionalEmail } from "./domain/send";

// Correos transaccionales de la fase 5 (ADR-037 regla 12): la bienvenida al dar de alta (T-200) y la
// respuesta a una solicitud (T-205). Los payloads traen correo y nombre: comms no consulta a people.

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
