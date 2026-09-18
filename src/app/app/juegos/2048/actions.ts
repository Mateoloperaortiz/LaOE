"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/modules/identity";
import {
  finishGame2048As,
  type Game2048Result,
  type Game2048StartResult,
  startGame2048As,
} from "@/modules/participation";
import { clientIp } from "@/shared/lib/request";

// El navegador manda partida, movimientos y requestId; nunca un puntaje. El dominio rejuega.

async function ownActor() {
  const actor = await requireActor("/app/juegos/2048");
  return { personId: actor.personId, ip: await clientIp() };
}

export async function startGame2048Action(input: unknown): Promise<Game2048StartResult> {
  return startGame2048As(await ownActor(), input);
}

export async function finishGame2048Action(input: unknown): Promise<Game2048Result> {
  const result = await finishGame2048As(await ownActor(), input);
  if (result.ok) {
    revalidatePath("/app/juegos/2048");
    revalidatePath("/app/juegos");
    if (result.run.points > 0) {
      revalidatePath("/app/gh-points");
      revalidatePath("/app");
    }
  }
  return result;
}
