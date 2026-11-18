"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import {
  changeEventApprovalRiskAs,
  decideContractAs,
  decideEventApprovalAs,
  decideFinancialApprovalAs,
  RISK_LEVELS,
  returnEventApprovalAs,
} from "@/modules/finance";
import { decideCandidacyAs, decideSanctionAs } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Decidir un aval (ADR-195 reglas 1 y 2). El dominio comprueba que quien decide tenga el cargo; la
// acción solo lee el formulario y vuelve a la pantalla con el aval abierto y lo que pasó.

import { AVAL_KINDS, avalParam } from "./_ui/kinds";

const ID = /^[a-z0-9-]{10,40}$/;

export async function decideAvalAction(formData: FormData): Promise<void> {
  const roles = await requireAdminAreaRoles("/admin/avales");
  const id = formText(formData, "avalId");
  if (!ID.test(id)) redirect("/admin/avales");
  const volver = `/admin/avales`;
  // Cada tipo de aval vuelve con su parámetro: el aval de evento y la falta por avalar (ADR-196).
  const kind = AVAL_KINDS.find((value) => value === formText(formData, "tipo"));
  if (!kind) redirect(volver);
  const open = { [avalParam(kind)]: id };
  try {
    const actor = await actorContext(roles.actor);
    const input = {
      decision: z.enum(["APPROVED", "REJECTED"]).parse(formText(formData, "decision")),
      note: formText(formData, "note"),
    };
    const decide = {
      EVENT: decideEventApprovalAs,
      SANCTION: decideSanctionAs,
      CANDIDACY: decideCandidacyAs,
      TRANSFER: decideFinancialApprovalAs,
      EXTRAORDINARY: decideFinancialApprovalAs,
      PURCHASE: decideFinancialApprovalAs,
      CONTRACT: decideContractAs,
    };
    await decide[kind](actor, id, input);
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(
      withQuery(volver, {
        ...open,
        error: error instanceof DomainError ? error.message : t("T-260"),
      }),
    );
  }
  revalidatePath("/admin", "layout");
  redirect(withQuery(volver, { ...open, guardado: "1" }));
}

/** Devolver con comentarios o cambiar el semáforo de un aval de evento (ADR-197 reglas 1 y 2). */
async function runEventApproval(
  formData: FormData,
  work: (actor: Awaited<ReturnType<typeof actorContext>>, id: string) => Promise<void>,
): Promise<void> {
  const roles = await requireAdminAreaRoles("/admin/avales");
  const id = formText(formData, "avalId");
  if (!ID.test(id)) redirect("/admin/avales");
  try {
    await work(await actorContext(roles.actor), id);
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(
      withQuery("/admin/avales", {
        aval: id,
        error: error instanceof DomainError ? error.message : t("T-260"),
      }),
    );
  }
  revalidatePath("/admin", "layout");
  redirect(withQuery("/admin/avales", { aval: id, guardado: "1" }));
}

export async function returnAvalAction(formData: FormData): Promise<void> {
  await runEventApproval(formData, (actor, id) =>
    returnEventApprovalAs(actor, id, { note: formText(formData, "note") }),
  );
}

export async function changeRiskAction(formData: FormData): Promise<void> {
  await runEventApproval(formData, (actor, id) =>
    changeEventApprovalRiskAs(actor, id, {
      riskLevel: z.enum(RISK_LEVELS).parse(formText(formData, "riskLevel")),
      note: formText(formData, "note"),
    }),
  );
}
