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
  addAppointmentAs,
  anonymizePersonAs,
  appointmentInputSchema,
  type CommitteeMembershipInput,
  changeMembershipStatusAs,
  changeStatusSchema,
  committeeMembershipInputSchema,
  endMembershipAs,
  endMembershipSchema,
  getPersonRecord,
  personInputSchema,
  reactivateMembershipAs,
  reactivateSchema,
  recordConsentAs,
  removeAppointmentAs,
  revokeConsentAs,
  setCommitteeMembershipsAs,
  updatePersonAs,
} from "@/modules/people";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { clientIp } from "@/shared/lib/request";

// Acciones de la Persona 360 (ADR-034): viven en src/app porque componen identity (actor, step-up,
// permisos) con people (comandos), y people no puede importar identity. Cada una exige ADMIN,
// parsea con Zod y vuelve a la ficha con `guardado=1` o con el error del dominio.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

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
  });
  if (!parsed.success) {
    await fail(id, "datos", "editar", t("T-260"));
    return;
  }
  await run(id, "datos", "editar", () =>
    updatePersonAs({ personId: actor.personId, ip: null }, id, parsed.data),
  );
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

const MAX_ROWS = 3;

export async function setCommitteesAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("personId"));
  const actor = await requireAdmin(await personUrl(id, "membresia"));
  const termId = text(formData, "termId");
  const rows: CommitteeMembershipInput[] = [];
  for (let index = 1; index <= MAX_ROWS; index += 1) {
    const committeeId = text(formData, `committeeId${index}`);
    if (!committeeId) {
      continue;
    }
    const parsed = committeeMembershipInputSchema.safeParse({
      committeeId,
      roleCode: text(formData, `roleCode${index}`) || "MIEMBRO",
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
