"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { actorContext } from "@/app/_lib/actor";
import { requireActor } from "@/modules/identity";
import {
  type ColorResult,
  nextColorRoundAs,
  startColorAs,
  submitColorRoundAs,
} from "@/modules/participation";

async function ownActor() {
  return actorContext(await requireActor("/app/juegos/color"));
}

export async function startColorAction(input: unknown): Promise<ColorResult> {
  return startColorAs(await ownActor(), input);
}

export async function nextColorRoundAction(input: unknown): Promise<ColorResult> {
  return nextColorRoundAs(await ownActor(), input);
}

export async function submitColorRoundAction(input: unknown): Promise<ColorResult> {
  const result = await submitColorRoundAs(await ownActor(), input);
  if (result.ok) {
    revalidatePath("/app/juegos/color");
    if (result.run.status === "FINISHED") revalidatePath("/app/juegos");
  }
  return result;
}
