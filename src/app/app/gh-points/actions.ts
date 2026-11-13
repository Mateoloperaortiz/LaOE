"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { getMemberActor } from "@/modules/identity";
import { claimRewardAs } from "@/modules/participation";
import { DomainError } from "@/shared/lib/errors";

// Reclamar una recompensa por umbral (ADR-177 regla 2): no gasta puntos; deja la entrega pendiente.

const BACK = "/app/gh-points";

export async function claimRewardAction(formData: FormData): Promise<void> {
  const actor = await getMemberActor();
  if (!actor) redirect(`/ingresar?next=${encodeURIComponent(BACK)}`);
  const rewardId = z.string().min(1).max(64).parse(formData.get("rewardId"));
  try {
    await claimRewardAs(await actorContext(actor), rewardId);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`${BACK}?recompensa_error=${encodeURIComponent(error.message)}#recompensas`);
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(`${BACK}?recompensa=1#recompensas`);
}
