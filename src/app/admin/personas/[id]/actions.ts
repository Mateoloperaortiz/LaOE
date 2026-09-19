"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext, sessionActorContext } from "@/app/_lib/actor";
import { formOptional, formText } from "@/app/_lib/form";
import {
  addNoteAs,
  completeTaskAs,
  createTaskAs,
  editNoteAs,
  grantRecognitionAs,
  recognitionInputSchema,
  taskInputSchema,
} from "@/modules/crm";
import {
  ForbiddenError,
  grantPermissionAs,
  hasRecentStepUp,
  requireAdminActor,
  rotateCarnetTokenAs,
} from "@/modules/identity";
import {
  addAppointmentAs,
  admitInputSchema,
  admitPersonAs,
  anonymizePersonAs,
  appointmentInputSchema,
  type CommitteeMembershipInput,
  changeMembershipStatusAs,
  changeStatusSchema,
  committeeMembershipInputSchema,
  endMembershipAs,
  endMembershipSchema,
  getPersonRecord,
  listCommitteeRoles,
  personInputSchema,
  probationInputSchema,
  reactivateMembershipAs,
  reactivateSchema,
  recordConsentAs,
  recordSanctionAs,
  removeAppointmentAs,
  revokeConsentAs,
  revokeSanctionAs,
  sanctionInputSchema,
  setCommitteeMembershipsAs,
  setPersonTagsAs,
  setProbationAs,
  updatePersonAs,
} from "@/modules/people";
import { grantManualCreditAs, manualCreditInputSchema } from "@/modules/permanence";
import { getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { clientIp } from "@/shared/lib/request";

// Acciones de la Persona 360 (ADR-034): viven en src/app porque componen identity (actor, step-up,
// permisos), people y crm, y people no puede importar identity. Cada una exige ADMIN, parsea con
// Zod y vuelve a la ficha con `guardado=1` o con el error del dominio.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);
const MAX_ROWS = 3;

async function personUrl(
  id: string,
  tab: string,
  extra: Record<string, string> = {},
): Promise<string> {
  const query = new URLSearchParams({ pestana: tab, ...extra });
  return `/admin/personas/${id}?${query.toString()}`;
}

function checked(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

async function fail(id: string, tab: string, accion: string, message: string): Promise<never> {
  redirect(await personUrl(id, tab, { accion, error: message }));
}

/** Corre el comando y vuelve a la pestaña; un DomainError vuelve al panel con su mensaje. */
async function run(
  id: string,
  tab: string,
  accion: string,
  command: () => Promise<void>,
): Promise<never> {
  try {
    await command();
  } catch (error) {
    if (error instanceof DomainError) {
      await fail(id, tab, accion, error.message);
    }
    throw error;
  }
  revalidatePath(`/admin/personas/${id}`);
  redirect(await personUrl(id, tab, { guardado: "1" }));
}

export async function updatePersonAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "datos"));
  const parsed = personInputSchema.safeParse({
    firstName: formText(formData, "firstName"),
    lastName: formText(formData, "lastName"),
    email: formText(formData, "email"),
    kind: formText(formData, "kind") || "STUDENT",
    preferredName: formOptional(formData, "preferredName"),
    phone: formOptional(formData, "phone"),
    personalEmail: formOptional(formData, "personalEmail"),
    program: formOptional(formData, "program"),
    ...(formData.has("documentType") ? { documentType: formText(formData, "documentType") } : {}),
    ...(formData.has("documentNumber")
      ? { documentNumber: formText(formData, "documentNumber") }
      : {}),
    ...(formData.has("epikId") ? { epikId: formText(formData, "epikId") } : {}),
    ...(formData.has("birthDate") ? { birthDate: formText(formData, "birthDate") } : {}),
  });
  if (!parsed.success) {
    await fail(id, "datos", "editar", t("T-260"));
    return;
  }
  await run(id, "datos", "editar", async () =>
    updatePersonAs(await actorContext(actor), id, parsed.data),
  );
}

