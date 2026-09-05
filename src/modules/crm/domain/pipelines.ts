import { and, asc, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t, tList } from "@/shared/copy";
import { card, pipeline, pipelineStage } from "../schema";
import { PIPELINE_KINDS, type PipelineKind, templateStages } from "./pipelines-pure";

// Pipelines (02-crm.md, ADR-037 regla 7): crearlo siembra la plantilla de su tipo; las etapas se
// renombran, reordenan y marcan como ganada o perdida desde el kanban.

export type PipelineRecord = typeof pipeline.$inferSelect;
export type StageRecord = typeof pipelineStage.$inferSelect;

export const pipelineInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(PIPELINE_KINDS).default("CUSTOM"),
});

export type PipelineInput = z.infer<typeof pipelineInputSchema>;

export const stageInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
});

export type StageInput = z.infer<typeof stageInputSchema>;

export interface PipelineListRow extends PipelineRecord {
  openCards: number;
}

export interface PipelineListParams {
  q: string;
  kind?: string | undefined;
  archived?: string | undefined;
  page: number;
  pageSize: number;
}

// La tabla exterior va literal: dentro de una plantilla `sql` las columnas salen sin calificar.
const openCards =
  sql<number>`(select count(*) from card c where c.pipeline_id = pipeline.id and c.closed_at is null)`.mapWith(
    Number,
  );

/** Ids de los pipelines de admisión activos: `/unirse` busca con ellos la convocatoria abierta. */
export async function listAdmissionPipelineIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: pipeline.id })
    .from(pipeline)
    .where(and(eq(pipeline.kind, "ADMISSION"), eq(pipeline.isArchived, false)));
  return rows.map((row) => row.id);
}

/** Opciones para el constructor de formularios (acción "entrar al pipeline"). */
export async function listPipelineOptions(): Promise<
  Array<{ id: string; name: string; kind: PipelineKind }>
> {
  return getDb()
    .select({ id: pipeline.id, name: pipeline.name, kind: pipeline.kind })
    .from(pipeline)
    .where(eq(pipeline.isArchived, false))
    .orderBy(asc(pipeline.name));
}

export async function listPipelines(
  params: PipelineListParams,
): Promise<{ rows: PipelineListRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(ilike(pipeline.name, `%${params.q}%`));
  }
  if ((PIPELINE_KINDS as readonly string[]).includes(params.kind ?? "")) {
    conditions.push(eq(pipeline.kind, params.kind as PipelineKind));
  }
  if (params.archived === "yes") {
    conditions.push(eq(pipeline.isArchived, true));
  } else if (params.archived === "no") {
    conditions.push(eq(pipeline.isArchived, false));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({ row: pipeline, openCards })
      .from(pipeline)
      .where(where)
      .orderBy(asc(pipeline.isArchived), desc(pipeline.updatedAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(pipeline).where(where),
  ]);
  return {
    rows: rows.map((item) => ({ ...item.row, openCards: item.openCards })),
    total: total?.n ?? 0,
  };
}

export async function getPipeline(id: string): Promise<PipelineListRow | null> {
  const [row] = await getDb()
    .select({ row: pipeline, openCards })
    .from(pipeline)
    .where(eq(pipeline.id, id))
    .limit(1);
  return row ? { ...row.row, openCards: row.openCards } : null;
}

export async function listStages(pipelineId: string): Promise<StageRecord[]> {
  return getDb()
    .select()
    .from(pipelineStage)
    .where(eq(pipelineStage.pipelineId, pipelineId))
    .orderBy(asc(pipelineStage.sortOrder), asc(pipelineStage.createdAt));
}

