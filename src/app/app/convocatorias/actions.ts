"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { applyToCallAs, getCall } from "@/modules/crm";
import { answersFromFormData, getFormView } from "@/modules/forms";
import { getActor } from "@/modules/identity";
import { listGroupIdsOf } from "@/modules/permanence";
import { DomainError } from "@/shared/lib/errors";

// "Me apunto" (ADR-037 regla 10): valida las respuestas del formulario de la convocatoria si lo tiene y
// entra por orden de llegada o queda pendiente del líder. Si la persona ya está en el grupo, no aplica.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function applyAction(formData: FormData): Promise<void> {
  const callId = idSchema.parse(formData.get("callId"));
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(`/app/convocatorias/${callId}`)}`);
  }
  const call = await getCall(callId);
  if (!call) {
    redirect("/app/convocatorias");
  }
  const form = call.formId ? await getFormView(call.formId) : null;
  const answers = form ? answersFromFormData(formData, form.parsedFields) : {};
  const groups = await listGroupIdsOf(actor.personId);
  try {
    const result = await applyToCallAs(await actorContext(actor), callId, answers, {
      inGroup: groups.includes(call.groupId),
    });
    revalidatePath("/app/convocatorias");
    redirect(`/app/convocatorias?inscrita=${result.status}&convocatoria=${callId}`);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`/app/convocatorias/${callId}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}
