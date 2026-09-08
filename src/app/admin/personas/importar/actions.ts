"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  assertAdmin,
  ForbiddenError,
  getActor,
  grantPermissionAs,
  hasRecentStepUp,
} from "@/modules/identity";
import {
  applyRosterImportAs,
  discardRosterImportAs,
  getRosterPreview,
  ROSTER_COLUMNS,
  type RosterColumn,
  recordLeaderGrantsAs,
  remapRosterPreviewAs,
} from "@/modules/people";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { parseProposalIndexes, proposalSelectionVersion } from "./selection";

// Acciones del asistente del roster (ADR-034): corregir el mapeo, aplicar con step-up y descartar. Los
// permisos de líder se otorgan después del commit, uno por uno, con el comando de identity.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

async function requireAdmin(returnTo: string) {
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
  return actor;
}

function jobUrl(jobId: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams({ job: jobId, ...extra });
  return `/admin/personas/importar?${query.toString()}`;
}

function isColumn(value: string): value is RosterColumn {
  return (ROSTER_COLUMNS as readonly string[]).includes(value);
}

export async function remapAction(formData: FormData): Promise<void> {
  const jobId = idSchema.parse(formData.get("jobId"));
  const actor = await requireAdmin(jobUrl(jobId));
  const count = Number.parseInt(String(formData.get("columns") ?? "0"), 10) || 0;
  const mapping: Array<RosterColumn | null> = [];
  for (let index = 0; index < count; index += 1) {
    const value = String(formData.get(`col_${index}`) ?? "");
    mapping.push(isColumn(value) ? value : null);
  }
  try {
    await remapRosterPreviewAs({ personId: actor.personId }, jobId, mapping);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(jobUrl(jobId, { paso: "columnas", error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/personas/importar");
  redirect(jobUrl(jobId, { paso: "revision" }));
}

export async function discardAction(formData: FormData): Promise<void> {
  const jobId = idSchema.parse(formData.get("jobId"));
  const actor = await requireAdmin(jobUrl(jobId));
  try {
    await discardRosterImportAs({ personId: actor.personId }, jobId);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(jobUrl(jobId, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/sistema/importaciones");
  redirect("/admin/sistema/importaciones");
}

/** Aplicar exige un código nuevo (step-up): escribe datos personales y puede otorgar permisos. */
export async function applyAction(formData: FormData): Promise<void> {
  const jobId = idSchema.parse(formData.get("jobId"));
  const selectedIndexes = parseProposalIndexes(formData.getAll("proposal").join(","));
  const submittedVersion = String(formData.get("proposalVersion") ?? "");
  const selectionParams = {
    paso: "confirmacion",
    seleccion: selectedIndexes.join(","),
    revision: /^[a-f0-9]{64}$/.test(submittedVersion) ? submittedVersion : "",
  };
  const returnTo = jobUrl(jobId, selectionParams);
  const actor = await requireAdmin(returnTo);
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  const preview = await getRosterPreview(jobId);
  if (!preview || proposalSelectionVersion(preview.proposals) !== submittedVersion) {
    redirect(jobUrl(jobId, { paso: "confirmacion", seleccion: "", error: t("T-1490") }));
  }
  const accepted = new Set(
    selectedIndexes.flatMap((index) => {
      const proposal = preview.proposals[index];
      return proposal ? [`${proposal.email}|${proposal.committeeId}`] : [];
    }),
  );
  let summary: Awaited<ReturnType<typeof applyRosterImportAs>>;
  try {
    summary = await applyRosterImportAs({ personId: actor.personId }, jobId);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(jobUrl(jobId, { ...selectionParams, error: error.message }));
    }
    throw error;
  }
  const granted: string[] = [];
  const failed: string[] = [];
  for (const proposal of summary.proposals) {
    const key = `${proposal.email}|${proposal.committeeId}`;
    if (!accepted.has(key)) {
      continue;
    }
    try {
      await grantPermissionAs(
        { personId: actor.personId },
        { email: proposal.email, code: "COMMITTEE_LEADER", committeeId: proposal.committeeId },
      );
      granted.push(`${proposal.personName} · ${proposal.committeeName}`);
    } catch (error) {
      if (error instanceof DomainError) {
        failed.push(`${proposal.personName} · ${proposal.committeeName}: ${error.message}`);
      } else {
        throw error;
      }
    }
  }
  await recordLeaderGrantsAs({ personId: actor.personId }, jobId, { granted, failed });
  revalidatePath("/admin/personas");
  revalidatePath("/admin/personas/importar");
  redirect(jobUrl(jobId, { aplicada: "1" }));
}
