"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { decideEntryAs, getCall, setCallStatusAs } from "@/modules/crm";
import { DomainError } from "@/shared/admin-kit";
import { requireGroupOperator } from "../../permanencia/authz";

// Detalle de una convocatoria (ADR-037 regla 10): el líder del grupo o ADMIN acepta, rechaza o promueve
// inscripciones y abre o cierra la convocatoria.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function back(callId: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(extra).toString();
  return `/admin/convocatorias/${callId}${query ? `?${query}` : ""}`;
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
  const status = text(formData, "status") === "ACCEPTED" ? "ACCEPTED" : "REJECTED";
  const { actor } = await operator(callId);
  try {
    await decideEntryAs(actor, entryId, status, text(formData, "note") || undefined);
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
  const status = text(formData, "status") === "OPEN" ? "OPEN" : "CLOSED";
  const { actor } = await operator(callId);
  await setCallStatusAs(actor, callId, status);
  revalidatePath(`/admin/convocatorias/${callId}`);
  redirect(back(callId, { guardado: "1" }));
}
