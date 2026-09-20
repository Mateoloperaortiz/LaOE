"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireGroupOperator } from "@/app/_authz/group";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { findMembersByEmails } from "@/modules/people";
import {
  addMembersAs,
  applyMemberImportAs,
  previewMemberImport,
  removeMemberAs,
  setEvaluatorsAs,
} from "@/modules/permanence";
import type { ImportState } from "@/modules/permanence/components/ImportadorGrupo";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Operar un grupo (ADR-036 regla 6): el líder del grupo o ADMIN agrega y quita miembros e importa
// desde CSV; los evaluadores los fija ADMIN.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);
const MAX_CSV_BYTES = 1024 * 1024;

function back(groupId: string, extra: Record<string, string> = {}): string {
  return withQuery(`/admin/permanencia/grupos/${groupId}`, extra);
}

function failed(groupId: string, error: unknown): never {
  if (error instanceof DomainError) {
    redirect(back(groupId, { error: error.message }));
  }
  throw error;
}

export async function addMemberAction(formData: FormData): Promise<void> {
  const groupId = idSchema.parse(formData.get("groupId"));
  const personId = idSchema.parse(formData.get("personId"));
  const { actor } = await requireGroupOperator(groupId, back(groupId));
  try {
    await addMembersAs(actor, groupId, [personId]);
  } catch (error) {
    failed(groupId, error);
  }
  revalidatePath(`/admin/permanencia/grupos/${groupId}`);
  redirect(back(groupId, { guardado: "1" }));
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const groupId = idSchema.parse(formData.get("groupId"));
  const personId = idSchema.parse(formData.get("personId"));
  const { actor } = await requireGroupOperator(groupId, back(groupId));
  try {
    await removeMemberAs(actor, groupId, personId);
  } catch (error) {
    failed(groupId, error);
  }
  revalidatePath(`/admin/permanencia/grupos/${groupId}`);
  redirect(back(groupId, { guardado: "1" }));
}

export async function setEvaluatorsAction(formData: FormData): Promise<void> {
  const groupId = idSchema.parse(formData.get("groupId"));
  const { actor, isAdmin } = await requireGroupOperator(groupId, back(groupId));
  if (!isAdmin) {
    redirect("/app");
  }
  const emails = formText(formData, "emails")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const found = await findMembersByEmails(emails);
  const unknown = emails.filter((email) => !found.has(email));
  if (unknown.length > 0) {
    redirect(back(groupId, { error: t("T-754", { n: 0, m: 0, k: 0, j: unknown.length }) }));
  }
  try {
    await setEvaluatorsAs(
      actor,
      groupId,
      [...found.values()].map((person) => person.id),
    );
  } catch (error) {
    failed(groupId, error);
  }
  revalidatePath(`/admin/permanencia/grupos/${groupId}`);
  redirect(back(groupId, { guardado: "1" }));
}

/** Dos pasos en el cliente: `preview` lee el archivo y clasifica; `apply` agrega las filas nuevas. */
export async function importAction(
  previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const groupId = idSchema.parse(formData.get("groupId"));
  const { actor } = await requireGroupOperator(groupId, back(groupId));
  const step = formText(formData, "step");
  const outcomes = (state: Awaited<ReturnType<typeof previewMemberImport>>) => ({
    csv: "",
    rows: state.rows.map((row) => ({ email: row.email, name: row.name, outcome: row.outcome })),
    summary: {
      add: state.add,
      already: state.already,
      inactive: state.inactive,
      unknown: state.unknown,
    },
    error: null,
    applied: null,
  });
  try {
    if (step === "preview") {
      const file = formData.get("archivo");
      if (!(file instanceof File) || file.size === 0 || file.size > MAX_CSV_BYTES) {
        return { ...previous, error: t("T-755"), summary: null, rows: [] };
      }
      const csv = await file.text();
      const preview = await previewMemberImport(groupId, csv);
      return { ...outcomes(preview), csv };
    }
    const csv = formText(formData, "csv");
    const result = await applyMemberImportAs(actor, groupId, csv);
    revalidatePath(`/admin/permanencia/grupos/${groupId}`);
    return { ...outcomes(result), applied: result.added };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ...previous, error: error.message, summary: null, rows: [] };
    }
    throw error;
  }
}
