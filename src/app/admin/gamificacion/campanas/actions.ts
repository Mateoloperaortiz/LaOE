"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { campaignInputSchema, cancelCampaignAs, createCampaignsAs } from "@/modules/participation";
import { bogotaInputToUtc } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";

// Campañas de puntos (ADR-067 regla 9): una fila por objetivo, ventana en hora de Bogotá.

const BACK = "/admin/gamificacion/campanas";

function safeTermId(value: string): string {
  return /^[a-z0-9-]+$/i.test(value) ? value : "";
}

export async function createCampaignAction(formData: FormData): Promise<void> {
  const termId = safeTermId(formText(formData, "termId"));
  const back = termId ? `${BACK}?termId=${termId}` : BACK;
  const actor = await requireAdminActor(back);
  const startsRaw = formText(formData, "startsAt");
  const endsRaw = formText(formData, "endsAt");
  const parsed = campaignInputSchema.safeParse({
    name: formText(formData, "name"),
    percent: formText(formData, "percent"),
    challengeIds: formData.getAll("challengeIds"),
    occasionIds: formData.getAll("occasionIds"),
    startsAt: startsRaw ? bogotaInputToUtc(startsRaw) : "",
    endsAt: endsRaw ? bogotaInputToUtc(endsRaw) : "",
  });
  if (!parsed.success) {
    redirect(withQuery(back, { error: parsed.error.issues[0]?.message ?? "T-260" }));
  }
  try {
    await createCampaignsAs(await actorContext(actor), parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(withQuery(back, { guardado: "1" }));
}

export async function cancelCampaignAction(formData: FormData): Promise<void> {
  const id = z
    .string()
    .regex(/^[a-z0-9-]+$/i)
    .parse(formData.get("id"));
  const termId = safeTermId(formText(formData, "termId"));
  const back = termId ? `${BACK}?termId=${termId}` : BACK;
  const actor = await requireAdminActor(back);
  try {
    await cancelCampaignAs(await actorContext(actor), id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(withQuery(back, { guardado: "1" }));
}
