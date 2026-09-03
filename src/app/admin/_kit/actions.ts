"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  assertAdmin,
  ForbiddenError,
  getActor,
  hasRecentStepUp,
  safeNextPath,
} from "@/modules/identity";
import { DomainError, type FormState, formDataToInput, formDataToValues } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { getResource } from "./registry";

// Acción genérica del admin kit: valida con Zod, resuelve el actor, exige ADMIN (y step-up si el
// recurso lo pide) y llama a los comandos del módulo. Nunca toca la base directamente.

async function requireAdminForAction(returnTo: string) {
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

export async function saveResourceAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const key = z.string().parse(formData.get("__resource"));
  const id = z.string().parse(formData.get("__id") ?? "") || null;
  const returnTo = safeNextPath(formData.get("__returnTo"), "/admin");
  const resource = getResource(key);
  if (!resource) {
    redirect("/admin");
  }
  const actor = await requireAdminForAction(returnTo);
  if (resource.stepUp && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  const fields = typeof resource.fields === "function" ? await resource.fields() : resource.fields;
  const values = formDataToValues(formData, fields);
  const parsed = resource.schema.safeParse(formDataToInput(formData, fields));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field && !errors[field]) {
        errors[field] = issue.message;
      }
    }
    return { ok: false, message: t("T-260"), errors, values };
  }
  try {
    if (id) {
      if (!resource.update) {
        throw new DomainError(t("T-240"));
      }
      await resource.update({ personId: actor.personId, isAdmin: actor.isAdmin }, id, parsed.data);
    } else {
      if (!resource.create) {
        throw new DomainError(t("T-240"));
      }
      await resource.create({ personId: actor.personId, isAdmin: actor.isAdmin }, parsed.data);
    }
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        ok: false,
        message: error.field ? t("T-260") : error.message,
        errors: error.field ? { [error.field]: error.message } : {},
        values,
      };
    }
    throw error;
  }
  revalidatePath(resource.basePath);
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}guardado=1`);
}

export async function rowActionAction(formData: FormData): Promise<void> {
  const key = z.string().parse(formData.get("__resource"));
  const actionKey = z.string().parse(formData.get("__action"));
  const id = z.string().min(1).parse(formData.get("__id"));
  const returnTo = safeNextPath(formData.get("__returnTo"), "/admin");
  const resource = getResource(key);
  if (!resource?.runRowAction) {
    redirect("/admin");
  }
  const actor = await requireAdminForAction(returnTo);
  if (resource.stepUp && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  try {
    await resource.runRowAction(
      { personId: actor.personId, isAdmin: actor.isAdmin },
      actionKey,
      id,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      revalidatePath(resource.basePath);
      const separator = returnTo.includes("?") ? "&" : "?";
      redirect(`${returnTo}${separator}error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath(resource.basePath);
  redirect(returnTo);
}
