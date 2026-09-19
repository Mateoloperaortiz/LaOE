"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { requireActor } from "@/modules/identity";
import { startWordleAs, submitWordleGuessAs } from "@/modules/participation";
import type { WordleResult } from "@/modules/participation/wordle-types";

const inputSchema = z.object({
  gameId: z.string().min(1).max(128),
  guess: z.string().min(1).max(32),
  requestId: z.string().uuid(),
  expectedAttempt: z.number().int().min(1).max(6),
});

async function ownActor() {
  const actor = await requireActor("/app/juegos/wordle");
  return await actorContext(actor);
}

/** Revalida también el resumen y la biblioteca: los dos muestran el estado del juego. */
function revalidateGame(won = false) {
  revalidatePath("/app/juegos/wordle");
  revalidatePath("/app/juegos");
  revalidatePath("/app/gh-points");
  if (won) revalidatePath("/app");
}

export async function startWordleAction(): Promise<WordleResult> {
  const result = await startWordleAs(await ownActor());
  if (result.ok) revalidateGame();
  return result;
}

export async function submitWordleAction(input: unknown): Promise<WordleResult> {
  const actor = await ownActor();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID_INPUT" };
  const result = await submitWordleGuessAs(actor, parsed.data);
  if (result.ok || result.game) revalidateGame(result.ok && result.game.status === "WON");
  return result;
}
