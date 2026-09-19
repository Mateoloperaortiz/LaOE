"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
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

function blank(value: string): string | undefined {
  return value === "" ? undefined : value;
}

function back(pipelineId: string, extra: Record<string, string> = {}): string {
  return withQuery(`/admin/pipelines/${pipelineId}`, extra);
}

function failed(pipelineId: string, error: unknown, extra: Record<string, string> = {}): never {
  if (error instanceof DomainError) {
    redirect(back(pipelineId, { ...extra, error: error.message }));
  }
  throw error;
}

async function actorFor(pipelineId: string) {
  const actor = await requireAdminActor(back(pipelineId));
  return actorContext(actor);
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
  const subject = formText(formData, "subject"); // "person:<id>" u "organization:<id>"
  const [kind, subjectId] = subject.split(":");
  const parsed = cardInputSchema.safeParse({
    personId: kind === "person" ? subjectId : undefined,
    organizationId: kind === "organization" ? subjectId : undefined,
    editionId: blank(formText(formData, "editionId")),
    title: blank(formText(formData, "title")),
    ownerId: blank(formText(formData, "ownerId")),
    dueAt: blank(formText(formData, "dueAt")),
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
    title: formText(formData, "title"),
    ownerId: blank(formText(formData, "ownerId")),
    dueAt: blank(formText(formData, "dueAt")),
    amount: blank(formText(formData, "amount")),
    counterpart: formData.has("counterpart") ? formText(formData, "counterpart") : undefined,
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
  const body = formText(formData, "body").slice(0, 4000);
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
    title: formText(formData, "title"),
    assigneeId: blank(formText(formData, "assigneeId")),
    dueAt: blank(formText(formData, "dueAt")),
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
    termId: formText(formData, "termId"),
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
  const stageId = blank(formText(formData, "stageId")) ?? null;
  const parsed = stageInputSchema.safeParse({
    name: formText(formData, "name"),
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
  const direction = formText(formData, "direction") === "up" ? "up" : "down";
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
