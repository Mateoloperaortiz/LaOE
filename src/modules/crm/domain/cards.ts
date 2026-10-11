import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { cardCreated, cardMoved } from "@/domain-events/crm";
import { eventOf } from "@/domain-events/define";
import { getEdition, listEditionOptions } from "@/modules/events";
import {
  type AdmitInput,
  admitPerson,
  getMembershipRef,
  getPeopleByIds,
  getPersonRecord,
  markApplicant,
} from "@/modules/people";
import { t } from "@/shared/copy";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { card, organization, pipeline, pipelineStage } from "../schema";
import { addNote, addOrganizationNote } from "./interactions";
import { assertInPipeline, type PipelineScope } from "./pipeline-scope";
import { closedAtForStage } from "./pipelines-pure";
import { createTask, openTaskForReason, taskInputSchema } from "./tasks";

// Tarjetas (02-crm.md, ADR-037 reglas 7 y 8): una persona o una organización avanzando por un pipeline.
// Mover es un comando con interacción en el sujeto; llegar a una etapa ganada o perdida cierra la
// tarjeta; en admisión, "dar de alta" crea la membresía y mueve la tarjeta en la misma transacción.

export type CardRecord = typeof card.$inferSelect;

const localDateTime = z
  .string()
  .trim()
  .regex(LOCAL_INPUT, { message: t("T-298") });

export const cardInputSchema = z
  .object({
    personId: z.string().trim().min(1).optional(),
    organizationId: z.string().trim().min(1).optional(),
    editionId: z.string().trim().min(1).optional(),
    title: z.string().trim().max(160).optional(),
    ownerId: z.string().trim().min(1).optional(),
    dueAt: localDateTime.transform(bogotaInputToUtc).optional(),
  })
  .refine((input) => Boolean(input.personId) !== Boolean(input.organizationId), {
    path: ["personId"],
    message: t("T-974"),
  });

export type CardInput = z.infer<typeof cardInputSchema>;

export const cardUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  ownerId: z.string().trim().min(1).optional(),
  dueAt: localDateTime.transform(bogotaInputToUtc).optional(),
  amount: z.coerce.number().min(0).max(999_999_999_999).optional(),
  counterpart: z.string().trim().max(2000).optional(),
});

export type CardUpdateInput = z.infer<typeof cardUpdateSchema>;

export interface CardView extends CardRecord {
  subjectName: string;
  subjectHref: string;
  editionName: string | null;
  ownerName: string | null;
  pipelineName: string;
  pipelineKind: "ADMISSION" | "SPONSORSHIP" | "CUSTOM";
  stageName: string;
  stageIsWon: boolean;
  stageIsLost: boolean;
}

export interface BoardColumn {
  id: string;
  name: string;
  sortOrder: number;
  isWon: boolean;
  isLost: boolean;
  cards: CardView[];
}

async function decorate(rows: CardRecord[]): Promise<CardView[]> {
  if (rows.length === 0) {
    return [];
  }
  const db = getDb();
  const [people, organizations, pipelines, stages, editions] = await Promise.all([
    getPeopleByIds([
      ...rows.flatMap((row) => (row.personId ? [row.personId] : [])),
      ...rows.flatMap((row) => (row.ownerId ? [row.ownerId] : [])),
    ]),
    db
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .where(
        inArray(
          organization.id,
          rows.flatMap((row) => (row.organizationId ? [row.organizationId] : [])).concat("-"),
        ),
      ),
    db
      .select()
      .from(pipeline)
      .where(inArray(pipeline.id, [...new Set(rows.map((row) => row.pipelineId))])),
    db
      .select()
      .from(pipelineStage)
      .where(inArray(pipelineStage.id, [...new Set(rows.map((row) => row.stageId))])),
    rows.some((row) => row.editionId) ? listEditionOptions() : Promise.resolve([]),
  ]);
  const orgById = new Map(organizations.map((row) => [row.id, row.name]));
  const pipelineById = new Map(pipelines.map((row) => [row.id, row]));
  const stageById = new Map(stages.map((row) => [row.id, row]));
  const editionById = new Map(editions.map((row) => [row.id, row.label]));
  return rows.map((row) => {
    const stage = stageById.get(row.stageId);
    const own = pipelineById.get(row.pipelineId);
    return {
      ...row,
      subjectName: row.personId
        ? (people.get(row.personId)?.fullName ?? "")
        : (orgById.get(row.organizationId ?? "") ?? ""),
      subjectHref: row.personId
        ? `/admin/personas/${row.personId}`
        : `/admin/organizaciones/${row.organizationId}`,
      editionName: row.editionId ? (editionById.get(row.editionId) ?? null) : null,
      ownerName: row.ownerId ? (people.get(row.ownerId)?.fullName ?? null) : null,
      pipelineName: own?.name ?? "",
      pipelineKind: own?.kind ?? "CUSTOM",
      stageName: stage?.name ?? "",
      stageIsWon: stage?.isWon ?? false,
      stageIsLost: stage?.isLost ?? false,
    };
  });
}

