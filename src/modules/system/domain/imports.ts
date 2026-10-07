import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { importJob } from "../schema";

// Importaciones (03-modelo-de-datos.md): el archivo del roster con su vista previa, estado y resumen.

export type ImportJobRow = typeof importJob.$inferSelect;
export type ImportJobStatus = ImportJobRow["status"];

export interface CreateImportJobInput {
  type: string;
  filename: string;
  fileKey: string | null;
  termId: string | null;
  mapping: Record<string, unknown>;
  payload: Record<string, unknown>;
  summary: Record<string, unknown>;
}

export async function createImportJob(
  ctx: CommandContext,
  input: CreateImportJobInput,
): Promise<{ id: string }> {
  const [row] = await ctx.tx
    .insert(importJob)
    .values({ ...input, createdById: ctx.actor.personId })
    .returning({ id: importJob.id });
  if (!row) {
    throw new Error("No se pudo registrar la importación");
  }
  await ctx.audit({
    action: "import.created",
    entityType: "import_job",
    entityId: row.id,
    after: {
      type: input.type,
      filename: input.filename,
      termId: input.termId,
      summary: input.summary,
    },
  });
  return row;
}

export async function getImportJob(id: string): Promise<ImportJobRow | null> {
  const [row] = await getDb().select().from(importJob).where(eq(importJob.id, id)).limit(1);
  return row ?? null;
}

export async function listImportJobs(limit = 50): Promise<ImportJobRow[]> {
  return getDb().select().from(importJob).orderBy(desc(importJob.createdAt)).limit(limit);
}

/**
 * Toma un trabajo en el estado que su operación exige: bloquea la fila hasta el commit y rechaza
 * cualquier otro estado con el texto de quien lo pide. Quien escribe un trabajo empieza por una de las
 * dos tomas de abajo, así que una segunda llamada espera a la primera y lee lo que dejó. Devuelve la
 * fila tomada: lo que dice ya no cambia hasta el commit.
 */
async function takeImportJob(
  ctx: CommandContext,
  id: string,
  status: ImportJobStatus,
  otherwise: string,
): Promise<ImportJobRow> {
  const [row] = await ctx.tx.select().from(importJob).where(eq(importJob.id, id)).for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status !== status) {
    throw new DomainError(otherwise);
  }
  return row;
}

/**
 * Toma un trabajo que sigue en vista previa (ADR-113 regla 7) y exige `PREVIEW`. Quien lo saca de la
 * vista previa o le cambia las columnas empieza por acá: la segunda llamada se rechaza antes de
 * escribir nada.
 */
export async function takeImportJobInPreview(
  ctx: CommandContext,
  id: string,
): Promise<ImportJobRow> {
  return takeImportJob(ctx, id, "PREVIEW", t("T-3210"));
}

/**
 * Toma un trabajo ya aplicado (ADR-114 regla 7) y exige `APPLIED`. Quien completa el resumen de una
 * importación aplicada empieza por acá: lee el resumen de la fila tomada, que es el que la aplicación
 * dejó.
 */
export async function takeAppliedImportJob(ctx: CommandContext, id: string): Promise<ImportJobRow> {
  return takeImportJob(ctx, id, "APPLIED", t("T-3212"));
}

export interface ImportJobPatch {
  status?: ImportJobStatus;
  mapping?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  appliedAt?: Date | null;
}

export async function updateImportJob(
  ctx: CommandContext,
  id: string,
  patch: ImportJobPatch,
): Promise<void> {
  await ctx.tx.update(importJob).set(patch).where(eq(importJob.id, id));
  await ctx.audit({
    action: "import.updated",
    entityType: "import_job",
    entityId: id,
    after: { status: patch.status ?? null, summary: patch.summary ?? null },
  });
}
