"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { listAllCommittees } from "@/modules/people";
import {
  applyTemplateAs,
  commentTableAs,
  copyFromPreviousTermAs,
  createRuleAs,
  deleteRuleAs,
  lockAllCommitteeTablesAs,
  ruleInputSchema,
  setTableLockAs,
  type TableRef,
  updateRuleAs,
} from "@/modules/permanence";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { clientIp } from "@/shared/lib/request";
import { ruleInputFromForm } from "../_ui/reglas";

// Editor de reglas de GH (ADR-036 regla 3): ADMIN edita cualquier tabla, salta el bloqueo, comenta y bloquea.
// Editar y borrar declaran la tabla que muestra la página; un criterio de otra responde T-032 (ADR-072).

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function base(termId: string, committeeSlug: string): string {
  const query = new URLSearchParams({ termId });
  if (committeeSlug) {
    query.set("comite", committeeSlug);
  }
  return `/admin/permanencia/reglas?${query.toString()}`;
}

async function adminFor(returnTo: string) {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  return { personId: actor.personId, ip: await clientIp() };
}

function refFrom(formData: FormData): { ref: TableRef; back: string } {
  const termId = idSchema.parse(text(formData, "termId"));
  const committeeId = text(formData, "committeeId");
  const slug = text(formData, "comite");
  return {
    ref: {
      termId,
      scope: committeeId ? "COMMITTEE" : "GENERAL",
      committeeId: committeeId ? idSchema.parse(committeeId) : null,
    },
    back: base(termId, slug),
  };
}

function failed(back: string, error: unknown, extra = ""): never {
  if (error instanceof DomainError) {
    redirect(`${back}${extra}&error=${encodeURIComponent(error.message)}`);
  }
  throw error;
}

export async function saveRuleAction(formData: FormData): Promise<void> {
  const { ref, back } = refFrom(formData);
  const id = text(formData, "id");
  const panel = id ? `&accion=editar&regla=${id}` : "&accion=nueva";
  const actor = await adminFor(back);
  const parsed = ruleInputSchema.safeParse(ruleInputFromForm(formData, ref.committeeId !== null));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    redirect(`${back}${panel}&error=${encodeURIComponent(t("T-730", { detalle: detail }))}`);
  }
  try {
    if (id) {
      await updateRuleAs(actor, ref, idSchema.parse(id), parsed.data, { bypassLock: true });
    } else {
      await createRuleAs(actor, ref, parsed.data, { bypassLock: true });
    }
  } catch (error) {
    failed(back, error, panel);
  }
  revalidatePath("/admin/permanencia/reglas");
  redirect(`${back}&guardado=1`);
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const { ref, back } = refFrom(formData);
  const actor = await adminFor(back);
  try {
    await deleteRuleAs(actor, ref, idSchema.parse(text(formData, "id")), { bypassLock: true });
  } catch (error) {
    failed(back, error);
  }
  revalidatePath("/admin/permanencia/reglas");
  redirect(`${back}&guardado=1`);
}

export async function copyPreviousAction(formData: FormData): Promise<void> {
  const { ref, back } = refFrom(formData);
  const actor = await adminFor(back);
  try {
    await copyFromPreviousTermAs(actor, ref, { bypassLock: true });
  } catch (error) {
    failed(back, error);
  }
  revalidatePath("/admin/permanencia/reglas");
  redirect(`${back}&guardado=1`);
}

export async function applyTemplateAction(formData: FormData): Promise<void> {
  const { ref, back } = refFrom(formData);
  const actor = await adminFor(back);
  let n = 0;
  try {
    n = await applyTemplateAs(actor, ref, { bypassLock: true });
  } catch (error) {
    failed(back, error);
  }
  revalidatePath("/admin/permanencia/reglas");
  redirect(`${back}&guardado=1&referencia=${n}`);
}

export async function lockTableAction(formData: FormData): Promise<void> {
  const { ref, back } = refFrom(formData);
  const actor = await adminFor(back);
  const locked = text(formData, "locked") === "1";
  try {
    await setTableLockAs(actor, ref, locked);
  } catch (error) {
    failed(back, error);
  }
  revalidatePath("/admin/permanencia/reglas");
  redirect(`${back}&guardado=1`);
}

export async function commentTableAction(formData: FormData): Promise<void> {
  const { ref, back } = refFrom(formData);
  const actor = await adminFor(back);
  try {
    await commentTableAs(actor, ref, text(formData, "comment").slice(0, 1000));
  } catch (error) {
    failed(back, error, "&accion=comentar");
  }
  revalidatePath("/admin/permanencia/reglas");
  redirect(`${back}&guardado=1`);
}

export async function lockAllAction(formData: FormData): Promise<void> {
  const termId = idSchema.parse(text(formData, "termId"));
  const back = base(termId, "");
  const actor = await adminFor(back);
  const committees = await listAllCommittees();
  let n = 0;
  try {
    n = await lockAllCommitteeTablesAs(
      actor,
      termId,
      committees.map((item) => item.id),
    );
  } catch (error) {
    failed(back, error);
  }
  revalidatePath("/admin/permanencia/reglas");
  redirect(`${back}&guardado=1&bloqueadas=${n}`);
}
