"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formText } from "@/app/_lib/form";
import { evaluateAs, evaluationInputSchema, getGroup } from "@/modules/permanence";
import { DomainError } from "@/shared/admin-kit";
import { requireEvaluator } from "../authz";

// Evaluar a un miembro de un grupo (ADR-028, ADR-036 regla 6): evaluador dentro de la ventana o ADMIN.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function evaluateAction(formData: FormData): Promise<void> {
  const groupId = idSchema.parse(formData.get("groupId"));
  const group = await getGroup(groupId);
  const termId = group?.termId ?? idSchema.parse(formData.get("termId"));
  const back = `/admin/permanencia/evaluaciones?termId=${termId}`;
  const { actor, isAdmin } = await requireEvaluator(termId, back);
  const parsed = evaluationInputSchema.safeParse({
    groupId,
    personId: formText(formData, "personId"),
    evaluation: formText(formData, "evaluation"),
    note: formText(formData, "note"),
  });
  if (!parsed.success) {
    redirect(`${back}&error=${encodeURIComponent("T-260")}`);
  }
  try {
    await evaluateAs(actor, parsed.data, { isAdmin });
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`${back}&error=${encodeURIComponent(error.message)}&grupo=${groupId}`);
    }
    throw error;
  }
  revalidatePath("/admin/permanencia/evaluaciones");
  redirect(`${back}&guardado=1&grupo=${groupId}`);
}
