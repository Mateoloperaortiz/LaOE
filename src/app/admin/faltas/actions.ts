"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { recordSanctionAs, revokeSanctionAs, sanctionInputSchema } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Lo que registra y anula quien decide por la VP de Gestión Humana (ADR-196 regla 5). El dominio
// comprueba el cargo; la acción lee el formulario y vuelve a «Faltas» con lo que pasó.

const ID = /^[a-z0-9-]{10,40}$/;
const BASE = "/admin/faltas";

async function run(work: () => Promise<unknown>, keep: Record<string, string>) {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(
      withQuery(BASE, {
        ...keep,
        error: error instanceof DomainError ? error.message : t("T-260"),
      }),
    );
  }
  revalidatePath("/admin", "layout");
}

export async function recordGhSanctionAction(formData: FormData): Promise<void> {
  const roles = await requireAdminAreaRoles(BASE);
  const personId = formText(formData, "personId");
  const term = await getCurrentTerm();
  if (!ID.test(personId) || !term) redirect(withQuery(BASE, { nueva: "1", error: t("T-260") }));
  await run(
    async () =>
      recordSanctionAs(
        await actorContext(roles.actor),
        personId,
        sanctionInputSchema.parse({
          termId: term.id,
          kind: formText(formData, "kind"),
          cause: formText(formData, "cause"),
          reference: formText(formData, "reference") || null,
          occurredOn: formText(formData, "occurredOn"),
          suspendedUntil: formText(formData, "suspendedUntil") || null,
        }),
        { by: "GH" },
      ),
    { nueva: "1" },
  );
  redirect(withQuery(BASE, { guardado: "1" }));
}

export async function revokeGhSanctionAction(formData: FormData): Promise<void> {
  const roles = await requireAdminAreaRoles(BASE);
  const sanctionId = formText(formData, "sanctionId");
  const personId = formText(formData, "personId");
  if (!ID.test(sanctionId) || !ID.test(personId)) redirect(BASE);
  await run(
    async () =>
      revokeSanctionAs(
        await actorContext(roles.actor),
        personId,
        sanctionId,
        z.string().parse(formText(formData, "reason")),
        { by: "GH" },
      ),
    { sancion: sanctionId },
  );
  redirect(withQuery(BASE, { sancion: sanctionId, guardado: "1" }));
}
