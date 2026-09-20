"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { decideRequestAs } from "@/modules/crm";
import { requireAdminActor, safeNextPath } from "@/modules/identity";
import { DomainError } from "@/shared/lib/errors";

// Bandeja de solicitudes (ADR-037 regla 9): aprobar ejecuta el comando en la misma transacción;
// rechazar exige motivo. Vuelve a donde estaba (la bandeja o la Persona 360).

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function decideRequestAction(formData: FormData): Promise<void> {
  const requestId = idSchema.parse(formData.get("requestId"));
  const decision = formText(formData, "decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  const returnTo = safeNextPath(
    formData.get("returnTo"),
    `/admin/solicitudes?solicitud=${requestId}`,
  );
  const actor = await requireAdminActor(returnTo);
  try {
    await decideRequestAs(await actorContext(actor), requestId, {
      decision,
      reason: formText(formData, "reason") || undefined,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(returnTo, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/solicitudes");
  revalidatePath("/admin/personas");
  redirect(withQuery(returnTo, { decidida: decision }));
}
