"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { assertAdmin, ForbiddenError, getActor, hasRecentStepUp } from "@/modules/identity";
import { closeTermPointsAs } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";

// Cierre de puntos del término (ADR-004, ADR-035 regla 13): ADMIN con step-up; sin reapertura.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function closeTermAction(formData: FormData): Promise<void> {
  const termId = idSchema.parse(formData.get("termId"));
  const back = `/admin/cierre?termId=${termId}`;
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(back)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(`${back}&accion=cerrar`)}`);
  }
  try {
    await closeTermPointsAs(await actorContext(actor), termId);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`${back}&error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath("/admin/cierre");
  redirect(`${back}&guardado=1`);
}
