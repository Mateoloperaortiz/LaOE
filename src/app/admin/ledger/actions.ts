"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { safeBack, withQuery } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { adjustPointsAs, reverseEntryAs } from "@/modules/participation";
import { DomainError } from "@/shared/lib/errors";

// Ajustes y reversiones del ledger (ADR-007, ADR-035 regla 9): solo ADMIN, siempre con motivo; vuelven
// al ledger (o a la Persona 360 si se abrió desde ahí) con `guardado=1` o con el error del dominio.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);
const adjustSchema = z.object({
  personId: idSchema,
  termId: idSchema,
  points: z.coerce.number().int(),
  reason: z.string().trim().max(500),
  back: z.string().optional(),
});

export async function adjustAction(formData: FormData): Promise<void> {
  const parsed = adjustSchema.safeParse({
    personId: formData.get("personId"),
    termId: formData.get("termId"),
    points: formData.get("points"),
    reason: formData.get("reason"),
    back: formText(formData, "back") || undefined,
  });
  const back = safeBack(parsed.success ? parsed.data.back : undefined, "/admin", "/admin/ledger");
  const returnTo = withQuery(back, { accion: "ajustar" });
  const actor = await requireAdminActor(returnTo);
  if (!parsed.success) {
    redirect(withQuery(back, { accion: "ajustar", error: "T-260" }));
  }
  const { personId, termId, points, reason } = parsed.data;
  try {
    await adjustPointsAs(await actorContext(actor), { personId, termId, points, reason });
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { accion: "ajustar", personId, error: error.message }));
    }
    throw error;
  }
  revalidatePath(back);
  redirect(withQuery(back, { guardado: "1" }));
}

export async function reverseAction(formData: FormData): Promise<void> {
  const entryId = idSchema.parse(formData.get("entryId"));
  const back = safeBack(formText(formData, "back") || undefined, "/admin", "/admin/ledger");
  const actor = await requireAdminActor(withQuery(back, { accion: "revertir", entrada: entryId }));
  try {
    await reverseEntryAs(await actorContext(actor), entryId, formText(formData, "reason"));
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { accion: "revertir", entrada: entryId, error: error.message }));
    }
    throw error;
  }
  revalidatePath(back);
  redirect(withQuery(back, { guardado: "1" }));
}
