"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCommitteeCapability } from "@/app/_authz/committee";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import {
  decideExcuseForCommitteeAs,
  grantRecognitionAs,
  recognitionInputSchema,
} from "@/modules/crm";
import { listInternalRoster, recordSanctionAs, sanctionInputSchema } from "@/modules/people";
import {
  applyTemplateAs,
  copyFromPreviousTermAs,
  createRuleAs,
  deleteRuleAs,
  leaderScoreInputSchema,
  ruleInputSchema,
  scoreCriterionAs,
  type TableRef,
  updateRuleAs,
} from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { ruleInputFromForm } from "../../../permanencia/_ui/reglas";

// Tabla de permanencia del comité (ADR-026, ADR-036 regla 3, ADR-058): quien tiene la capacidad
// PERMANENCE (ADMIN, líder técnico o la dirección por su cargo), sobre el término actual; solo ADMIN
// pasa por encima del bloqueo de GH. Cada comando recibe la tabla del comité y el dominio rechaza un
// criterio de otra (ADR-072).

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);
const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function back(slug: string, extra: Record<string, string> = {}): string {
  return withQuery(`/admin/comites/${slug}/permanencia`, extra);
}

async function leaderOf(slug: string, returnTo: string) {
  const access = await requireCommitteeCapability(slug, "PERMANENCE", returnTo);
  const term = await getCurrentTerm();
  if (!term) {
    redirect("/admin");
  }
  const ref: TableRef = {
    termId: term.id,
    scope: "COMMITTEE",
    committeeId: access.roster.committee.id,
  };
  return {
    actor: await actorContext(access.actor),
    editor: { bypassLock: access.isAdmin },
    ref,
  };
}

