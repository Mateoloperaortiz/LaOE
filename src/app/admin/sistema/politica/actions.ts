"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorContext } from "@/app/_lib/actor";
import { findPublicPage } from "@/modules/content";
import { assertAdmin, ForbiddenError, getActor, hasRecentStepUp } from "@/modules/identity";
import {
  isPrivacyPolicyReady,
  privacyPolicyVersionSchema,
  setPrivacyPolicyVersionAs,
} from "@/modules/system";
import type { FormState } from "@/shared/admin-kit";
import { t } from "@/shared/copy";

const PATH = "/admin/sistema/politica";

/** Publicar y habilitar son pasos separados; la comprobación entre módulos vive en la app. */
export async function savePrivacyPolicyVersionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await getActor();
  if (!actor) redirect(`/ingresar?next=${encodeURIComponent(PATH)}`);
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(PATH)}`);
  }

  const raw = formData.get("version");
  const values = { version: typeof raw === "string" ? raw : "" };
  const parsed = privacyPolicyVersionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: t("T-260"), errors: { version: t("T-1188") }, values };
  }
  if (isPrivacyPolicyReady(parsed.data)) {
    // findPublicPage excluye la audiencia MEMBERS y comparte la lectura solo dentro del request.
    const policy = await findPublicPage("privacidad");
    if (!policy || policy.status !== "PUBLISHED" || !policy.body.trim()) {
      return { ok: false, message: t("T-1187"), errors: {}, values };
    }
  }
  await setPrivacyPolicyVersionAs(await actorContext(actor), parsed.data);
  revalidatePath(PATH);
  revalidatePath("/app/ajustes");
  revalidatePath("/admin/personas/importar");
  redirect(`${PATH}?guardado=1`);
}
