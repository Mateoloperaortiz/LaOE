"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { safeBack, withQuery } from "@/app/_lib/search";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import { annulParticipationAs, reviewParticipationAs } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";

// Revisión de evidencias y anulación de premios (ADR-067 reglas 5 y 17): solo ADMIN; anular un
// premio entregado exige step-up (T-2586).

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function reviewAction(formData: FormData): Promise<void> {
  const participationId = idSchema.parse(formData.get("participationId"));
  const decision = z.enum(["APPROVE", "REJECT"]).parse(formData.get("decision"));
  const back = safeBack(
    formText(formData, "back") || undefined,
    "/admin",
    "/admin/gamificacion/revision",
  );
  const actor = await requireAdminActor(back);
  try {
    await reviewParticipationAs(await actorContext(actor), {
      participationId,
      decision,
      reason: formText(formData, "reason") || null,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/gamificacion");
  redirect(withQuery(back, { guardado: "1" }));
}

export async function annulAction(formData: FormData): Promise<void> {
  const participationId = idSchema.parse(formData.get("participationId"));
  const back = safeBack(
    formText(formData, "back") || undefined,
    "/admin",
    "/admin/gamificacion/revision",
  );
  const actor = await requireAdminActor(back);
  if (!hasRecentStepUp(actor)) {
    redirect(
      `/ingresar/paso?next=${encodeURIComponent(withQuery(back, { accion: "anular", participationId }))}`,
    );
  }
  try {
    await annulParticipationAs(
      await actorContext(actor),
      participationId,
      formText(formData, "reason"),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/gamificacion");
  redirect(withQuery(back, { guardado: "1" }));
}
