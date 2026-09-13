"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addNoteAs,
  completeTaskAs,
  createTaskAs,
  editNoteAs,
  taskInputSchema,
} from "@/modules/crm";
import {
  assertAdmin,
  ForbiddenError,
  getActor,
  grantPermissionAs,
  hasRecentStepUp,
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

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optional(formData: FormData, name: string): string | undefined {
  return text(formData, name) || undefined;
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
  const actor = await requireAdmin(await personUrl(id, "datos"));
  const parsed = personInputSchema.safeParse({
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    email: text(formData, "email"),
    kind: text(formData, "kind") || "STUDENT",
    preferredName: optional(formData, "preferredName"),
    phone: optional(formData, "phone"),
    personalEmail: optional(formData, "personalEmail"),
    program: optional(formData, "program"),
    ...(formData.has("documentType") ? { documentType: text(formData, "documentType") } : {}),
    ...(formData.has("documentNumber") ? { documentNumber: text(formData, "documentNumber") } : {}),
    ...(formData.has("epikId") ? { epikId: text(formData, "epikId") } : {}),
    ...(formData.has("birthDate") ? { birthDate: text(formData, "birthDate") } : {}),
  });
  if (!parsed.success) {
    await fail(id, "datos", "editar", t("T-260"));
    return;
  }
  await run(id, "datos", "editar", () =>
    updatePersonAs({ personId: actor.personId, ip: null }, id, parsed.data),
  );
}

export async function admitAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  const parsed = admitInputSchema.safeParse({
    termId: text(formData, "termId"),
    committeeIds: formData
      .getAll("committeeIds")
      .filter((item): item is string => typeof item === "string" && item !== ""),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "alta", t("T-451", { min: 1, max: MAX_ROWS }));
    return;
  }
  await run(id, "membresia", "alta", async () => {
    await admitPersonAs(actor, id, parsed.data);
  });
}

export async function changeStatusAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  const parsed = changeStatusSchema.safeParse({
    to: text(formData, "to"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "estado", t("T-260"));
    return;
  }
  await run(id, "membresia", "estado", () =>
    changeMembershipStatusAs({ personId: actor.personId }, id, parsed.data),
  );
}

export async function endMembershipAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  const parsed = endMembershipSchema.safeParse({
    endReason: text(formData, "endReason"),
    note: optional(formData, "note"),
    memorialConsent: checked(formData, "memorialConsent"),
    contactConsent: checked(formData, "contactConsent"),
    personalEmail: optional(formData, "personalEmail"),
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
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  const parsed = reactivateSchema.safeParse({
    email: optional(formData, "email"),
    reason: optional(formData, "reason"),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "reactivar", t("T-260"));
    return;
  }
  await run(id, "membresia", "reactivar", () =>
    reactivateMembershipAs({ personId: actor.personId }, id, parsed.data),
  );
}

/** Anonimizar exige un código nuevo (step-up): borra nombre y contacto y no se deshace. */
export async function anonymizeAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const returnTo = await personUrl(id, "datos", { accion: "anonimizar" });
  const actor = await requireAdmin(returnTo);
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  await run(id, "datos", "anonimizar", () => anonymizePersonAs({ personId: actor.personId }, id));
}

export async function setCommitteesAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  const termId = text(formData, "termId");
  const catalog = await listCommitteeRoles();
  const rows: CommitteeMembershipInput[] = [];
  for (let index = 1; index <= MAX_ROWS; index += 1) {
    const committeeId = text(formData, `committeeId${index}`);
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
  await run(id, "membresia", "comites", () =>
    setCommitteeMembershipsAs({ personId: actor.personId }, id, termId, rows),
  );
}

// Condición del semestre (ADR-056): ADMIN marca o retira el periodo de prueba de un término con motivo.
export async function setProbationAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  const termId = text(formData, "termId");
  const parsed = probationInputSchema.safeParse({
    probation: checked(formData, "probation"),
    reason: text(formData, "reason"),
    committeeId: text(formData, "committeeId") || null,
  });
  if (!parsed.success || !termId || !(await getTerm(termId))) {
    await fail(id, "membresia", "condicion", t("T-260"));
    return;
  }
  await run(id, "membresia", "condicion", () =>
    setProbationAs({ personId: actor.personId }, id, termId, parsed.data),
  );
}

