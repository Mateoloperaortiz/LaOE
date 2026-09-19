"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import {
  addContactAs,
  addOrganizationNoteAs,
  createExternalContactAs,
  createTaskAs,
  externalContactSchema,
  removeContactAs,
  setOrganizationTagsAs,
  setPrimaryContactAs,
  taskInputSchema,
} from "@/modules/crm";
import { requireAdminActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";

// Detalle de una organización (ADR-037 regla 6): contactos externos, notas, tareas y etiquetas.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function blankToUndefined(value: string): string | undefined {
  return value === "" ? undefined : value;
}

function back(id: string, extra: Record<string, string> = {}): string {
  return withQuery(`/admin/organizaciones/${id}`, extra);
}

function failed(id: string, error: unknown, extra: Record<string, string> = {}): never {
  if (error instanceof DomainError) {
    redirect(back(id, { ...extra, error: error.message }));
  }
  throw error;
}

async function actorFor(id: string) {
  const actor = await requireAdminActor(back(id));
  return actorContext(actor);
}

function done(id: string): never {
  revalidatePath(`/admin/organizaciones/${id}`);
  redirect(back(id, { guardado: "1" }));
}

export async function createContactAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("organizationId"));
  const actor = await actorFor(id);
  const parsed = externalContactSchema.safeParse({
    firstName: formText(formData, "firstName"),
    lastName: formText(formData, "lastName"),
    email: formText(formData, "email"),
    phone: blankToUndefined(formText(formData, "phone")),
    role: blankToUndefined(formText(formData, "role")),
    isPrimary: formData.get("isPrimary") === "on",
  });
  if (!parsed.success) {
    redirect(back(id, { accion: "contacto", error: parsed.error.issues[0]?.message ?? "" }));
  }
  try {
    await createExternalContactAs(actor, id, parsed.data);
  } catch (error) {
    failed(id, error, { accion: "contacto" });
  }
  done(id);
}

export async function linkContactAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("organizationId"));
  const actor = await actorFor(id);
  const personId = idSchema.parse(formData.get("personId"));
  try {
    await addContactAs(actor, id, {
      personId,
      role: blankToUndefined(formText(formData, "role")),
      isPrimary: formData.get("isPrimary") === "on",
    });
  } catch (error) {
    failed(id, error, { accion: "vincular" });
  }
  done(id);
}

export async function removeContactAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("organizationId"));
  const actor = await actorFor(id);
  const personId = idSchema.parse(formData.get("personId"));
  await removeContactAs(actor, id, personId);
  done(id);
}

export async function setPrimaryAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("organizationId"));
  const actor = await actorFor(id);
  const personId = idSchema.parse(formData.get("personId"));
  await setPrimaryContactAs(actor, id, personId);
  done(id);
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("organizationId"));
  const actor = await actorFor(id);
  const body = formText(formData, "body");
  if (body.length < 2) {
    redirect(back(id, { accion: "nota" }));
  }
  await addOrganizationNoteAs(actor, id, body.slice(0, 4000));
  done(id);
}

export async function createTaskAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("organizationId"));
  const actor = await actorFor(id);
  const parsed = taskInputSchema.safeParse({
    title: formText(formData, "title"),
    assigneeId: blankToUndefined(formText(formData, "assigneeId")),
    dueAt: blankToUndefined(formText(formData, "dueAt")),
    organizationId: id,
  });
  if (!parsed.success) {
    redirect(back(id, { accion: "tarea", error: parsed.error.issues[0]?.message ?? "" }));
  }
  await createTaskAs(actor, parsed.data);
  done(id);
}

export async function setTagsAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("organizationId"));
  const actor = await actorFor(id);
  const tagIds = formData
    .getAll("tagIds")
    .filter((item): item is string => typeof item === "string" && item !== "");
  await setOrganizationTagsAs(actor, id, tagIds);
  done(id);
}
