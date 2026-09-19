"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { actorContext } from "@/app/_lib/actor";
import { requireActor } from "@/modules/identity";
import {
  abandonSudokuAs,
  finishSudokuAs,
  type SudokuResult,
  type SudokuStartResult,
  startSudokuAs,
} from "@/modules/participation";

// El navegador manda partida, cuadrícula y requestId; el dominio compara con la solución que guarda.

async function ownActor() {
  const actor = await requireActor("/app/juegos/sudoku");
  return await actorContext(actor);
}

export async function startSudokuAction(input: unknown): Promise<SudokuStartResult> {
  return startSudokuAs(await ownActor(), input);
}

export async function finishSudokuAction(input: unknown): Promise<SudokuResult> {
  const result = await finishSudokuAs(await ownActor(), input);
  if (result.ok) {
    revalidatePath("/app/juegos/sudoku");
    revalidatePath("/app/juegos");
    if (result.run.points > 0) {
      revalidatePath("/app/gh-points");
      revalidatePath("/app");
    }
  }
  return result;
}

export async function abandonSudokuAction(input: unknown): Promise<SudokuResult> {
  const result = await abandonSudokuAs(await ownActor(), input);
  if (result.ok) {
    revalidatePath("/app/juegos/sudoku");
  }
  return result;
}