/** El tablero completo: etapas en orden con sus tarjetas, las abiertas primero por antigüedad. */
export async function getBoard(pipelineId: string): Promise<BoardColumn[]> {
  const [stages, rows] = await Promise.all([
    getDb()
      .select()
      .from(pipelineStage)
      .where(eq(pipelineStage.pipelineId, pipelineId))
      .orderBy(asc(pipelineStage.sortOrder), asc(pipelineStage.createdAt)),
    getDb()
      .select()
      .from(card)
      .where(eq(card.pipelineId, pipelineId))
      .orderBy(asc(card.enteredStageAt)),
  ]);
  const cards = await decorate(rows);
  return stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    sortOrder: stage.sortOrder,
    isWon: stage.isWon,
    isLost: stage.isLost,
    cards: cards.filter((item) => item.stageId === stage.id),
  }));
}

export async function getCard(id: string): Promise<CardView | null> {
  const [row] = await getDb().select().from(card).where(eq(card.id, id)).limit(1);
  return row ? ((await decorate([row]))[0] ?? null) : null;
}

export async function listCardsByPerson(personId: string): Promise<CardView[]> {
  const rows = await getDb()
    .select()
    .from(card)
    .where(eq(card.personId, personId))
    .orderBy(desc(card.createdAt));
  return decorate(rows);
}

export async function listCardsByOrganization(organizationId: string): Promise<CardView[]> {
  const rows = await getDb()
    .select()
    .from(card)
    .where(eq(card.organizationId, organizationId))
    .orderBy(desc(card.createdAt));
  return decorate(rows);
}

/** Tarjetas abiertas por pipeline y etapa (tablero del admin). */
export async function listBoardSummaries(): Promise<
  Array<{
    pipelineId: string;
    name: string;
    kind: string;
    stages: Array<{ name: string; open: number }>;
  }>
> {
  const db = getDb();
  const [pipelines, stages, rows] = await Promise.all([
    db.select().from(pipeline).where(eq(pipeline.isArchived, false)).orderBy(asc(pipeline.name)),
    db.select().from(pipelineStage).orderBy(asc(pipelineStage.sortOrder)),
    db.select({ stageId: card.stageId }).from(card).where(isNull(card.closedAt)),
  ]);
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.stageId, (counts.get(row.stageId) ?? 0) + 1);
  }
  return pipelines.map((own) => ({
    pipelineId: own.id,
    name: own.name,
    kind: own.kind,
    stages: stages
      .filter((stage) => stage.pipelineId === own.id && !stage.isWon && !stage.isLost)
      .map((stage) => ({ name: stage.name, open: counts.get(stage.id) ?? 0 })),
  }));
}

async function requirePipeline(ctx: CommandContext, pipelineId: string) {
  const [own] = await ctx.tx.select().from(pipeline).where(eq(pipeline.id, pipelineId));
  if (!own) {
    throw new DomainError(t("T-032"));
  }
  if (own.isArchived) {
    throw new DomainError(t("T-995"));
  }
  return own;
}

async function firstStage(ctx: CommandContext, pipelineId: string) {
  const stages = await ctx.tx
    .select()
    .from(pipelineStage)
    .where(eq(pipelineStage.pipelineId, pipelineId))
    .orderBy(asc(pipelineStage.sortOrder), asc(pipelineStage.createdAt));
  const open = stages.find((stage) => !stage.isWon && !stage.isLost) ?? stages[0];
  if (!open) {
    throw new DomainError(t("T-032"));
  }
  return open;
}

interface CreateCardOptions {
  /** La respuesta que originó la tarjeta (una por respuesta). */
  submissionId?: string | null;
  /** Etapa de la persona ya conocida por quien llama (una creada en esta transacción no se relee). */
  personStage?: string | null;
}

