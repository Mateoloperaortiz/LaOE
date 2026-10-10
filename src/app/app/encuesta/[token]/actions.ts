"use server";

import "server-only";
import { redirect } from "next/navigation";
import { answersFromFormData } from "@/modules/forms";
import { getActor } from "@/modules/identity";
import { answerSurveyAs, getSurveyInviteForActor } from "@/modules/participation";
import { t } from "@/shared/copy";
import type { SurveyFormState } from "./state";

// Responder la encuesta de una ocasión (ADR-038 regla 13): solo el asistente invitado, una vez y
// dentro de la ventana; la respuesta se guarda sin persona.

const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

export async function answerSurveyAction(
  _previous: SurveyFormState,
  formData: FormData,
): Promise<SurveyFormState> {
  const token = String(formData.get("token") ?? "");
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(`/app/encuesta/${token}`)}`);
  }
  if (!TOKEN.test(token)) {
    return { done: false, state: "NOT_FOUND", errors: {}, values: {} };
  }
  const invite = await getSurveyInviteForActor(actor.personId, token);
  if (invite.state !== "OPEN") {
    return { done: false, state: invite.state, errors: {}, values: {} };
  }
  const raw = answersFromFormData(formData, invite.fields);
  // Sin IP a propósito: la respuesta a la encuesta es anónima por diseño (ADR-082 regla 7).
  const result = await answerSurveyAs({ personId: actor.personId, ip: null }, token, raw);
  if (result.ok) {
    return { done: true, state: "OPEN", errors: {}, values: {} };
  }
  if ("errors" in result) {
    const errors: Record<string, string> = {};
    for (const [key, code] of Object.entries(result.errors)) {
      errors[key] = t(code as "T-853");
    }
    return { done: false, state: "OPEN", errors, values: raw };
  }
  return { done: false, state: result.state, errors: {}, values: {} };
}
