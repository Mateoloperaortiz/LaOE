"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { withQuery } from "@/app/_lib/search";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import { resumeReconciliationAs, startReconciliationAs } from "@/modules/participation";
import { DomainError } from "@/shared/lib/errors";

// Conciliación histórica (ADR-067 reglas 13 y 16): Simular no escribe; Aplicar escribe logros
// históricos y por eso exige step-up — como el cierre de puntos, la confirmación vive en la
// página con `accion=aplicar` y acá se vuelve a verificar.

const BACK = "/admin/gamificacion";

const modeSchema = z.enum(["DRY_RUN", "APPLY"]);

export async function startReconciliationAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor(BACK);
  const parsed = modeSchema.safeParse(formData.get("mode"));
  if (!parsed.success) {
    redirect(withQuery(BACK, { error: "T-260" }));
  }
  const mode = parsed.data;
  if (mode === "APPLY" && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(withQuery(BACK, { accion: "aplicar" }))}`);
  }
  try {
    await startReconciliationAs(await actorContext(actor), mode);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(BACK, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(BACK);
}

export async function resumeReconciliationAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor(BACK);
  const runId = z.string().trim().min(1).max(80).safeParse(formData.get("runId"));
  if (!runId.success) {
    redirect(withQuery(BACK, { error: "T-260" }));
  }
  try {
    await resumeReconciliationAs(await actorContext(actor), runId.data);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(BACK, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(BACK);
}
