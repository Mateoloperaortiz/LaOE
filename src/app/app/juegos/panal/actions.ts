"use server";

import { revalidatePath } from "next/cache";
import { actorContext } from "@/app/_lib/actor";
import { requireActor } from "@/modules/identity";
import { startPanalAs, submitPanalWordAs } from "@/modules/participation";
import type { PanalResult } from "@/modules/participation/panal-types";

function revalidate(result: PanalResult) {
  if (!result.ok) return;
  revalidatePath("/app/juegos/panal");
  revalidatePath("/app/juegos");
  if (result.game.points > 0) {
    revalidatePath("/app/gh-points");
    revalidatePath("/app");
  }
}

export async function startPanalAction(day: string): Promise<PanalResult> {
  const actor = await requireActor("/app/juegos/panal");
  const result = await startPanalAs(await actorContext(actor), day);
  revalidate(result);
  return result;
}

export async function submitPanalAction(input: unknown): Promise<PanalResult> {
  const actor = await requireActor("/app/juegos/panal");
  const result = await submitPanalWordAs(await actorContext(actor), input);
  revalidate(result);
  return result;
}
