"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formRaw } from "@/app/_lib/form";
import { getMemberActor } from "@/modules/identity";
import { deleteApplauseAs, giveApplauseAs } from "@/modules/participation";
import { DomainError } from "@/shared/lib/errors";

// Aplaudir y borrar un aplauso propio desde el muro del comité (ADR-176): el dominio comprueba que las
// dos personas sean del comité en el semestre y el tope del día.

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);
const idSchema = z.string().min(1).max(64);

function back(slug: string, extra = ""): string {
  return `/app/comites/${slug}/muro${extra}`;
}

export async function applaudAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const actor = await getMemberActor();
  if (!actor) redirect(`/ingresar?next=${encodeURIComponent(back(slug))}`);
  try {
    await giveApplauseAs(await actorContext(actor), {
      toPersonId: idSchema.parse(formData.get("toPersonId")),
      committeeId: idSchema.parse(formData.get("committeeId")),
      message: formRaw(formData, "message"),
    });
  } catch (error) {
    if (error instanceof DomainError)
      redirect(back(slug, `?error=${encodeURIComponent(error.message)}`));
    throw error;
  }
  revalidatePath(back(slug));
  redirect(back(slug, "?aplauso=1"));
}

export async function deleteApplauseAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const actor = await getMemberActor();
  if (!actor) redirect(`/ingresar?next=${encodeURIComponent(back(slug))}`);
  try {
    await deleteApplauseAs(await actorContext(actor), idSchema.parse(formData.get("id")));
  } catch (error) {
    if (error instanceof DomainError)
      redirect(back(slug, `?error=${encodeURIComponent(error.message)}`));
    throw error;
  }
  revalidatePath(back(slug));
  redirect(back(slug));
}
