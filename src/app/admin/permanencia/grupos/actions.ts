"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { seedWorkCommitteesAs } from "@/modules/permanence";
import { getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

// Sembrar los comités de trabajo del término (ADR-036 regla 6): ADMIN; idempotente por código.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function seedWorkCommitteesAction(formData: FormData): Promise<void> {
  const termId = idSchema.parse(formData.get("termId"));
  const back = `/admin/permanencia/grupos?termId=${termId}`;
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
  let created = 0;
  try {
    created = await seedWorkCommitteesAs(
      { personId: actor.personId, ip: await clientIp() },
      termId,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`${back}&error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  const term = await getTerm(termId);
  revalidatePath("/admin/permanencia/grupos");
  redirect(`${back}&sembrados=${created}&termino=${encodeURIComponent(term?.code ?? "")}`);
}