export async function admitAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  const parsed = admitInputSchema.safeParse({
    termId: formText(formData, "termId"),
    committeeIds: formData
      .getAll("committeeIds")
      .filter((item): item is string => typeof item === "string" && item !== ""),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "alta", t("T-451", { min: 1, max: MAX_ROWS }));
    return;
  }
  await run(id, "membresia", "alta", async () => {
    await admitPersonAs(await actorContext(actor), id, parsed.data);
  });
}

export async function changeStatusAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  const parsed = changeStatusSchema.safeParse({
    to: formText(formData, "to"),
    reason: formText(formData, "reason"),
    leaveUntil: formOptional(formData, "leaveUntil"),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "estado", t("T-260"));
    return;
  }
  await run(id, "membresia", "estado", async () =>
    changeMembershipStatusAs(await actorContext(actor), id, parsed.data),
  );
}

export async function endMembershipAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  const parsed = endMembershipSchema.safeParse({
    endReason: formText(formData, "endReason"),
    note: formOptional(formData, "note"),
    memorialConsent: checked(formData, "memorialConsent"),
    contactConsent: checked(formData, "contactConsent"),
    personalEmail: formOptional(formData, "personalEmail"),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "baja", t("T-260"));
    return;
  }
  const ip = await clientIp();
  await run(id, "membresia", "baja", async () => {
    await endMembershipAs({ personId: actor.personId, ip }, id, parsed.data);
  });
}

export async function reactivateAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  const parsed = reactivateSchema.safeParse({
    email: formOptional(formData, "email"),
    reason: formOptional(formData, "reason"),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "reactivar", t("T-260"));
    return;
  }
  await run(id, "membresia", "reactivar", async () =>
    reactivateMembershipAs(await actorContext(actor), id, parsed.data),
  );
}

/** Anonimizar exige un código nuevo (step-up): borra nombre y contacto y no se deshace. */
export async function anonymizeAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const returnTo = await personUrl(id, "datos", { accion: "anonimizar" });
  const actor = await requireAdminActor(returnTo);
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  await run(id, "datos", "anonimizar", async () =>
    anonymizePersonAs(await actorContext(actor), id),
  );
}

export async function setCommitteesAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  const termId = formText(formData, "termId");
  const catalog = await listCommitteeRoles();
  const rows: CommitteeMembershipInput[] = [];
  for (let index = 1; index <= MAX_ROWS; index += 1) {
    const committeeId = formText(formData, `committeeId${index}`);
    if (!committeeId) {
      continue;
    }
    // Varios cargos por comité (ADR-058): casillas `role{n}-CODIGO` y `co{n}-CODIGO`.
    const parsed = committeeMembershipInputSchema.safeParse({
      committeeId,
      roles: catalog
        .filter((role) => role.code !== "MIEMBRO" && checked(formData, `role${index}-${role.code}`))
        .map((role) => ({
          roleCode: role.code,
          coDirector: checked(formData, `co${index}-${role.code}`),
        })),
      transferredIn: checked(formData, `transferredIn${index}`),
    });
    if (!parsed.success) {
      await fail(id, "membresia", "comites", t("T-260"));
      return;
    }
    rows.push(parsed.data);
  }
  if (!termId) {
    await fail(id, "membresia", "comites", t("T-260"));
    return;
  }
  const overrideReason = formOptional(formData, "overrideReason");
  await run(id, "membresia", "comites", async () =>
    setCommitteeMembershipsAs(
      await actorContext(actor),
      id,
      termId,
      rows,
      overrideReason ? { reason: overrideReason } : undefined,
    ),
  );
}

