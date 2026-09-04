"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { markOnboardingStepAs } from "@/modules/crm";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";

// Acciones del inicio de Mi OE: marcar un paso del onboarding como hecho.

const stepSchema = z.object({
  termId: z.string().trim().min(1),
  stepKey: z.string().trim().min(1).max(40),
});

export async function markStepAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  if (!actor) {
    redirect("/ingresar?next=%2Fapp");
  }
  const parsed = stepSchema.safeParse({
    termId: formData.get("termId"),
    stepKey: formData.get("stepKey"),
  });
  if (parsed.success) {
    try {
      await markOnboardingStepAs(actor, parsed.data.termId, parsed.data.stepKey);
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }
    }
  }
  revalidatePath("/app");
  redirect("/app");
}
