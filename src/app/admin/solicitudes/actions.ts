"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { decideRequestAs } from "@/modules/crm";
import { requireAdminActor, safeNextPath } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";

// Bandeja de solicitudes (ADR-037 regla 9): aprobar ejecuta el comando en la misma transacción;
// rechazar exige motivo. Vuelve a donde estaba (la bandeja o la Persona 360).

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function withQuery(base: string, extra: Record<string, string>): string {
  const query = new URLSearchParams(extra).toString();
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}

export async function decideRequestAction(formData: FormData): Promise<void> {
  const requestId = idSchema.parse(formData.get("requestId"));
  const decision = text(formData, "decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  const returnTo = safeNextPath(
    formData.get("returnTo"),
    `/admin/solicitudes?solicitud=${requestId}`,
  );
  const actor = await requireAdminActor(returnTo);
  try {
    await decideRequestAs({ personId: actor.personId }, requestId, {
      decision,
      reason: text(formData, "reason") || undefined,
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
