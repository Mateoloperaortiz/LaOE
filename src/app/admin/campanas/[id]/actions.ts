"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { cancelCampaignAs, scheduleCampaignAs, sendTemplateTestAs } from "@/modules/comms";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";

// Detalle de una campaña (ADR-038 regla 8): programar y enviar ahora exigen ADMIN con step-up;
// cancelar y la prueba al propio correo solo ADMIN.

const idSchema = z.string().regex(/^[a-z0-9]+$/);

function back(id: string, extra: Record<string, string> = {}): string {
  return withQuery(`/admin/campanas/${id}`, extra);
}

export async function scheduleAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("campaignId"));
  const when = formText(formData, "scheduledAt");
  const actor = await requireAdminActor(back(id));
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(back(id, { accion: "programar" }))}`);
  }
  if (!LOCAL_INPUT.test(when)) {
    redirect(back(id, { error: "fecha" }));
  }
  try {
    await scheduleCampaignAs(await actorContext(actor), id, bogotaInputToUtc(when));
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(id, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(`/admin/campanas/${id}`);
  redirect(back(id, { guardado: "programada" }));
}

export async function sendNowAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("campaignId"));
  const actor = await requireAdminActor(back(id));
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(back(id, { accion: "enviar" }))}`);
  }
  try {
    await scheduleCampaignAs(await actorContext(actor), id, new Date());
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(id, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(`/admin/campanas/${id}`);
  redirect(back(id, { guardado: "enviando" }));
}

export async function cancelAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("campaignId"));
  const actor = await requireAdminActor(back(id));
  try {
    await cancelCampaignAs(await actorContext(actor), id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(id, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(`/admin/campanas/${id}`);
  redirect(back(id, { guardado: "cancelada" }));
}

export async function sendTestFromCampaignAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("campaignId"));
  const templateId = idSchema.parse(formData.get("templateId"));
  const actor = await requireAdminActor(back(id));
  const result = await sendTemplateTestAs(await actorContext(actor), templateId);
  redirect(result ? back(id, { prueba: result.to }) : back(id));
}
