"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { decideEventApprovalAs } from "@/modules/finance";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Decidir un aval (ADR-195 reglas 1 y 2). El dominio comprueba que quien decide tenga el cargo; la
// acción solo lee el formulario y vuelve a la pantalla con el aval abierto y lo que pasó.

const ID = /^[a-z0-9-]{10,40}$/;

export async function decideAvalAction(formData: FormData): Promise<void> {
  const roles = await requireAdminAreaRoles("/admin/avales");
  const id = formText(formData, "avalId");
  if (!ID.test(id)) redirect("/admin/avales");
  const volver = `/admin/avales`;
  try {
    await decideEventApprovalAs(await actorContext(roles.actor), id, {
      decision: z.enum(["APPROVED", "REJECTED"]).parse(formText(formData, "decision")),
      note: formText(formData, "note"),
    });
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(
      withQuery(volver, {
        aval: id,
        error: error instanceof DomainError ? error.message : t("T-260"),
      }),
    );
  }
  revalidatePath("/admin", "layout");
  redirect(withQuery(volver, { aval: id, guardado: "1" }));
}