export async function addAppointmentAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const returnTo = await personUrl(id, "membresia", { accion: "cargo" });
  const actor = await requireAdmin(returnTo);
  const grantBoard = checked(formData, "grantBoard");
  if (grantBoard && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  const parsed = appointmentInputSchema.safeParse({
    kind: text(formData, "kind"),
    termId: text(formData, "termId"),
    committeeId: optional(formData, "committeeId"),
    title: optional(formData, "title"),
  });
  if (!parsed.success) {
    await fail(id, "membresia", "cargo", t("T-260"));
    return;
  }
  await run(id, "membresia", "cargo", async () => {
    await addAppointmentAs({ personId: actor.personId }, id, parsed.data);
    if (grantBoard) {
      const who = await getPersonRecord(id);
      if (who) {
        try {
          await grantPermissionAs(
            { personId: actor.personId },
            { email: who.email, code: "BOARD" },
          );
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
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  await run(id, "membresia", "cargo", () =>
    removeAppointmentAs({ personId: actor.personId }, appointmentId),
  );
}

const consentSchema = z.object({
  purpose: z.enum(["MEMBERSHIP", "COMMUNICATIONS", "DIRECTORY_PHOTO", "MEMORIAL"]),
  intent: z.enum(["grant", "revoke"]),
});

/** Consentimiento dado en persona (fuente ADMIN) o retirado desde la ficha. */
export async function consentAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "datos"));
  const parsed = consentSchema.safeParse({
    purpose: text(formData, "purpose"),
    intent: text(formData, "intent"),
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
  const actor = await requireAdmin(await personUrl(id, "linea"));
  const parsed = bodySchema.safeParse(text(formData, "body"));
  if (!parsed.success) {
    await fail(id, "linea", "nota", t("T-260"));
    return;
  }
  await run(id, "linea", "nota", async () => {
    await addNoteAs({ personId: actor.personId }, id, parsed.data);
  });
}

export async function editNoteAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const noteId = idSchema.parse(formData.get("noteId"));
  const actor = await requireAdmin(await personUrl(id, "linea"));
  const parsed = bodySchema.safeParse(text(formData, "body"));
  if (!parsed.success) {
    await fail(id, "linea", "nota", t("T-260"));
    return;
  }
  await run(id, "linea", "nota", () =>
    editNoteAs({ personId: actor.personId }, noteId, parsed.data),
  );
}

export async function createTaskAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "tareas"));
  const parsed = taskInputSchema.safeParse({
    title: text(formData, "title"),
    assigneeId: optional(formData, "assigneeId"),
    dueAt: optional(formData, "dueAt"),
    kind: text(formData, "kind") || "GENERAL",
    personId: id,
  });
  if (!parsed.success) {
    await fail(id, "tareas", "tarea", t("T-260"));
    return;
  }
  await run(id, "tareas", "tarea", async () => {
    await createTaskAs({ personId: actor.personId }, parsed.data);
  });
}

export async function completeTaskAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const taskId = idSchema.parse(formData.get("taskId"));
  const actor = await requireAdmin(await personUrl(id, "tareas"));
  await run(id, "tareas", "", () => completeTaskAs({ personId: actor.personId }, taskId));
}

export async function setTagsAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "resumen"));
  const tagIds = formData
    .getAll("tagIds")
    .filter((item): item is string => typeof item === "string" && idSchema.safeParse(item).success);
  await run(id, "resumen", "etiquetas", () =>
    setPersonTagsAs({ personId: actor.personId }, id, tagIds),
  );
}

// Crédito manual de permanencia (ADR-036 regla 8): ADMIN, solo criterios manuales, con motivo.
export async function grantCreditAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "permanencia", { accion: "credito" }));
  const parsed = manualCreditInputSchema.safeParse({
    ruleId: text(formData, "ruleId"),
    personId: id,
    value: Number(text(formData, "value")),
    reason: text(formData, "reason"),
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
  const actor = await requireAdmin(returnTo);
  if (formData.get("confirm") !== "1") {
    redirect(returnTo);
  }
  try {
    await rotateCarnetTokenAs(actor, id);
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
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  const parsed = sanctionInputSchema.safeParse({
    termId: text(formData, "termId"),
    kind: text(formData, "kind"),
    cause: text(formData, "cause"),
    reference: text(formData, "reference") || null,
    occurredOn: text(formData, "occurredOn"),
    suspendedUntil: text(formData, "suspendedUntil") || null,
    committeeId: text(formData, "committeeId") || null,
  });
  if (!parsed.success || !(await getTerm(parsed.data.termId))) {
    await fail(id, "membresia", "sancion", t("T-260"));
    return;
  }
  await run(id, "membresia", "sancion", async () => {
    await recordSanctionAs({ personId: actor.personId }, id, parsed.data);
  });
}

export async function revokeSanctionAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const sanctionId = idSchema.parse(formData.get("sanctionId"));
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  await run(id, "membresia", "revocar-sancion", () =>
    revokeSanctionAs({ personId: actor.personId }, sanctionId, text(formData, "reason")),
  );
}