async function insertCard(
  ctx: CommandContext,
  own: typeof pipeline.$inferSelect,
  stage: typeof pipelineStage.$inferSelect,
  input: CardInput,
  options: CreateCardOptions,
): Promise<{ id: string; created: boolean }> {
  let title = input.title?.trim() ?? "";
  let personStage = options.personStage ?? null;
  if (input.personId) {
    const who = await getPersonRecord(input.personId);
    if (!who && !options.personStage) {
      throw new DomainError(t("T-032"), "personId");
    }
    title ||= who ? `${who.firstName} ${who.lastName}`.trim() : "";
    personStage ??= who?.stage ?? null;
  } else if (input.organizationId) {
    const [org] = await ctx.tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, input.organizationId));
    if (!org) {
      throw new DomainError(t("T-032"), "organizationId");
    }
    title ||= org.name;
  }
  if (input.editionId) {
    const edition = await getEdition(input.editionId);
    if (edition && !input.title) {
      title = `${title} · ${edition.name}`;
    }
  }
  const values = {
    pipelineId: own.id,
    stageId: stage.id,
    personId: input.personId ?? null,
    organizationId: input.organizationId ?? null,
    editionId: input.editionId ?? null,
    submissionId: options.submissionId ?? null,
    ownerId: input.ownerId ?? null,
    title: title || own.name,
    dueAt: input.dueAt ?? null,
    closedAt: closedAtForStage(stage),
    createdById: ctx.actor.personId,
  };
  const [row] = options.submissionId
    ? await ctx.tx
        .insert(card)
        .values(values)
        .onConflictDoNothing({
          target: card.submissionId,
          where: sql`${card.submissionId} is not null`,
        })
        .returning({ id: card.id })
    : await ctx.tx.insert(card).values(values).returning({ id: card.id });
  if (!row) {
    // Ya había una tarjeta para esa respuesta (el handler del outbox se procesó dos veces).
    const [existing] = await ctx.tx
      .select({ id: card.id })
      .from(card)
      .where(eq(card.submissionId, options.submissionId ?? ""))
      .limit(1);
    return { id: existing?.id ?? "", created: false };
  }
  if (own.kind === "ADMISSION" && input.personId && personStage === "PROSPECT") {
    await markApplicant(ctx, input.personId);
  }
  await ctx.audit({
    action: "card.created",
    entityType: "card",
    entityId: row.id,
    after: {
      pipelineId: own.id,
      stageId: stage.id,
      personId: input.personId ?? null,
      organizationId: input.organizationId ?? null,
    },
  });
  await ctx.emit(
    eventOf(cardCreated, {
      actorId: ctx.actor.personId,
      cardId: row.id,
      pipelineId: own.id,
      pipelineName: own.name,
      stageName: stage.name,
      personId: input.personId ?? null,
      organizationId: input.organizationId ?? null,
    }),
  );
  return { id: row.id, created: true };
}

/** Tarjeta nueva desde el kanban, la Persona 360 o la organización, en la primera etapa abierta. */
export async function createCard(
  ctx: CommandContext,
  pipelineId: string,
  input: CardInput,
): Promise<{ id: string }> {
  const own = await requirePipeline(ctx, pipelineId);
  const stage = await firstStage(ctx, pipelineId);
  const created = await insertCard(ctx, own, stage, input, {});
  return { id: created.id };
}

/**
 * Tarjeta desde una respuesta de formulario (handler de `submission.received`): idempotente por
 * `card_submission_unique`; un pipeline archivado o inexistente no crea nada.
 */
export async function createCardFromSubmission(
  ctx: CommandContext,
  input: { pipelineId: string; submissionId: string; personId: string; personStage: string | null },
): Promise<{ id: string; created: boolean } | null> {
  const [own] = await ctx.tx.select().from(pipeline).where(eq(pipeline.id, input.pipelineId));
  if (!own || own.isArchived) {
    return null;
  }
  const stage = await firstStage(ctx, input.pipelineId);
  return insertCard(
    ctx,
    own,
    stage,
    { personId: input.personId },
    { submissionId: input.submissionId, personStage: input.personStage },
  );
}

async function requireCard(ctx: CommandContext, cardId: string): Promise<CardRecord> {
  const [row] = await ctx.tx.select().from(card).where(eq(card.id, cardId)).for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  return row;
}

