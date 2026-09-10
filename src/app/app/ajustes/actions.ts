"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { removeSubscriptionAs, updatePreferencesAs } from "@/modules/comms";
import {
  findPasswordHash,
  getActor,
  hasRecentStepUp,
  rotateCalendarTokenAs,
  setOwnPassword,
} from "@/modules/identity";
import {
  getPersonRecord,
  ownContactSchema,
  recordConsentAs,
  requestDeletionAs,
  revokeConsentAs,
  setOwnPhotoAs,
  updateOwnContactAs,
} from "@/modules/people";
import { PrivacyPolicyPendingError } from "@/modules/system";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { clientIp } from "@/shared/lib/request";

// Acciones de Ajustes (ADR-034 reglas 6, 8 y 12): la persona sobre sus propios datos. Cada una vuelve
// a su sección con `guardado=<sección>` o con el error del dominio.

const LOGIN = "/ingresar?next=%2Fapp%2Fajustes";

async function requireOwnActor() {
  const actor = await getActor();
  if (!actor) {
    redirect(LOGIN);
  }
  return actor;
}

function back(section: string, extra: Record<string, string> = {}): never {
  const query = new URLSearchParams(extra);
  const qs = query.toString();
  redirect(`/app/ajustes${qs ? `?${qs}` : ""}#${section}`);
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export type ContactState = {
  status: "idle" | "done" | "error";
  message?: string;
  errors: { phone?: string; personalEmail?: string };
  values?: { phone: string; personalEmail: string };
};

export async function updateContactAction(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const actor = await requireOwnActor();
  const parsed = ownContactSchema.safeParse({
    phone: text(formData, "phone"),
    personalEmail: text(formData, "personalEmail"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: t("T-1632"),
      errors: Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0]), t("T-1631")]),
      ),
    };
  }
  try {
    await updateOwnContactAs(actor, parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        status: "error",
        message: error.message,
        errors: error.field ? { [error.field]: error.message } : {},
      };
    }
    throw error;
  }
  revalidatePath("/app/ajustes");
  const who = await getPersonRecord(actor.personId);
  return {
    status: "done",
    errors: {},
    values: { phone: who?.phone ?? "", personalEmail: who?.personalEmail ?? "" },
  };
}

/** La llama el subidor de la foto tras confirmar el medio (o con null para quitarla). */
export async function setPhotoAction(
  assetId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireOwnActor();
  const parsed = z
    .string()
    .regex(/^[a-z0-9]+$/)
    .nullable()
    .safeParse(assetId);
  if (!parsed.success) {
    return { ok: false };
  }
  try {
    await setOwnPhotoAs(actor, parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  revalidatePath("/app/ajustes");
  return { ok: true };
}

const consentSchema = z.object({
  purpose: z.enum(["COMMUNICATIONS", "DIRECTORY_PHOTO", "MEMORIAL"]),
  intent: z.enum(["grant", "revoke"]),
});

export async function consentAction(formData: FormData): Promise<void> {
  const actor = await requireOwnActor();
  const parsed = consentSchema.safeParse({
    purpose: text(formData, "purpose"),
    intent: text(formData, "intent"),
  });
  if (!parsed.success) {
    back("consentimientos");
  }
  if (parsed.data.intent === "grant") {
    try {
      await recordConsentAs(
        { personId: actor.personId, ip: await clientIp() },
        actor.personId,
        parsed.data.purpose,
        "SELF",
      );
    } catch (error) {
      if (error instanceof PrivacyPolicyPendingError) {
        back("consentimientos", { error: "policy-pending" });
      }
      throw error;
    }
  } else {
    await revokeConsentAs(actor, actor.personId, parsed.data.purpose);
  }
  revalidatePath("/app/ajustes");
  back("consentimientos", { guardado: "consentimientos" });
}

export async function requestDeletionAction(): Promise<void> {
  const actor = await requireOwnActor();
  await requestDeletionAs(actor);
  revalidatePath("/app/ajustes");
  back("privacidad", { guardado: "privacidad" });
}

// Notificaciones (ADR-038 regla 5): las cuatro preferencias y quitar un dispositivo.

export type PreferencesState = { status: "idle" | "done" | "error"; message?: string };

export async function updatePreferencesAction(
  _previous: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const actor = await requireOwnActor();
  await updatePreferencesAs(actor, {
    pushAnnouncements: formData.get("pushAnnouncements") === "on",
    pushPoints: formData.get("pushPoints") === "on",
    pushReminders: formData.get("pushReminders") === "on",
    emailCampaigns: formData.get("emailCampaigns") === "on",
  });
  revalidatePath("/app/ajustes");
  return { status: "done" };
}

export async function removeDeviceAction(formData: FormData): Promise<void> {
  const actor = await requireOwnActor();
  const parsed = z
    .string()
    .regex(/^[a-z0-9]+$/)
    .safeParse(text(formData, "id"));
  if (parsed.success) {
    await removeSubscriptionAs(actor, { id: parsed.data });
  }
  revalidatePath("/app/ajustes");
  revalidatePath("/app");
  back("notificaciones", { guardado: "dispositivo" });
}

// Calendario personal (ADR-038 regla 12): regenerar el token invalida el enlace anterior.

export async function rotateCalendarAction(): Promise<void> {
  const actor = await requireOwnActor();
  await rotateCalendarTokenAs(actor);
  revalidatePath("/app/ajustes");
  back("calendario", { guardado: "calendario" });
}

export type PasswordState = {
  status: "idle" | "done" | "error";
  message?: string;
  closed?: number;
};

/**
 * Crear o cambiar la contraseña propia (ADR-051, regla 8). Quien todavía no tiene una llega con
 * step-up en lugar de la contraseña actual: ese es el camino de arranque de quien entró por código.
 */
export async function changePasswordAction(
  _previous: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const actor = await requireOwnActor();
  const tiene = (await findPasswordHash(actor.personId)) !== null;
  if (!tiene && !hasRecentStepUp(actor)) {
    redirect("/ingresar/paso?next=%2Fapp%2Fajustes");
  }
  const current = text(formData, "current");
  const password = text(formData, "password");
  const confirmation = text(formData, "confirmation");
  if (password !== confirmation) {
    return { status: "error", message: t("T-2109") };
  }
  const who = await getPersonRecord(actor.personId);
  const result = await setOwnPassword({
    personId: actor.personId,
    email: actor.email,
    names: [who?.firstName ?? "", who?.lastName ?? ""],
    current,
    password,
    keepSessionId: actor.sessionId,
  });
  if (!result.ok) {
    if (result.reason === "CURRENT") {
      return { status: "error", message: t("T-2115") };
    }
    return {
      status: "error",
      message: result.problem === "SHORT" ? t("T-2108") : t("T-2110"),
    };
  }
  revalidatePath("/app/ajustes");
  return { status: "done", message: t("T-2116"), closed: result.closed };
}