export async function getPipelinesByIds(ids: string[]): Promise<Map<string, PipelineRecord>> {
  const map = new Map<string, PipelineRecord>();
  if (ids.length === 0) {
    return map;
  }
  const rows = await getDb().select().from(pipeline).where(inArray(pipeline.id, ids));
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

/** Nombres de la plantilla por tipo: T-965 (admisión), T-966 (patrocinio) y T-967 (personalizado). */
function templateNames(kind: PipelineKind): string[] {
  return tList(kind === "ADMISSION" ? "T-965" : kind === "SPONSORSHIP" ? "T-966" : "T-967");
}

export async function createPipeline(
  ctx: CommandContext,
  input: PipelineInput,
): Promise<{ id: string }> {
  const [row] = await ctx.tx
    .insert(pipeline)
    .values({ name: input.name, kind: input.kind, createdById: ctx.actor.personId })
    .returning({ id: pipeline.id });
  if (!row) {
    throw new Error("No se pudo crear el pipeline");
  }
  const stages = templateStages(input.kind, templateNames(input.kind));
  await ctx.tx
    .insert(pipelineStage)
    .values(stages.map((stage) => ({ ...stage, pipelineId: row.id })));
  await ctx.audit({
    action: "pipeline.created",
    entityType: "pipeline",
    entityId: row.id,
    after: { ...input, stages: stages.map((stage) => stage.name) },
  });
  return row;
}

export async function updatePipeline(
  ctx: CommandContext,
  id: string,
  input: Pick<PipelineInput, "name">,
): Promise<void> {
  const [before] = await ctx.tx.select().from(pipeline).where(eq(pipeline.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx.update(pipeline).set({ name: input.name }).where(eq(pipeline.id, id));
  await ctx.audit({
    action: "pipeline.updated",
    entityType: "pipeline",
    entityId: id,
    before: { name: before.name },
    after: { name: input.name },
  });
}

export async function setPipelineArchived(
  ctx: CommandContext,
  id: string,
  isArchived: boolean,
): Promise<void> {
  const [before] = await ctx.tx.select().from(pipeline).where(eq(pipeline.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  if (before.isArchived === isArchived) {
    return;
  }
  await ctx.tx.update(pipeline).set({ isArchived }).where(eq(pipeline.id, id));
  await ctx.audit({
    action: isArchived ? "pipeline.archived" : "pipeline.unarchived",
    entityType: "pipeline",
    entityId: id,
    before: { isArchived: before.isArchived },
    after: { isArchived },
  });
}

async function requireStage(ctx: CommandContext, stageId: string): Promise<StageRecord> {
  const [stage] = await ctx.tx.select().from(pipelineStage).where(eq(pipelineStage.id, stageId));
  if (!stage) {
    throw new DomainError(t("T-032"));
  }
  return stage;
}

/** Crea una etapa al final o renombra y marca una existente; nunca ganada y perdida a la vez (T-979). */
export async function saveStage(
  ctx: CommandContext,
  pipelineId: string,
  stageId: string | null,
  input: StageInput,
): Promise<{ id: string }> {
  if (input.isWon && input.isLost) {
    throw new DomainError(t("T-979"), "isLost");
  }
  if (stageId) {
    const stage = await requireStage(ctx, stageId);
    if (stage.pipelineId !== pipelineId) {
      throw new DomainError(t("T-032"));
    }
    await ctx.tx
      .update(pipelineStage)
      .set({ name: input.name, isWon: input.isWon, isLost: input.isLost })
      .where(eq(pipelineStage.id, stageId));
    await ctx.audit({
      action: "pipeline.stage-updated",
      entityType: "pipeline",
      entityId: pipelineId,
      before: { name: stage.name, isWon: stage.isWon, isLost: stage.isLost },
      after: input,
    });
    return { id: stageId };
  }
  const [last] = await ctx.tx
    .select({ max: sql<number>`coalesce(max(${pipelineStage.sortOrder}), -1)`.mapWith(Number) })
    .from(pipelineStage)
    .where(eq(pipelineStage.pipelineId, pipelineId));
  const [row] = await ctx.tx
    .insert(pipelineStage)
    .values({
      pipelineId,
      name: input.name,
      isWon: input.isWon,
      isLost: input.isLost,
      sortOrder: (last?.max ?? -1) + 1,
    })
    .returning({ id: pipelineStage.id });
  if (!row) {
    throw new Error("No se pudo crear la etapa");
  }
  await ctx.audit({
    action: "pipeline.stage-created",
    entityType: "pipeline",
    entityId: pipelineId,
    after: input,
  });
  return row;
}

/** Sube o baja una etapa intercambiando su orden con la vecina. */
export async function moveStage(
  ctx: CommandContext,
  stageId: string,
  direction: "up" | "down",
): Promise<void> {
  const stage = await requireStage(ctx, stageId);
  const stages = await ctx.tx
    .select()
    .from(pipelineStage)
    .where(eq(pipelineStage.pipelineId, stage.pipelineId))
    .orderBy(asc(pipelineStage.sortOrder), asc(pipelineStage.createdAt));
  const index = stages.findIndex((item) => item.id === stageId);
  const target = direction === "up" ? index - 1 : index + 1;
  const neighbour = stages[target];
  if (index < 0 || !neighbour) {
    return;
  }
  // Se renumeran todas para que el orden sea denso aunque la plantilla haya dejado huecos.
  const reordered = [...stages];
  reordered[index] = neighbour;
  reordered[target] = stage;
  for (const [order, item] of reordered.entries()) {
    await ctx.tx
      .update(pipelineStage)
      .set({ sortOrder: order })
      .where(eq(pipelineStage.id, item.id));
  }
  await ctx.audit({
    action: "pipeline.stage-moved",
    entityType: "pipeline",
    entityId: stage.pipelineId,
    after: { stageId, direction },
  });
}

/** Borra una etapa sin tarjetas (T-980); la última etapa del pipeline no se borra. */
export async function deleteStage(ctx: CommandContext, stageId: string): Promise<void> {
  const stage = await requireStage(ctx, stageId);
  const [cards] = await ctx.tx.select({ n: count() }).from(card).where(eq(card.stageId, stageId));
  if ((cards?.n ?? 0) > 0) {
    throw new DomainError(t("T-980"));
  }
  const [total] = await ctx.tx
    .select({ n: count() })
    .from(pipelineStage)
    .where(eq(pipelineStage.pipelineId, stage.pipelineId));
  if ((total?.n ?? 0) <= 1) {
    throw new DomainError(t("T-980"));
  }
  await ctx.tx.delete(pipelineStage).where(eq(pipelineStage.id, stageId));
  await ctx.audit({
    action: "pipeline.stage-deleted",
    entityType: "pipeline",
    entityId: stage.pipelineId,
    before: { name: stage.name },
  });
}

// Wrappers con transacción para las páginas.

export function saveStageAs(
  actor: Actor,
  pipelineId: string,
  stageId: string | null,
  input: StageInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => saveStage(ctx, pipelineId, stageId, input));
}

export function moveStageAs(
  actor: Actor,
  stageId: string,
  direction: "up" | "down",
): Promise<void> {
  return runCommand(actor, (ctx) => moveStage(ctx, stageId, direction));
}

export function deleteStageAs(actor: Actor, stageId: string): Promise<void> {
  return runCommand(actor, (ctx) => deleteStage(ctx, stageId));
}
