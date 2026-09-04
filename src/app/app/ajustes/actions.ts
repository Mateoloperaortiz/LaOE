"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getActor } from "@/modules/identity";
import {
  ownContactSchema,
  recordConsentAs,
  requestDeletionAs,
  revokeConsentAs,
  setOwnPhotoAs,
  updateOwnContactAs,
} from "@/modules/people";
import { DomainError } from "@/shared/admin-kit";
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

export async function updateContactAction(formData: FormData): Promise<void> {
  const actor = await requireOwnActor();
  const parsed = ownContactSchema.safeParse({
    phone: text(formData, "phone"),
    personalEmail: text(formData, "personalEmail"),
  });
  if (!parsed.success) {
    back("mis-datos", { error: "mis-datos" });
  }
  try {
    await updateOwnContactAs(actor, parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      back("mis-datos", { error: error.message });
    }
    throw error;
  }
  revalidatePath("/app/ajustes");
  back("mis-datos", { guardado: "mis-datos" });
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
    await recordConsentAs(
      { personId: actor.personId, ip: await clientIp() },
      actor.personId,
      parsed.data.purpose,
      "SELF",
    );
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
