"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, ForbiddenError, getActor, hasRecentStepUp } from "@/modules/identity";
import { resumeReconciliationAs, startReconciliationAs } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

// Conciliación histórica (ADR-067 reglas 13 y 16): Simular no escribe; Aplicar escribe logros
// históricos y por eso exige step-up — como el cierre de puntos, la confirmación vive en la
// página con `accion=aplicar` y acá se vuelve a verificar.

const BACK = "/admin/gamificacion";

const modeSchema = z.enum(["DRY_RUN", "APPLY"]);

function withQuery(extra: Record<string, string>): string {
  const url = new URL(BACK, "http://local");
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

async function requireAdmin(returnTo: string) {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  return actor;
}

export async function startReconciliationAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin(BACK);
  const parsed = modeSchema.safeParse(formData.get("mode"));
  if (!parsed.success) {
    redirect(withQuery({ error: "T-260" }));
  }
  const mode = parsed.data;
  if (mode === "APPLY" && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(withQuery({ accion: "aplicar" }))}`);
  }
  try {
    await startReconciliationAs({ personId: actor.personId, ip: await clientIp() }, mode);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery({ error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(BACK);
}

export async function resumeReconciliationAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin(BACK);
  const runId = z.string().trim().min(1).max(80).safeParse(formData.get("runId"));
  if (!runId.success) {
    redirect(withQuery({ error: "T-260" }));
  }
  try {
    await resumeReconciliationAs({ personId: actor.personId, ip: await clientIp() }, runId.data);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery({ error: error.message }));
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(BACK);
}
