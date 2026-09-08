"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/modules/identity";
import { startWordleAs, submitWordleGuessAs } from "@/modules/participation";
import type { WordleResult } from "@/modules/participation/wordle-types";
import { clientIp } from "@/shared/lib/request";

const inputSchema = z.object({
  gameId: z.string().min(1).max(128),
  guess: z.string().min(1).max(32),
  requestId: z.string().uuid(),
  expectedAttempt: z.number().int().min(1).max(6),
});

async function ownActor() {
  const actor = await requireActor("/app/gh-points");
  return { personId: actor.personId, ip: await clientIp() };
}

export async function startWordleAction(): Promise<WordleResult> {
  const result = await startWordleAs(await ownActor());
  if (result.ok) revalidatePath("/app/gh-points");
  return result;
}

export async function submitWordleAction(input: unknown): Promise<WordleResult> {
  const actor = await ownActor();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID_INPUT" };
  const result = await submitWordleGuessAs(actor, parsed.data);
  if (result.ok || result.game) revalidatePath("/app/gh-points");
  if (result.ok && result.game.status === "WON") revalidatePath("/app");
  return result;
}
