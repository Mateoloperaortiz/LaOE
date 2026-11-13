"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import {
  assertAdmin,
  ForbiddenError,
  getActor,
  hasRecentStepUp,
  safeNextPath,
} from "@/modules/identity";
import { deleteSavedViewAs, savedViewQuery, saveViewAs } from "@/modules/system";
import {
  type FormState,
  formDataToInput,
  formDataToValues,
  isInlineField,
  storedFormData,
  withLockedFormValues,
} from "@/shared/admin-kit";
import type { InlineState } from "@/shared/admin-kit/InlineEditCell";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { getResource } from "./registry";

// Acción genérica del admin kit: valida con Zod, resuelve el actor, exige ADMIN (y step-up si el
// recurso lo pide) y llama a los comandos del módulo. Nunca toca la base directamente. El actor que
// recibe el recurso lo arma `actorContext`, con la IP del request (ADR-082 regla 2; ADR-116 regla 10):
// así la auditoría de lo que se escribe por el kit dice desde dónde se hizo.

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
  const commandActor = await actorContext(actor);
  try {
    if (id) {
      if (!resource.update) {
        throw new DomainError(t("T-240"));
      }
      await resource.update(commandActor, id, parsed.data);
    } else {
      if (!resource.create) {
        throw new DomainError(t("T-240"));
      }
      await resource.create(commandActor, parsed.data);
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
  const commandActor = await actorContext(actor);
  try {
    await resource.runRowAction(commandActor, actionKey, id);
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

/**
 * Edición en línea de una celda (ADR-167 regla 5): arma el formulario del panel con lo guardado y el
 * campo nuevo, lo valida con el mismo esquema y llama al mismo `update`, con el actor de siempre. Solo
 * vale para un campo que el recurso declaró en `inlineEdit` y que es simple; lo demás se edita en el
 * panel.
 */
export async function inlineEditAction(
  _previous: InlineState,
  formData: FormData,
): Promise<InlineState> {
  const key = z.string().parse(formData.get("__resource"));
  const id = z.string().min(1).parse(formData.get("__id"));
  const fieldName = z.string().parse(formData.get("__field"));
  const returnTo = safeNextPath(formData.get("__returnTo"), "/admin");
  const resource = getResource(key);
  if (!resource?.update) {
    redirect("/admin");
  }
  const actor = await requireAdminForAction(returnTo);
  if (resource.stepUp && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  const at = Date.now();
  const fields = typeof resource.fields === "function" ? await resource.fields() : resource.fields;
  const field = fields.find((item) => item.name === fieldName);
  const declared = Object.values(resource.inlineEdit ?? {}).includes(fieldName);
  if (!field || !declared || !isInlineField(field)) {
    return { ok: false, message: t("T-4904"), at };
  }
  const existing = await resource.get(id);
  if (!existing) {
    return { ok: false, message: t("T-032"), at };
  }
  const submitted = storedFormData(fields, resource.toFormValues(existing));
  const raw = formData.get("value");
  submitted.set(field.name, typeof raw === "string" ? raw : "");
  const parsed = resource.schema.safeParse(formDataToInput(submitted, fields));
  if (!parsed.success) {
    const issue =
      parsed.error.issues.find((item) => String(item.path[0] ?? "") === field.name) ??
      parsed.error.issues[0];
    return { ok: false, message: issue?.message ?? t("T-260"), at };
  }
  try {
    await resource.update(await actorContext(actor), id, parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.message, at };
    }
    throw error;
  }
  revalidateReturn(returnTo);
  return { ok: true, message: null, at };
}

/** Las rutas de tabla que se guardan como vista: las del admin. */
const tablePath = z.string().regex(/^\/admin(\/[a-z0-9-]+)+$/);

/** Guardar la vista actual de una tabla (ADR-170 regla 1): vuelve a la tabla con la vista abierta. */
export async function saveViewAction(formData: FormData): Promise<void> {
  const basePath = tablePath.parse(formData.get("__basePath"));
  const query = savedViewQuery(
    z
      .string()
      .max(2000)
      .parse(formData.get("__query") ?? ""),
  );
  const name = z.string().parse(formData.get("name") ?? "");
  const shared = formData.get("shared") === "on";
  const back = query ? `${basePath}?${query}` : basePath;
  const actor = await requireAdminForAction(back);
  try {
    await saveViewAs(await actorContext(actor), { basePath, name, query, shared });
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(
        `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`,
      );
    }
    throw error;
  }
  revalidateReturn(basePath);
  redirect(`${back}${back.includes("?") ? "&" : "?"}vista=guardada`);
}

export async function deleteViewAction(formData: FormData): Promise<void> {
  const id = z.string().min(1).parse(formData.get("__id"));
  const returnTo = safeNextPath(formData.get("__returnTo"), "/admin");
  const actor = await requireAdminForAction(returnTo);
  try {
    await deleteSavedViewAs(await actorContext(actor), id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(
        `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`,
      );
    }
    throw error;
  }
  revalidateReturn(returnTo);
  redirect(returnTo);
}

/** Tope de filas de un lote (ADR-170 regla 3). */
const BATCH_LIMIT = 100;

/**
 * Lote con vista previa ya confirmada (ADR-170 regla 3): corre la misma acción de fila, una por una,
 * cada una con su comando y su auditoría. Una fila a la que no aplica se salta y una que falla no frena
 * a las demás; al final vuelve a la tabla con la cuenta.
 */
export async function batchRowAction(formData: FormData): Promise<void> {
  const key = z.string().parse(formData.get("__resource"));
  const actionKey = z.string().parse(formData.get("__action"));
  const returnTo = safeNextPath(formData.get("__returnTo"), "/admin");
  const ids = [...new Set(formData.getAll("ids").filter((item) => typeof item === "string"))]
    .map((item) => z.string().min(1).parse(item))
    .slice(0, BATCH_LIMIT);
  const resource = getResource(key);
  const action = resource?.rowActions?.find((item) => item.key === actionKey);
  if (!resource?.runRowAction || !action || !resource.batchActions?.includes(actionKey)) {
    redirect("/admin");
  }
  const actor = await requireAdminForAction(returnTo);
  if (resource.stepUp && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  const commandActor = await actorContext(actor);
  let done = 0;
  let failed = 0;
  for (const id of ids) {
    const row = await resource.get(id);
    if (!row || (action.applies && !action.applies(row))) {
      failed += 1;
      continue;
    }
    try {
      await resource.runRowAction(commandActor, actionKey, id);
      done += 1;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      failed += 1;
    }
  }
  revalidateReturn(returnTo);
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}lote_hechas=${done}&lote_fallidas=${failed}`);
}