/**
 * Mueve la tarjeta; llegar a ganada o perdida estampa `closedAt` y volver lo limpia. En admisión la
 * etapa ganada exige membresía (T-991); un patrocinio ganado abre la tarea de seguimiento (T-994).
 */
export async function moveCard(
  ctx: CommandContext,
  cardId: string,
  stageId: string,
  options: { knownMember?: boolean } = {},
): Promise<void> {
  const row = await requireCard(ctx, cardId);
  const [own] = await ctx.tx.select().from(pipeline).where(eq(pipeline.id, row.pipelineId));
  // La etapa de destino se lee con candado compartido: guardar su marca de ganada o perdida espera a
  // este movimiento, y este espera a una marca sin confirmar (ADR-118 regla 16).
  const [target] = await ctx.tx
    .select()
    .from(pipelineStage)
    .where(eq(pipelineStage.id, stageId))
    .for("share");
  const [from] = await ctx.tx.select().from(pipelineStage).where(eq(pipelineStage.id, row.stageId));
  if (!own || !target || target.pipelineId !== row.pipelineId) {
    throw new DomainError(t("T-032"), "stageId");
  }
  if (target.id === row.stageId) {
    return;
  }
  if (own.kind === "ADMISSION" && target.isWon && row.personId && !options.knownMember) {
    const membership = await getMembershipRef(row.personId);
    if (!membership) {
      throw new DomainError(t("T-991", { etapa: target.name }), "stageId");
    }
  }
  const now = new Date();
  await ctx.tx
    .update(card)
    .set({ stageId: target.id, enteredStageAt: now, closedAt: closedAtForStage(target, now) })
    .where(eq(card.id, cardId));
  if (own.kind === "SPONSORSHIP" && target.isWon && row.organizationId) {
    const [org] = await ctx.tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, row.organizationId));
    await openTaskForReason(ctx, {
      reason: { type: "SPONSORSHIP_WON", cardId, organizationId: row.organizationId },
      title: t("T-994", { organización: org?.name ?? row.title }),
      assigneeId: row.ownerId,
      due: null,
      requestedById: ctx.actor.personId,
    });
  }
  await ctx.audit({
    action: "card.moved",
    entityType: "card",
    entityId: cardId,
    before: { stageId: row.stageId },
    after: { stageId: target.id, closedAt: closedAtForStage(target, now) },
  });
  await ctx.emit(
    eventOf(cardMoved, {
      actorId: ctx.actor.personId,
      cardId,
      pipelineId: own.id,
      pipelineName: own.name,
      fromStageName: from?.name ?? "",
      stageName: target.name,
      won: target.isWon,
      lost: target.isLost,
      personId: row.personId,
      organizationId: row.organizationId,
    }),
  );
}

/** Se edita desde la página de su pipeline, que es obligatorio (ADR-122 regla 1). */
export async function updateCard(
  ctx: CommandContext,
  cardId: string,
  input: CardUpdateInput,
  scope: PipelineScope,
): Promise<void> {
  const row = await requireCard(ctx, cardId);
  assertInPipeline(row, scope);
  const fields = {
    ...row.fields,
    ...(input.counterpart !== undefined ? { counterpart: input.counterpart } : {}),
  };
  await ctx.tx
    .update(card)
    .set({
      title: input.title,
      ownerId: input.ownerId ?? null,
      dueAt: input.dueAt ?? null,
      amount: input.amount ?? null,
      fields,
    })
    .where(eq(card.id, cardId));
  await ctx.audit({
    action: "card.updated",
    entityType: "card",
    entityId: cardId,
    before: {
      title: row.title,
      ownerId: row.ownerId,
      dueAt: row.dueAt,
      amount: row.amount,
      fields: row.fields,
    },
    after: { ...input, fields },
  });
}

/**
 * "Dar de alta" desde la tarjeta (ADR-037 regla 8): `people.admitPerson` y la tarjeta a la etapa ganada
 * en la misma transacción.
 */
