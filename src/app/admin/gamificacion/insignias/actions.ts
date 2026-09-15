"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { createSpecialBadgeAs, grantBoosterAs, revokeBoosterAs } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

// Insignias (ADR-067 reglas 6, 9 y 15): alta de ediciones especiales y otorgamiento/retiro manual
// de boosters — todo con motivo obligatorio y solo ADMIN.

const BACK = "/admin/gamificacion/insignias";

const grantSchema = z.object({
  personId: z.string().trim().min(1).max(80),
  termId: z.string().trim().min(1).max(80),
  kind: z.enum(["PLUS_50", "PLUS_100"]),
  reason: z.string().trim().max(300),
});

const revokeSchema = z.object({
  boosterId: z.string().trim().min(1).max(80),
  termId: z.string().trim().max(80).default(""),
  reason: z.string().trim().max(300),
});

const specialSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  vinculo: z.enum(["ocasion", "reto"]),
  occasionId: z.string().trim().max(80).default(""),
  challengeId: z.string().trim().max(80).default(""),
});

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

export async function createSpecialBadgeAction(formData: FormData): Promise<void> {
  const back = BACK;
  const actor = await requireAdmin(back);
  const parsed = specialSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    vinculo: formData.get("vinculo"),
    occasionId: formData.get("occasionId") ?? "",
    challengeId: formData.get("challengeId") ?? "",
  });
  if (!parsed.success) {
    redirect(withQuery(back, { error: "T-260" }));
  }
  const { vinculo, occasionId, challengeId, ...rest } = parsed.data;
  const input = {
    ...rest,
    specialOccasionId: vinculo === "ocasion" ? occasionId || null : null,
    specialChallengeId: vinculo === "reto" ? challengeId || null : null,
  };
  if (!input.specialOccasionId && !input.specialChallengeId) {
    redirect(withQuery(back, { error: "T-260" }));
  }
  try {
    await createSpecialBadgeAs({ personId: actor.personId, ip: await clientIp() }, input);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(withQuery(back, { guardado: "1" }));
}

export async function grantBoosterAction(formData: FormData): Promise<void> {
  const back = `${BACK}?termId=${encodeURIComponent(text(formData, "termId"))}`;
  const actor = await requireAdmin(back);
  const parsed = grantSchema.safeParse({
    personId: formData.get("personId"),
    termId: formData.get("termId"),
    kind: formData.get("kind"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    redirect(withQuery(back, { error: "T-260" }));
  }
  try {
    await grantBoosterAs({ personId: actor.personId, ip: await clientIp() }, parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(withQuery(back, { otorgado: "1" }));
}

export async function revokeBoosterAction(formData: FormData): Promise<void> {
  const back = `${BACK}?termId=${encodeURIComponent(text(formData, "termId"))}`;
  const actor = await requireAdmin(back);
  const parsed = revokeSchema.safeParse({
    boosterId: formData.get("boosterId"),
    termId: formData.get("termId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    redirect(withQuery(back, { error: "T-260" }));
  }
  try {
    await revokeBoosterAs(
      { personId: actor.personId, ip: await clientIp() },
      { boosterId: parsed.data.boosterId, reason: parsed.data.reason },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(withQuery(back, { retirado: "1" }));
}