// Condición del semestre (ADR-056): ADMIN marca o retira el periodo de prueba de un término con motivo.
export async function setProbationAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  const termId = formText(formData, "termId");
  const parsed = probationInputSchema.safeParse({
    probation: checked(formData, "probation"),
    reason: formText(formData, "reason"),
    committeeId: formText(formData, "committeeId") || null,
    reportAsVeteran: checked(formData, "reportAsVeteran"),
    academicVerified: checked(formData, "academicVerified"),
  });
  if (!parsed.success || !termId || !(await getTerm(termId))) {
    await fail(id, "membresia", "condicion", t("T-260"));
    return;
  }
  await run(id, "membresia", "condicion", async () =>
    setProbationAs(await actorContext(actor), id, termId, parsed.data),
  );
}

export async function addAppointmentAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const returnTo = await personUrl(id, "membresia", { accion: "cargo" });
  const actor = await requireAdminActor(returnTo);
  const grantBoard = checked(formData, "grantBoard");
  if (grantBoard && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  const parsed = appointmentInputSchema.safeParse({
    kind: formText(formData, "kind"),
    termId: formText(formData, "termId"),
    committeeId: formOptional(formData, "committeeId"),
    title: formOptional(formData, "title"),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "cargo", t("T-260"));
    return;
  }
  const overrideReason = formOptional(formData, "overrideReason");
  await run(id, "membresia", "cargo", async () => {
    await addAppointmentAs(
      await actorContext(actor),
      id,
      parsed.data,
      overrideReason ? { reason: overrideReason } : undefined,
    );
    if (grantBoard) {
      const who = await getPersonRecord(id);
      if (who) {
        try {
          await grantPermissionAs(await actorContext(actor), { email: who.email, code: "BOARD" });
        } catch (error) {
          // Ya tenía el permiso: el cargo quedó igual.
          if (!(error instanceof DomainError)) {
            throw error;
          }
        }
      }
    }
  });
}

export async function removeAppointmentAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const appointmentId = idSchema.parse(formData.get("appointmentId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  await run(id, "membresia", "cargo", async () =>
    removeAppointmentAs(await actorContext(actor), appointmentId),
  );
}

const consentSchema = z.object({
  purpose: z.enum(["MEMBERSHIP", "COMMUNICATIONS", "DIRECTORY_PHOTO", "MEMORIAL"]),
  intent: z.enum(["grant", "revoke"]),
});

/** Consentimiento dado en persona (fuente ADMIN) o retirado desde la ficha. */
export async function consentAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "datos"));
  const parsed = consentSchema.safeParse({
    purpose: formText(formData, "purpose"),
    intent: formText(formData, "intent"),
  });
  if (!parsed.success) {
    await fail(id, "datos", "", t("T-260"));
    return;
  }
  const ip = await clientIp();
  await run(id, "datos", "", async () => {
    if (parsed.data.intent === "grant") {
      await recordConsentAs({ personId: actor.personId, ip }, id, parsed.data.purpose, "ADMIN");
    } else {
      await revokeConsentAs({ personId: actor.personId, ip }, id, parsed.data.purpose);
    }
  });
}

const bodySchema = z.string().trim().min(1).max(5_000);

export async function addNoteAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "linea"));
  const parsed = bodySchema.safeParse(formText(formData, "body"));
  if (!parsed.success) {
    await fail(id, "linea", "nota", t("T-260"));
    return;
  }
  await run(id, "linea", "nota", async () => {
    await addNoteAs(await actorContext(actor), id, parsed.data);
  });
}

export async function editNoteAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const noteId = idSchema.parse(formData.get("noteId"));
  const actor = await requireAdminActor(await personUrl(id, "linea"));
  const parsed = bodySchema.safeParse(formText(formData, "body"));
  if (!parsed.success) {
    await fail(id, "linea", "nota", t("T-260"));
    return;
  }
  await run(id, "linea", "nota", async () =>
    editNoteAs(await actorContext(actor), noteId, parsed.data),
  );
}

export async function createTaskAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "tareas"));
  const parsed = taskInputSchema.safeParse({
    title: formText(formData, "title"),
    assigneeId: formOptional(formData, "assigneeId"),
    dueAt: formOptional(formData, "dueAt"),
    kind: formText(formData, "kind") || "GENERAL",
    personId: id,
  });
  if (!parsed.success) {
    await fail(id, "tareas", "tarea", t("T-260"));
    return;
  }
  await run(id, "tareas", "tarea", async () => {
    await createTaskAs(await actorContext(actor), parsed.data);
  });
}