export async function admitFromCard(
  ctx: CommandContext,
  cardId: string,
  input: AdmitInput,
  scope: PipelineScope,
): Promise<{ membershipId: string }> {
  const row = await requireCard(ctx, cardId);
  // ADR-122 regla 1: la tarjeta de otro pipeline responde como una que no existe, antes de admitir.
  assertInPipeline(row, scope);
  const [own] = await ctx.tx.select().from(pipeline).where(eq(pipeline.id, row.pipelineId));
  if (!own || own.kind !== "ADMISSION" || !row.personId) {
    throw new DomainError(t("T-032"));
  }
  const result = await admitPerson(ctx, row.personId, input);
  const [won] = await ctx.tx
    .select()
    .from(pipelineStage)
    .where(and(eq(pipelineStage.pipelineId, own.id), eq(pipelineStage.isWon, true)))
    .orderBy(asc(pipelineStage.sortOrder))
    .limit(1);
  if (won) {
    await moveCard(ctx, cardId, won.id, { knownMember: true });
  }
  return result;
}

/**
 * La tarjeta de la página, leída sin tomarla: quien escribe sobre su sujeto no la cambia, y de qué
 * pipeline es y cuál es su sujeto no cambian. El pipeline de la página es obligatorio (ADR-122
 * regla 1): la tarjeta de otro responde como una que no existe.
 */
async function cardOfPage(
  ctx: CommandContext,
  cardId: string,
  scope: PipelineScope,
): Promise<CardRecord> {
  const [row] = await ctx.tx.select().from(card).where(eq(card.id, cardId));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  assertInPipeline(row, scope);
  return row;
}

/** Nota sobre el sujeto de la tarjeta, persona u organización, desde la página de su pipeline. */
export async function addCardNote(
  ctx: CommandContext,
  cardId: string,
  body: string,
  scope: PipelineScope,
): Promise<{ id: string }> {
  const row = await cardOfPage(ctx, cardId, scope);
  if (row.personId) {
    return addNote(ctx, row.personId, body);
  }
  if (row.organizationId) {
    return addOrganizationNote(ctx, row.organizationId, body);
  }
  // `card_one_subject` no deja una tarjeta sin sujeto: si apareciera, no hay ficha donde escribir.
  throw new DomainError(t("T-032"));
}

/** Lo que la página escribe de una tarea de la tarjeta; el sujeto y la tarjeta los pone el comando. */
export const cardTaskInputSchema = taskInputSchema.pick({
  title: true,
  assigneeId: true,
  dueAt: true,
});

export type CardTaskInput = z.infer<typeof cardTaskInputSchema>;

/** Tarea ligada a la tarjeta y a su sujeto, desde la página de su pipeline. */
export async function createCardTask(
  ctx: CommandContext,
  cardId: string,
  input: CardTaskInput,
  scope: PipelineScope,
): Promise<{ id: string }> {
  const row = await cardOfPage(ctx, cardId, scope);
  return createTask(ctx, {
    title: input.title,
    kind: "GENERAL",
    assigneeId: input.assigneeId,
    dueAt: input.dueAt,
    personId: row.personId ?? undefined,
    organizationId: row.organizationId ?? undefined,
    cardId: row.id,
  });
}

// Wrappers con transacción para las páginas.

export function createCardAs(
  actor: Actor,
  pipelineId: string,
  input: CardInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createCard(ctx, pipelineId, input));
}

export function moveCardAs(actor: Actor, cardId: string, stageId: string): Promise<void> {
  return runCommand(actor, (ctx) => moveCard(ctx, cardId, stageId));
}

/** `scope` es el pipeline de la página desde la que se edita la tarjeta (ADR-122 regla 1). */
export function updateCardAs(
  actor: Actor,
  cardId: string,
  input: CardUpdateInput,
  scope: PipelineScope,
): Promise<void> {
  return runCommand(actor, (ctx) => updateCard(ctx, cardId, input, scope));
}

/** `scope` es el pipeline de la página desde la que se da de alta (ADR-122 regla 1). */
export function admitFromCardAs(
  actor: Actor,
  cardId: string,
  input: AdmitInput,
  scope: PipelineScope,
): Promise<{ membershipId: string }> {
  return runCommand(actor, (ctx) => admitFromCard(ctx, cardId, input, scope));
}

/** `scope` es el pipeline de la página desde la que se deja la nota (ADR-122 regla 1). */
export function addCardNoteAs(
  actor: Actor,
  cardId: string,
  body: string,
  scope: PipelineScope,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => addCardNote(ctx, cardId, body, scope));
}

/** `scope` es el pipeline de la página desde la que se abre la tarea (ADR-122 regla 1). */
export function createCardTaskAs(
  actor: Actor,
  cardId: string,
  input: CardTaskInput,
  scope: PipelineScope,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createCardTask(ctx, cardId, input, scope));
}