function failed(returnTo: string, error: unknown): never {
  if (error instanceof DomainError) {
    const separator = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${separator}error=${encodeURIComponent(error.message)}`);
  }
  throw error;
}

export async function saveCommitteeRuleAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const id = formText(formData, "id");
  const panel = id ? { accion: "editar", regla: id } : { accion: "nueva" };
  const returnTo = back(slug, panel);
  const { actor, editor, ref } = await leaderOf(slug, returnTo);
  const parsed = ruleInputSchema.safeParse(ruleInputFromForm(formData, true));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    redirect(`${returnTo}&error=${encodeURIComponent(t("T-730", { detalle: detail }))}`);
  }
  try {
    if (id) {
      await updateRuleAs(actor, ref, idSchema.parse(id), parsed.data, editor);
    } else {
      await createRuleAs(actor, ref, parsed.data, editor);
    }
  } catch (error) {
    failed(returnTo, error);
  }
  revalidatePath(`/admin/comites/${slug}/permanencia`);
  redirect(back(slug, { guardado: "1" }));
}

export async function deleteCommitteeRuleAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const { actor, editor, ref } = await leaderOf(slug, back(slug));
  try {
    await deleteRuleAs(actor, ref, idSchema.parse(formText(formData, "id")), editor);
  } catch (error) {
    failed(back(slug), error);
  }
  revalidatePath(`/admin/comites/${slug}/permanencia`);
  redirect(back(slug, { guardado: "1" }));
}

export async function copyCommitteeRulesAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const { actor, editor, ref } = await leaderOf(slug, back(slug));
  try {
    await copyFromPreviousTermAs(actor, ref, editor);
  } catch (error) {
    failed(back(slug), error);
  }
  revalidatePath(`/admin/comites/${slug}/permanencia`);
  redirect(back(slug, { guardado: "1" }));
}

export async function applyCommitteeTemplateAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const { actor, editor, ref } = await leaderOf(slug, back(slug));
  let n = 0;
  try {
    n = await applyTemplateAs(actor, ref, editor);
  } catch (error) {
    failed(back(slug), error);
  }
  revalidatePath(`/admin/comites/${slug}/permanencia`);
  redirect(back(slug, { guardado: "1", referencia: String(n) }));
}

// ── Puntajes del líder y destacado del mes (F4-T5) ───────────────────────────────────────────

export async function scoreAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const personId = idSchema.parse(formData.get("personId"));
  const ruleId = idSchema.parse(formData.get("ruleId"));
  const returnTo = back(slug, { accion: "puntaje", persona: personId, regla: ruleId });
  const { actor, ref } = await leaderOf(slug, returnTo);
  const roster = await listInternalRoster(slug);
  const member = roster?.members.find((item) => item.personId === personId);
  const parsed = leaderScoreInputSchema.safeParse({
    ruleId,
    personId,
    value: Number(formText(formData, "value")),
    note: formText(formData, "note"),
  });
  if (!parsed.success) {
    redirect(`${returnTo}&error=${encodeURIComponent(t("T-260"))}`);
  }
  try {
    await scoreCriterionAs(actor, ref, parsed.data, {
      personName: member?.fullName ?? personId,
      committeeName: roster?.committee.name ?? slug,
    });
  } catch (error) {
    failed(returnTo, error);
  }
  revalidatePath(`/admin/comites/${slug}/permanencia`);
  redirect(back(slug, { guardado: "1" }));
}

export async function recognizeAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const returnTo = back(slug, { accion: "destacado" });
  const { actor, ref } = await leaderOf(slug, returnTo);
  const roster = await listInternalRoster(slug);
  const parsed = recognitionInputSchema.safeParse({
    personId: formText(formData, "personId"),
    kind: "MEMBER_OF_MONTH",
    committeeId: ref.committeeId ?? undefined,
    termId: ref.termId,
    month: formText(formData, "month"),
  });
  if (!parsed.success || !roster?.members.some((item) => item.personId === parsed.data.personId)) {
    redirect(`${returnTo}&error=${encodeURIComponent(t("T-260"))}`);
  }
  let published = false;
  try {
    published = (await grantRecognitionAs(actor, parsed.data)).published;
  } catch (error) {
    failed(returnTo, error);
  }
  revalidatePath(`/admin/comites/${slug}/permanencia`);
  redirect(
    back(slug, {
      guardado: "1",
      destacado: published ? "publicado" : "registrado",
      persona: parsed.data.personId,
      mes: String(parsed.data.month ?? ""),
    }),
  );
}

// Excusas sobre las ocasiones del comité (ADR-060 regla 5): quien tiene PERMANENCE en el comité las
// acepta o rechaza; el dominio vuelve a comprobar que la ocasión sea de este comité.
export async function decideExcuseAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const requestId = idSchema.parse(formData.get("requestId"));
  const decision = formText(formData, "decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  const returnTo = back(slug);
  const access = await requireCommitteeCapability(slug, "PERMANENCE", returnTo);
  try {
    await decideExcuseForCommitteeAs(
      await actorContext(access.actor),
      requestId,
      access.roster.committee.id,
      { decision, reason: formText(formData, "reason") || undefined },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(returnTo);
  revalidatePath("/admin/solicitudes");
  redirect(back(slug, { guardado: "1", excusa: decision }));
}

// Faltas del comité (Regl. art. 69 par. 2; ADR-060 regla 6): quien tiene PERMANENCE registra una falta
// a un miembro de su comité; la suspensión explícita y la revocación quedan para GH. La action exige
// la capacidad y declara el alcance; a quién y con qué tipo lo decide el comando (ADR-072 regla 1 y
// ADR-112).
export async function recordCommitteeSanctionAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const personId = idSchema.parse(formData.get("personId"));
  const returnTo = back(slug);
  const access = await requireCommitteeCapability(slug, "PERMANENCE", returnTo);
  const term = await getCurrentTerm();
  if (!term) {
    redirect(back(slug, { error: t("T-032") }));
  }
  const scope = {
    by: "COMMITTEE",
    committeeId: access.roster.committee.id,
    termId: term.id,
  } as const;
  const parsed = sanctionInputSchema.safeParse({
    termId: scope.termId,
    kind: formText(formData, "kind"),
    cause: formText(formData, "cause"),
    reference: formText(formData, "reference") || null,
    occurredOn: formText(formData, "occurredOn"),
    suspendedUntil: null,
    committeeId: scope.committeeId,
  });
  if (!parsed.success) {
    redirect(back(slug, { error: t("T-260") }));
  }
  try {
    await recordSanctionAs(await actorContext(access.actor), personId, parsed.data, scope);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { error: error.message }));
    }
    throw error;
  }
  revalidatePath(returnTo);
  redirect(back(slug, { guardado: "1", sancion: "1" }));
}
