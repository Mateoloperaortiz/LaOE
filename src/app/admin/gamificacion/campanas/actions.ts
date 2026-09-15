"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { campaignInputSchema, cancelCampaignAs, createCampaignsAs } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";
import { bogotaInputToUtc } from "@/shared/lib/dates";
import { clientIp } from "@/shared/lib/request";

// Campañas de puntos (ADR-067 regla 9): una fila por objetivo, ventana en hora de Bogotá.

const BACK = "/admin/gamificacion/campanas";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function withQuery(base: string, extra: Record<string, string>): string {
  const url = new URL(base, "http://local");
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
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

function safeTermId(value: string): string {
  return /^[a-z0-9-]+$/i.test(value) ? value : "";
}

export async function createCampaignAction(formData: FormData): Promise<void> {
  const termId = safeTermId(text(formData, "termId"));
  const back = termId ? `${BACK}?termId=${termId}` : BACK;
  const actor = await requireAdmin(back);
  const startsRaw = text(formData, "startsAt");
  const endsRaw = text(formData, "endsAt");
  const parsed = campaignInputSchema.safeParse({
    name: text(formData, "name"),
    percent: text(formData, "percent"),
    challengeIds: formData.getAll("challengeIds"),
    occasionIds: formData.getAll("occasionIds"),
    startsAt: startsRaw ? bogotaInputToUtc(startsRaw) : "",
    endsAt: endsRaw ? bogotaInputToUtc(endsRaw) : "",
  });
  if (!parsed.success) {
    redirect(withQuery(back, { error: parsed.error.issues[0]?.message ?? "T-260" }));
  }
  try {
    await createCampaignsAs({ personId: actor.personId, ip: await clientIp() }, parsed.data);
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
  const termId = safeTermId(text(formData, "termId"));
  const back = termId ? `${BACK}?termId=${termId}` : BACK;
  const actor = await requireAdmin(back);
  try {
    await cancelCampaignAs({ personId: actor.personId, ip: await clientIp() }, id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(withQuery(back, { guardado: "1" }));
}
