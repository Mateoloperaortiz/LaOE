"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { adjustRequirementAs, recomputeCommitteeAssembly } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";

// Ajuste individual del requisito de asambleas (ADR-024, ADR-035 regla 12): ADMIN con motivo.

const schema = z.object({
  termId: z.string().regex(/^[a-z0-9-]+$/),
  personId: z.string().regex(/^[a-z0-9-]+$/),
  requiredOrdinary: z.coerce.number().int().min(0).max(10),
  requiresBoardElection: z.boolean(),
  requiresRunoff: z.boolean(),
  reason: z.string().trim().max(500),
});

function checked(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

export async function adjustRequirementAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    termId: formData.get("termId"),
    personId: formData.get("personId"),
    requiredOrdinary: formData.get("requiredOrdinary"),
    requiresBoardElection: checked(formData, "requiresBoardElection"),
    requiresRunoff: checked(formData, "requiresRunoff"),
    reason: formData.get("reason"),
  });
  const termId = typeof formData.get("termId") === "string" ? String(formData.get("termId")) : "";
  const back = `/admin/asambleas?termId=${encodeURIComponent(termId)}`;
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
  if (!parsed.success) {
    redirect(`${back}&error=${encodeURIComponent("T-260")}`);
  }
  try {
    await adjustRequirementAs(await actorContext(actor), parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(
        `${back}&accion=ajustar&personId=${parsed.data.personId}&error=${encodeURIComponent(error.message)}`,
      );
    }
    throw error;
  }
  revalidatePath("/admin/asambleas");
  redirect(`${back}&guardado=${encodeURIComponent(parsed.data.personId)}`);
}

// Representación por comité (ADR-060 regla 7): dato derivado; ADMIN puede recalcularlo a pedido.
const recomputeSchema = z.object({
  occasionId: z.string().regex(/^[a-z0-9-]+$/),
  termId: z.string().regex(/^[a-z0-9-]+$/),
});

export async function recomputeRepresentationAction(formData: FormData): Promise<void> {
  const parsed = recomputeSchema.safeParse({
    occasionId: formData.get("occasionId"),
    termId: formData.get("termId"),
  });
  const back = `/admin/asambleas?termId=${encodeURIComponent(parsed.success ? parsed.data.termId : "")}`;
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
  if (!parsed.success) {
    redirect(`${back}&error=${encodeURIComponent("T-260")}`);
  }
  await recomputeCommitteeAssembly(parsed.data.occasionId);
  revalidatePath("/admin/asambleas");
  redirect(back);
}
