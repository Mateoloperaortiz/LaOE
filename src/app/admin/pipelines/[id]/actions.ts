"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addNoteAs,
  addOrganizationNoteAs,
  admitFromCardAs,
  cardInputSchema,
  cardUpdateSchema,
  createCardAs,
  createTaskAs,
  deleteStageAs,
  getCard,
  moveCardAs,
  moveStageAs,
  saveStageAs,
  stageInputSchema,
  taskInputSchema,
  updateCardAs,
} from "@/modules/crm";
import { requireAdminActor, safeNextPath } from "@/modules/identity";
import { admitInputSchema } from "@/modules/people";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";

// Kanban de un pipeline (ADR-037 reglas 7 y 8): mover (selector o arrastre), tarjeta nueva, datos de
// la tarjeta, notas y tareas sobre el sujeto, etapas y "dar de alta" en admisión.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function blank(value: string): string | undefined {
  return value === "" ? undefined : value;
}

function back(pipelineId: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(extra).toString();
  return `/admin/pipelines/${pipelineId}${query ? `?${query}` : ""}`;
}

function failed(pipelineId: string, error: unknown, extra: Record<string, string> = {}): never {
  if (error instanceof DomainError) {
    redirect(back(pipelineId, { ...extra, error: error.message }));
  }
  throw error;
}

async function actorFor(pipelineId: string) {
  const actor = await requireAdminActor(back(pipelineId));
  return { personId: actor.personId };
}

function done(pipelineId: string, extra: Record<string, string> = {}): never {
  revalidatePath(`/admin/pipelines/${pipelineId}`);
  redirect(back(pipelineId, { guardado: "1", ...extra }));
}

