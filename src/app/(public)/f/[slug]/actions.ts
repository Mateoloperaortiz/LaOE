"use server";

import "server-only";
import { redirect } from "next/navigation";
import { answersFromFormData, getPublicForm, HONEYPOT_FIELD, submitFormAs } from "@/modules/forms";
import { getActor } from "@/modules/identity";
import { t } from "@/shared/copy";
import { clientIp, userAgent } from "@/shared/lib/request";
import type { SubmitState } from "./state";

// Envío de un formulario propio (ADR-037 regla 4): la respuesta vuelve a la misma página con los
// errores por campo o con `?ok=1`; el estado viaja por `useActionState` para conservar lo escrito.

const ERROR_CODES = {
  CLOSED: "T-860",
  FULL: "T-861",
  DUPLICATE: "T-862",
  RATE_LIMITED: "T-863",
  CONSENT: "T-858",
  INVALID: "T-866",
  POLICY_PENDING: "T-1178",
} as const;

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function submitAction(
  previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const slug = readString(formData, "slug");
  const target = await getPublicForm(slug);
  if (!target) {
    return { ...previous, message: t("T-860") };
  }
  const actor = await getActor();
  if (target.audience === "MEMBERS" && !actor) {
    redirect(`/ingresar?next=${encodeURIComponent(`/f/${slug}`)}`);
  }
  const answers = answersFromFormData(formData, target.parsedFields);
  const identity = {
    firstName: readString(formData, "firstName"),
    lastName: readString(formData, "lastName"),
    email: readString(formData, "email"),
  };
  const result = await submitFormAs(actor, target, {
    identity,
    answers,
    consent: formData.get("consent") === "on",
    honeypot: readString(formData, HONEYPOT_FIELD),
    ip: await clientIp(),
    userAgent: await userAgent(),
  });
  if (!result.ok) {
    const errors: Record<string, string> = {};
    for (const [key, code] of Object.entries(result.errors)) {
      errors[key] = t(code as "T-853");
    }
    // Con errores por campo el mensaje va junto al campo; sin ellos (o con el correo repetido, que en
    // un formulario de miembros no tiene campo), el general del código.
    const general = Object.keys(errors).length === 0 || result.code === "DUPLICATE";
    return {
      errors: result.code === "DUPLICATE" ? {} : errors,
      message: general ? t(ERROR_CODES[result.code]) : null,
      values: { ...identity, ...answers },
    };
  }
  redirect(`/f/${slug}?ok=1${result.registered ? "&inscrito=1" : ""}`);
}
