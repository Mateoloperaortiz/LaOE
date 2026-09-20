"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { FIELD_TYPES, getFormView, setFormActionsAs, setFormFieldsAs } from "@/modules/forms";
import { requireAdminActor } from "@/modules/identity";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Constructor de formularios (ADR-037 regla 3): campos y acciones se guardan completos en cada
// escritura; el dominio valida claves únicas, opciones y las acciones que exigen crear la persona.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);
const keySchema = z.string().regex(/^[a-z0-9_]{1,40}$/);

function back(formId: string, extra: Record<string, string> = {}): string {
  return withQuery(`/admin/formularios/${formId}`, extra);
}

function failed(formId: string, error: unknown, extra: Record<string, string> = {}): never {
  if (error instanceof DomainError) {
    redirect(back(formId, { ...extra, error: error.message }));
  }
  throw error;
}

async function load(formId: string) {
  const actor = await requireAdminActor(`/admin/formularios/${formId}`);
  const view = await getFormView(formId);
  if (!view) {
    redirect("/admin/formularios");
  }
  return { actor, view };
}

async function persistFields(
  actor: { personId: string },
  formId: string,
  fields: unknown[],
  extra: Record<string, string> = {},
): Promise<never> {
  try {
    await setFormFieldsAs(await actorContext(actor), formId, fields);
  } catch (error) {
    failed(formId, error, extra);
  }
  revalidatePath(`/admin/formularios/${formId}`);
  redirect(back(formId, { guardado: "campos" }));
}

export async function saveFieldAction(formData: FormData): Promise<void> {
  const formId = idSchema.parse(formData.get("formId"));
  const { actor, view } = await load(formId);
  const original = formText(formData, "originalKey");
  const key = formText(formData, "key");
  const parsedKey = keySchema.safeParse(key);
  if (!parsedKey.success) {
    redirect(back(formId, { campo: original || "nuevo", error: t("T-925") }));
  }
  const type = formText(formData, "type");
  const field = {
    key: parsedKey.data,
    label: formText(formData, "label"),
    type: (FIELD_TYPES as readonly string[]).includes(type) ? type : "TEXT",
    required: formData.get("required") === "on",
    help: formText(formData, "help") || undefined,
    options: formText(formData, "options")
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean),
  };
  const current = view.parsedFields;
  const index = original ? current.findIndex((item) => item.key === original) : -1;
  const next =
    index >= 0 ? current.map((item, i) => (i === index ? field : item)) : [...current, field];
  await persistFields(actor, formId, next, { campo: original || "nuevo" });
}

export async function deleteFieldAction(formData: FormData): Promise<void> {
  const formId = idSchema.parse(formData.get("formId"));
  const key = formText(formData, "key");
  const { actor, view } = await load(formId);
  await persistFields(
    actor,
    formId,
    view.parsedFields.filter((item) => item.key !== key),
  );
}

export async function moveFieldAction(formData: FormData): Promise<void> {
  const formId = idSchema.parse(formData.get("formId"));
  const key = formText(formData, "key");
  const direction = formText(formData, "direction") === "up" ? -1 : 1;
  const { actor, view } = await load(formId);
  const fields = [...view.parsedFields];
  const index = fields.findIndex((item) => item.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= fields.length) {
    redirect(back(formId));
  }
  const [moved] = fields.splice(index, 1);
  if (moved) {
    fields.splice(target, 0, moved);
  }
  await persistFields(actor, formId, fields);
}

export async function saveActionsAction(formData: FormData): Promise<void> {
  const formId = idSchema.parse(formData.get("formId"));
  const { actor } = await load(formId);
  const actions = {
    createPerson: formData.get("createPerson") === "on",
    pipelineId: formText(formData, "pipelineId") || undefined,
    editionId: formText(formData, "editionId") || undefined,
    tagIds: formData
      .getAll("tagIds")
      .filter((item): item is string => typeof item === "string" && item !== ""),
  };
  try {
    await setFormActionsAs(await actorContext(actor), formId, actions);
  } catch (error) {
    failed(formId, error);
  }
  revalidatePath(`/admin/formularios/${formId}`);
  redirect(back(formId, { guardado: "acciones" }));
}
