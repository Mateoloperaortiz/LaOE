"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { requestRecomputeAs } from "@/modules/permanence";

// Recalcular ahora (ADR-036 regla 5): encola el recompute del término con su clave; el poller lo corre.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function recomputeAction(formData: FormData): Promise<void> {
  const termId = idSchema.parse(formData.get("termId"));
  const back = `/admin/permanencia/cumplimiento?termId=${termId}`;
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
  await requestRecomputeAs(await actorContext(actor), termId);
  revalidatePath("/admin/permanencia/cumplimiento");
  redirect(`${back}&recalculando=1`);
}
