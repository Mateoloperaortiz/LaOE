"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cancelCampaignAs, scheduleCampaignAs, sendTemplateTestAs } from "@/modules/comms";
import { assertAdmin, ForbiddenError, getActor, hasRecentStepUp } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { clientIp } from "@/shared/lib/request";

// Detalle de una campaña (ADR-038 regla 8): programar y enviar ahora exigen ADMIN con step-up;
// cancelar y la prueba al propio correo solo ADMIN.

const idSchema = z.string().regex(/^[a-z0-9]+$/);

function back(id: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(extra).toString();
  return `/admin/campanas/${id}${query ? `?${query}` : ""}`;
}

async function requireAdmin(returnTo: string) {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  return actor;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function scheduleAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("campaignId"));
  const when = text(formData, "scheduledAt");
  const actor = await requireAdmin(back(id));
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(back(id, { accion: "programar" }))}`);
  }
  if (!LOCAL_INPUT.test(when)) {
    redirect(back(id, { error: "fecha" }));
  }
  try {
    await scheduleCampaignAs(
      { personId: actor.personId, ip: await clientIp() },
      id,
      bogotaInputToUtc(when),
    );
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
  const actor = await requireAdmin(back(id));
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(back(id, { accion: "enviar" }))}`);
  }
  try {
    await scheduleCampaignAs({ personId: actor.personId, ip: await clientIp() }, id, new Date());
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
  const actor = await requireAdmin(back(id));
  try {
    await cancelCampaignAs({ personId: actor.personId, ip: await clientIp() }, id);
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
  const actor = await requireAdmin(back(id));
  const result = await sendTemplateTestAs({ personId: actor.personId }, templateId);
  redirect(result ? back(id, { prueba: result.to }) : back(id));
}
