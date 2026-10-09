"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { formText } from "@/app/_lib/form";
import { createCompetitionAs } from "@/modules/competition";
import { requireAdminActor } from "@/modules/identity";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { clientIp } from "@/shared/lib/request";

// Crear una competencia es de ADMIN (ADR-089 regla 2); el dominio lo vuelve a exigir.
export async function createCompetitionAction(form: FormData): Promise<void> {
  const actor = await requireAdminActor("/admin/the-games");
  let target = "/admin/the-games";
  try {
    const { id } = await createCompetitionAs(
      { personId: actor.personId, isAdmin: actor.isAdmin, ip: await clientIp() },
      {
        editionId: formText(form, "editionId"),
        slug: formText(form, "slug"),
        name: formText(form, "name"),
        isRehearsal: form.get("isRehearsal") === "on",
      },
    );
    target = `/admin/the-games/${id}`;
  } catch (error) {
    // Solo lo que rechazan el dominio o la validación vuelve como aviso. Un fallo interno no es un
    // error de validación: sigue su camino, como en las demás actions (ADR-118 regla 24).
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) {
      throw error;
    }
    const message = error instanceof DomainError ? error.message : t("T-260");
    target = `/admin/the-games?${new URLSearchParams({ error: message })}`;
  }
  redirect(target);
}
