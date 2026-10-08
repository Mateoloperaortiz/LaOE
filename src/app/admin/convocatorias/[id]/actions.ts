"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireGroupOperator } from "@/app/_authz/group";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { decideEntryAs, getCall, setCallStatusAs } from "@/modules/crm";
import { groupJoinBlocker } from "@/modules/permanence";
import { DomainError } from "@/shared/lib/errors";

// Detalle de una convocatoria (ADR-037 regla 10): el líder del grupo o ADMIN acepta, rechaza o promueve
// inscripciones y abre o cierra la convocatoria. Decidir recibe la convocatoria autorizada y el dominio
// rechaza una inscripción de otra (ADR-072).

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function back(callId: string, extra: Record<string, string> = {}): string {
  return withQuery(`/admin/convocatorias/${callId}`, extra);
}

async function operator(callId: string) {
  const call = await getCall(callId);
  if (!call) {
    redirect("/admin/convocatorias");
  }
  const { actor } = await requireGroupOperator(call.groupId, back(callId));
  return { call, actor };
}

export async function decideEntryAction(formData: FormData): Promise<void> {
  const callId = idSchema.parse(formData.get("callId"));
  const entryId = idSchema.parse(formData.get("entryId"));
  const status = formText(formData, "status") === "ACCEPTED" ? "ACCEPTED" : "REJECTED";
  const { actor } = await operator(callId);
  try {
    // crm pregunta y permanence responde si el grupo admite a la persona (ADR-116 regla 7).
    await decideEntryAs(actor, callId, entryId, status, formText(formData, "note") || undefined, {
      joinBlocker: groupJoinBlocker,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(callId, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(`/admin/convocatorias/${callId}`);
  redirect(back(callId, { decidida: status }));
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const callId = idSchema.parse(formData.get("callId"));
  const status = formText(formData, "status") === "OPEN" ? "OPEN" : "CLOSED";
  const { actor } = await operator(callId);
  await setCallStatusAs(actor, callId, status);
  revalidatePath(`/admin/convocatorias/${callId}`);
  redirect(back(callId, { guardado: "1" }));
}