export async function moveCardAction(formData: FormData): Promise<void> {
  const cardId = idSchema.parse(formData.get("cardId"));
  const stageId = idSchema.parse(formData.get("stageId"));
  const card = await getCard(cardId);
  if (!card) {
    redirect("/admin/pipelines");
  }
  const actor = await actorFor(card.pipelineId);
  const returnTo = safeNextPath(formData.get("returnTo"), back(card.pipelineId));
  try {
    await moveCardAs(actor, cardId, stageId);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(
        `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`,
      );
    }
    throw error;
  }
  revalidatePath(`/admin/pipelines/${card.pipelineId}`);
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}movida=${stageId}`);
}

export async function createCardAction(formData: FormData): Promise<void> {
  const pipelineId = idSchema.parse(formData.get("pipelineId"));
  const actor = await actorFor(pipelineId);
  const subject = text(formData, "subject"); // "person:<id>" u "organization:<id>"
  const [kind, subjectId] = subject.split(":");
  const parsed = cardInputSchema.safeParse({
    personId: kind === "person" ? subjectId : undefined,
    organizationId: kind === "organization" ? subjectId : undefined,
    editionId: blank(text(formData, "editionId")),
    title: blank(text(formData, "title")),
    ownerId: blank(text(formData, "ownerId")),
    dueAt: blank(text(formData, "dueAt")),
  });
  if (!parsed.success) {
    redirect(
      back(pipelineId, { nueva: "1", error: parsed.error.issues[0]?.message ?? t("T-974") }),
    );
  }
  try {
    const created = await createCardAs(actor, pipelineId, parsed.data);
    done(pipelineId, { tarjeta: created.id });
  } catch (error) {
    failed(pipelineId, error, { nueva: "1" });
  }
}

export async function updateCardAction(formData: FormData): Promise<void> {
  const pipelineId = idSchema.parse(formData.get("pipelineId"));
  const cardId = idSchema.parse(formData.get("cardId"));
  const actor = await actorFor(pipelineId);
  const parsed = cardUpdateSchema.safeParse({
    title: text(formData, "title"),
    ownerId: blank(text(formData, "ownerId")),
    dueAt: blank(text(formData, "dueAt")),
    amount: blank(text(formData, "amount")),
    counterpart: formData.has("counterpart") ? text(formData, "counterpart") : undefined,
  });
  if (!parsed.success) {
    redirect(back(pipelineId, { tarjeta: cardId, error: parsed.error.issues[0]?.message ?? "" }));
  }
  try {
    await updateCardAs(actor, cardId, parsed.data);
  } catch (error) {
    failed(pipelineId, error, { tarjeta: cardId });
  }
  done(pipelineId, { tarjeta: cardId });
}

export async function addCardNoteAction(formData: FormData): Promise<void> {
  const pipelineId = idSchema.parse(formData.get("pipelineId"));
  const cardId = idSchema.parse(formData.get("cardId"));
  const actor = await actorFor(pipelineId);
  const body = text(formData, "body").slice(0, 4000);
  const card = await getCard(cardId);
  if (!card || body.length < 2) {
    redirect(back(pipelineId, { tarjeta: cardId }));
  }
  if (card.personId) {
    await addNoteAs(actor, card.personId, body);
  } else if (card.organizationId) {
    await addOrganizationNoteAs(actor, card.organizationId, body);
  }
  done(pipelineId, { tarjeta: cardId });
}

export async function createCardTaskAction(formData: FormData): Promise<void> {
  const pipelineId = idSchema.parse(formData.get("pipelineId"));
  const cardId = idSchema.parse(formData.get("cardId"));
  const actor = await actorFor(pipelineId);
  const card = await getCard(cardId);
  if (!card) {
    redirect(back(pipelineId));
  }
  const parsed = taskInputSchema.safeParse({
    title: text(formData, "title"),
    assigneeId: blank(text(formData, "assigneeId")),
    dueAt: blank(text(formData, "dueAt")),
    personId: card.personId ?? undefined,
    organizationId: card.organizationId ?? undefined,
    cardId,
  });
  if (!parsed.success) {
    redirect(back(pipelineId, { tarjeta: cardId, error: parsed.error.issues[0]?.message ?? "" }));
  }
  await createTaskAs(actor, parsed.data);
  done(pipelineId, { tarjeta: cardId });
}

export async function admitFromCardAction(formData: FormData): Promise<void> {
  const pipelineId = idSchema.parse(formData.get("pipelineId"));
  const cardId = idSchema.parse(formData.get("cardId"));
  const actor = await actorFor(pipelineId);
  const parsed = admitInputSchema.safeParse({
    termId: text(formData, "termId"),
    committeeIds: formData
      .getAll("committeeIds")
      .filter((item): item is string => typeof item === "string" && item !== ""),
  });
  if (!parsed.success) {
    redirect(
      back(pipelineId, { tarjeta: cardId, alta: "1", error: t("T-451", { min: 1, max: 3 }) }),
    );
  }
  try {
    await admitFromCardAs(actor, cardId, parsed.data);
  } catch (error) {
    failed(pipelineId, error, { tarjeta: cardId, alta: "1" });
  }
  done(pipelineId, { tarjeta: cardId, alta: "ok" });
}

export async function saveStageAction(formData: FormData): Promise<void> {
  const pipelineId = idSchema.parse(formData.get("pipelineId"));
  const actor = await actorFor(pipelineId);
  const stageId = blank(text(formData, "stageId")) ?? null;
  const parsed = stageInputSchema.safeParse({
    name: text(formData, "name"),
    isWon: formData.get("isWon") === "on",
    isLost: formData.get("isLost") === "on",
  });
  if (!parsed.success) {
    redirect(back(pipelineId, { etapas: "1", error: parsed.error.issues[0]?.message ?? "" }));
  }
  try {
    await saveStageAs(
      actor,
      pipelineId,
      stageId && idSchema.safeParse(stageId).success ? stageId : null,
      parsed.data,
    );
  } catch (error) {
    failed(pipelineId, error, { etapas: "1" });
  }
  done(pipelineId, { etapas: "1" });
}

export async function moveStageAction(formData: FormData): Promise<void> {
  const pipelineId = idSchema.parse(formData.get("pipelineId"));
  const stageId = idSchema.parse(formData.get("stageId"));
  const direction = text(formData, "direction") === "up" ? "up" : "down";
  const actor = await actorFor(pipelineId);
  await moveStageAs(actor, stageId, direction);
  done(pipelineId, { etapas: "1" });
}

export async function deleteStageAction(formData: FormData): Promise<void> {
  const pipelineId = idSchema.parse(formData.get("pipelineId"));
  const stageId = idSchema.parse(formData.get("stageId"));
  const actor = await actorFor(pipelineId);
  try {
    await deleteStageAs(actor, stageId);
  } catch (error) {
    failed(pipelineId, error, { etapas: "1" });
  }
  done(pipelineId, { etapas: "1" });
}