export async function completeTaskAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const taskId = idSchema.parse(formData.get("taskId"));
  const actor = await requireAdminActor(await personUrl(id, "tareas"));
  await run(id, "tareas", "", async () => completeTaskAs(await actorContext(actor), taskId));
}

export async function setTagsAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "resumen"));
  const tagIds = formData
    .getAll("tagIds")
    .filter((item): item is string => typeof item === "string" && idSchema.safeParse(item).success);
  await run(id, "resumen", "etiquetas", async () =>
    setPersonTagsAs(await actorContext(actor), id, tagIds),
  );
}

// Crédito manual de permanencia (ADR-036 regla 8): ADMIN, solo criterios manuales, con motivo.
export async function grantCreditAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "permanencia", { accion: "credito" }));
  const parsed = manualCreditInputSchema.safeParse({
    ruleId: formText(formData, "ruleId"),
    personId: id,
    value: Number(formText(formData, "value")),
    reason: formText(formData, "reason"),
  });
  if (!parsed.success) {
    return fail(id, "permanencia", "credito", t("T-260"));
  }
  const input = parsed.data;
  const ip = await clientIp();
  await run(id, "permanencia", "credito", () =>
    grantManualCreditAs({ personId: actor.personId, ip }, input),
  );
}

/** Revocación individual del QR de billetera: ADMIN, confirmación y auditoría, sin step-up. */
export async function revokeCarnetAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const returnTo = await personUrl(id, "comunicaciones");
  const actor = await requireAdminActor(returnTo);
  if (formData.get("confirm") !== "1") {
    redirect(returnTo);
  }
  try {
    await rotateCarnetTokenAs(await sessionActorContext(actor), id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect(await personUrl(id, "comunicaciones", { error: t("T-032") }));
    }
    if (error instanceof DomainError) {
      redirect(await personUrl(id, "comunicaciones", { error: error.message }));
    }
    throw error;
  }
  revalidatePath(`/admin/personas/${id}`);
  revalidatePath("/app/carnet");
  redirect(await personUrl(id, "comunicaciones", { guardado: "carnet" }));
}

// Faltas y sanciones (ADR-060 regla 6): ADMIN registra sobre una membresía viva y revoca con motivo.
export async function recordSanctionAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  const parsed = sanctionInputSchema.safeParse({
    termId: formText(formData, "termId"),
    kind: formText(formData, "kind"),
    cause: formText(formData, "cause"),
    reference: formText(formData, "reference") || null,
    occurredOn: formText(formData, "occurredOn"),
    suspendedUntil: formText(formData, "suspendedUntil") || null,
    committeeId: formText(formData, "committeeId") || null,
  });
  if (!parsed.success || !(await getTerm(parsed.data.termId))) {
    await fail(id, "membresia", "sancion", t("T-260"));
    return;
  }
  await run(id, "membresia", "sancion", async () => {
    await recordSanctionAs(await actorContext(actor), id, parsed.data);
  });
}

export async function revokeSanctionAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const sanctionId = idSchema.parse(formData.get("sanctionId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  await run(id, "membresia", "revocar-sancion", async () =>
    revokeSanctionAs(await actorContext(actor), sanctionId, formText(formData, "reason")),
  );
}

// Premios OE (Regl. art. 71; ADR-060 regla 13): ADMIN registra la categoría del año como reconocimiento.
export async function grantAwardAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdminActor(await personUrl(id, "membresia"));
  const parsed = recognitionInputSchema.safeParse({
    personId: id,
    kind: "OE_AWARD",
    termId: formText(formData, "termId"),
    award: formText(formData, "award"),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "premio", t("T-260"));
    return;
  }
  await run(id, "membresia", "premio", async () => {
    await grantRecognitionAs(await actorContext(actor), parsed.data);
  });
}
