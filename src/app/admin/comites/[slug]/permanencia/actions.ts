"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertLeader, ForbiddenError, getActor } from "@/modules/identity";
import { listInternalRoster } from "@/modules/people";
import {
  applyTemplateAs,
  copyFromPreviousTermAs,
  createRuleAs,
  deleteRuleAs,
  ruleInputSchema,
  type TableRef,
  updateRuleAs,
} from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { clientIp } from "@/shared/lib/request";
import { ruleInputFromForm } from "../../../permanencia/_ui/reglas";

// Tabla de permanencia del comité (ADR-026, ADR-036 regla 3): ADMIN o el líder del comité, sobre el
// término actual; el líder no pasa por encima del bloqueo de GH.

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);
const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function back(slug: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(extra).toString();
  return `/admin/comites/${slug}/permanencia${query ? `?${query}` : ""}`;
}

async function leaderOf(slug: string, returnTo: string) {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  const roster = await listInternalRoster(slug);
  const term = await getCurrentTerm();
  if (!roster || !term) {
    redirect("/admin");
  }
  try {
    assertLeader(actor, roster.committee.id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  const ref: TableRef = { termId: term.id, scope: "COMMITTEE", committeeId: roster.committee.id };
  return {
    actor: { personId: actor.personId, ip: await clientIp() },
    editor: { bypassLock: actor.isAdmin },
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
  const id = text(formData, "id");
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
      await updateRuleAs(actor, idSchema.parse(id), parsed.data, editor);
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
  const { actor, editor } = await leaderOf(slug, back(slug));
  try {
    await deleteRuleAs(actor, idSchema.parse(text(formData, "id")), editor);
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
