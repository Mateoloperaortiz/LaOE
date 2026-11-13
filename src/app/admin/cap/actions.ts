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
  assignCompanionAs,
  FOLLOW_UP_KINDS,
  questionsFromText,
  saveCapEntryAs,
  saveTemplateAs,
} from "@/modules/permanence";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// La bitácora del CAP (ADR-197 regla 4): asignar acompañantes, escribir el plan del mes o una nota de
// reunión, y cambiar las preguntas de los formatos. El dominio comprueba quién puede; la acción lee el
// formulario y vuelve con lo que pasó.

const ID = /^[a-z0-9-]{10,40}$/;
const SLUG = /^[a-z0-9-]{1,60}$/;

async function run(back: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(withQuery(back, { error: error instanceof DomainError ? error.message : t("T-260") }));
  }
  revalidatePath("/admin/cap", "layout");
  redirect(withQuery(back, { guardado: "1" }));
}

export async function assignCompanionAction(formData: FormData): Promise<void> {
  const roles = await requireAdminAreaRoles("/admin/cap");
  const committeeId = formText(formData, "committeeId");
  const personId = formText(formData, "personId");
  if (!ID.test(committeeId) || (personId && !ID.test(personId))) redirect("/admin/cap");
  const actor = await actorContext(roles.actor);
  await run("/admin/cap", () => assignCompanionAs(actor, committeeId, personId || null));
}

export async function saveCapEntryAction(formData: FormData): Promise<void> {
  const slug = formText(formData, "slug");
  if (!SLUG.test(slug)) redirect("/admin/cap");
  const back = `/admin/cap/${slug}`;
  const roles = await requireAdminAreaRoles(back);
  const actor = await actorContext(roles.actor);
  const kind = formText(formData, "kind") === "CAP_PLAN" ? "CAP_PLAN" : "CAP_MEETING";
  await run(back, () =>
    saveCapEntryAs(actor, {
      committeeId: formText(formData, "committeeId"),
      kind,
      ...(kind === "CAP_PLAN"
        ? { month: formText(formData, "month") }
        : { occurredOn: formText(formData, "occurredOn") }),
      answers: formData.getAll("answers").map((value) => String(value)),
    }),
  );
}

export async function saveTemplateAction(formData: FormData): Promise<void> {
  const roles = await requireAdminAreaRoles("/admin/cap/plantillas");
  const actor = await actorContext(roles.actor);
  await run("/admin/cap/plantillas", () =>
    saveTemplateAs(actor, {
      kind: z.enum(FOLLOW_UP_KINDS).parse(formText(formData, "kind")),
      roleCode: formText(formData, "roleCode") || null,
      questions: questionsFromText(String(formData.get("questions") ?? "")),
    }),
  );
}
