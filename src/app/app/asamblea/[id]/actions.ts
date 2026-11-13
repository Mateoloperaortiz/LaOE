"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { getMemberActor } from "@/modules/identity";
import { votePollAs } from "@/modules/participation";
import { DomainError } from "@/shared/lib/errors";

// Votar en una consulta de la asamblea (ADR-180): el dominio comprueba la asistencia aprobada, que la
// consulta esté abierta y que sea el primer voto de la persona.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function voteAction(formData: FormData): Promise<void> {
  const occasionId = idSchema.parse(formData.get("occasionId"));
  const back = `/app/asamblea/${occasionId}`;
  const actor = await getMemberActor();
  if (!actor) redirect(`/ingresar?next=${encodeURIComponent(back)}`);
  try {
    await votePollAs(
      await actorContext(actor),
      idSchema.parse(formData.get("pollId")),
      z.coerce.number().int().min(0).parse(formData.get("optionIndex")),
    );
  } catch (error) {
    if (error instanceof DomainError)
      redirect(`${back}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath(back);
  redirect(`${back}?votado=1`);
}
