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
import {
  type FormState,
  formDataToInput,
  formDataToValues,
  withLockedFormValues,
} from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
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

/** La ruta de retorno, no `resource.basePath`: un recurso puede montarse anidado bajo otro. */
function revalidateReturn(returnTo: string): void {
  revalidatePath(returnTo.split("?")[0] ?? returnTo);
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
  let submitted = formData;
  if (id) {
    const existing = await resource.get(id);
    if (!existing) {
      return {
        ok: false,
        message: t("T-032"),
        errors: {},
        values: formDataToValues(formData, fields),
      };
    }
    submitted = withLockedFormValues(formData, fields, resource.toFormValues(existing));
  }
  const values = formDataToValues(submitted, fields);
  const parsed = resource.schema.safeParse(formDataToInput(submitted, fields));
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
  revalidateReturn(returnTo);
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
      revalidateReturn(returnTo);
      const separator = returnTo.includes("?") ? "&" : "?";
      redirect(`${returnTo}${separator}error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidateReturn(returnTo);
  redirect(returnTo);
}
