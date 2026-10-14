import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type CommandContext, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { gamificationReconcile } from "@/domain-events/participation";
import { listMembershipPersonIds } from "@/modules/people";
import { t, tLabels } from "@/shared/copy";
import { withoutQueryValues } from "@/shared/lib/error-sanitizer";
import { DomainError } from "@/shared/lib/errors";
import { badgeReconciliationRun, reconciliationStatus } from "../schema";
import { recomputeBadgesFor } from "./badges";

// Conciliación histórica (ADR-067 reglas 11 y 13): reconoce insignias por hechos de cualquier
// semestre — incluidos los importados de GHPOINTS y la historia de egresados (ADR-030) — sin
// puntos, boosters ni avisos. Corre por lotes encadenados por el outbox con cursor por personId:
// cada lote es idempotente y una corrida FAILED reanuda desde donde quedó.

export type ReconciliationRunRow = typeof badgeReconciliationRun.$inferSelect;

/**
 * El estado de una corrida con la palabra del catálogo (T-2559, en el orden del enum): es lo que
 * nombra el error de reanudar una que no quedó con error (ADR-123 regla 8).
 */
function reconciliationStatusLabel(status: ReconciliationRunRow["status"]): string {
  return tLabels("T-2559", reconciliationStatus.enumValues)[status] ?? status;
}

export const RECONCILE_BATCH = 100;
const REPORT_SAMPLE_MAX = 50;

export interface ReportSampleEntry {
  personId: string;
  code: string;
  level: number;
  action: "UNLOCK" | "REVOKE";
}

export interface ReconciliationReport {
  sample: ReportSampleEntry[];
  batches: number;
}

export function reconciliationReport(run: ReconciliationRunRow): ReconciliationReport {
  const report = (run.report ?? {}) as Partial<ReconciliationReport>;
  return { sample: report.sample ?? [], batches: report.batches ?? 0 };
}

export async function startReconciliation(
  ctx: CommandContext,
  input: { mode: "DRY_RUN" | "APPLY" },
): Promise<{ id: string }> {
  const [running] = await ctx.tx
    .select({ id: badgeReconciliationRun.id })
    .from(badgeReconciliationRun)
    .where(eq(badgeReconciliationRun.status, "RUNNING"))
    .limit(1);
  if (running) {
    throw new DomainError(t("T-2561"));
  }
  const [row] = await ctx.tx
    .insert(badgeReconciliationRun)
    .values({ mode: input.mode, startedById: ctx.actor.personId })
    .returning({ id: badgeReconciliationRun.id });
  if (!row) throw new Error("badge_reconciliation_run: insert sin fila");
  await ctx.audit({
    action: "reconciliation.started",
    entityType: "badge_reconciliation_run",
    entityId: row.id,
    before: null,
    after: { mode: input.mode },
  });
  await ctx.emit(
    eventOf(
      gamificationReconcile,
      { runId: row.id, batch: 0 },
      { dedupeKey: `reconcile:${row.id}:0` },
    ),
  );
  return row;
}

export async function resumeReconciliation(ctx: CommandContext, runId: string): Promise<void> {
  const [row] = await ctx.tx
    .select()
    .from(badgeReconciliationRun)
    .where(eq(badgeReconciliationRun.id, runId))
    .limit(1);
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status !== "FAILED") {
    throw new DomainError(
      t("T-3268", { estado: reconciliationStatusLabel(row.status).toLowerCase() }),
    );
  }
  await ctx.tx
    .update(badgeReconciliationRun)
    .set({ status: "RUNNING", error: null })
    .where(eq(badgeReconciliationRun.id, runId));
  await ctx.audit({
    action: "reconciliation.resumed",
    entityType: "badge_reconciliation_run",
    entityId: runId,
    before: { status: row.status, error: row.error },
    after: { status: "RUNNING" },
  });
  // La clave lleva `processed` (no el índice del lote): las claves de lotes ya despachados quedan
  // libres al marcarse processedAt, pero un índice repetido podría chocar con un lote pendiente.
  await ctx.emit(
    eventOf(
      gamificationReconcile,
      { runId, batch: reconciliationReport(row).batches },
      { dedupeKey: `reconcile:${runId}:${row.processed}` },
    ),
  );
}

/**
 * Un lote de la corrida: personas con membresía (cualquier estado) tras el cursor, en orden.
 * Devuelve cuántas procesó y si la corrida terminó (DONE) o sigue.
 */
export async function processReconciliationBatch(
  runId: string,
  batchSize = RECONCILE_BATCH,
): Promise<{ processed: number; done: boolean }> {
  const [run] = await getDb()
    .select()
    .from(badgeReconciliationRun)
    .where(eq(badgeReconciliationRun.id, runId))
    .limit(1);
  if (!run || run.status !== "RUNNING") {
    return { processed: 0, done: true };
  }

  const people = await listMembershipPersonIds(run.cursor, batchSize);
  if (people.length === 0) {
    await finishRun(runId, "DONE");
    return { processed: 0, done: true };
  }

  const delta = { unlocked: 0, revoked: 0 };
  const sample: ReportSampleEntry[] = [];
  try {
    for (const personId of people) {
      const result = await recomputeBadgesFor(personId, {
        historical: true,
        dryRun: run.mode === "DRY_RUN",
      });
      delta.unlocked += result.unlocked.length;
      delta.revoked += result.revoked.length;
      if (sample.length < REPORT_SAMPLE_MAX) {
        for (const item of result.unlocked) {
          if (sample.length >= REPORT_SAMPLE_MAX) break;
          sample.push({ personId, code: item.code, level: item.level, action: "UNLOCK" });
        }
        for (const item of result.revoked) {
          if (sample.length >= REPORT_SAMPLE_MAX) break;
          sample.push({ personId, code: item.code, level: item.level, action: "REVOKE" });
        }
      }
    }
  } catch (error) {
    // Lo que se guarda pasa por el recorte del registro: sin los valores de la consulta que falló ni
    // los datos de una conexión que no abrió, que quedarían en la corrida, a la vista en el admin, y
    // en su auditoría (ADR-120 regla 11).
    const message = (
      error instanceof Error ? withoutQueryValues(error, error.message) : String(error)
    ).slice(0, 500);
    await runCommand(SYSTEM_ACTOR, async (ctx) => {
      await ctx.tx
        .update(badgeReconciliationRun)
        .set({ status: "FAILED", error: message, finishedAt: new Date() })
        .where(eq(badgeReconciliationRun.id, runId));
      await ctx.audit({
        action: "reconciliation.failed",
        entityType: "badge_reconciliation_run",
        entityId: runId,
        before: null,
        after: { error: message },
      });
    });
    return { processed: 0, done: true };
  }

  const lastCursor = people.at(-1) ?? run.cursor;
  const full = people.length === batchSize;
  await runCommand(SYSTEM_ACTOR, async (ctx) => {
    const [current] = await ctx.tx
      .select({
        processed: badgeReconciliationRun.processed,
        unlocked: badgeReconciliationRun.unlocked,
        revoked: badgeReconciliationRun.revoked,
        report: badgeReconciliationRun.report,
      })
      .from(badgeReconciliationRun)
      .where(eq(badgeReconciliationRun.id, runId))
      .limit(1);
    const prevReport = (current?.report ?? {}) as Partial<ReconciliationReport>;
    const merged = [...(prevReport.sample ?? []), ...sample].slice(0, REPORT_SAMPLE_MAX);
    const batches = (prevReport.batches ?? 0) + 1;
    await ctx.tx
      .update(badgeReconciliationRun)
      .set({
        cursor: lastCursor,
        processed: (current?.processed ?? 0) + people.length,
        unlocked: (current?.unlocked ?? 0) + delta.unlocked,
        revoked: (current?.revoked ?? 0) + delta.revoked,
        report: { sample: merged, batches },
        ...(full ? {} : { status: "DONE" as const, finishedAt: new Date() }),
      })
      .where(eq(badgeReconciliationRun.id, runId));
    if (full) {
      // Clave distinta por lote: el evento en curso sigue pendiente y el dedupeKey del único
      // parcial descartaría uno repetido.
      await ctx.emit(
        eventOf(
          gamificationReconcile,
          { runId, batch: batches },
          { dedupeKey: `reconcile:${runId}:${batches}` },
        ),
      );
    }
  });
  return { processed: people.length, done: !full };
}

async function finishRun(runId: string, status: "DONE"): Promise<void> {
  await runCommand(SYSTEM_ACTOR, async (ctx) => {
    await ctx.tx
      .update(badgeReconciliationRun)
      .set({ status, finishedAt: new Date() })
      .where(eq(badgeReconciliationRun.id, runId));
  });
}

export async function listReconciliationRuns(limit = 10): Promise<ReconciliationRunRow[]> {
  return getDb()
    .select()
    .from(badgeReconciliationRun)
    .orderBy(desc(badgeReconciliationRun.startedAt))
    .limit(limit);
}

export async function getReconciliationRun(id: string): Promise<ReconciliationRunRow | null> {
  const [row] = await getDb()
    .select()
    .from(badgeReconciliationRun)
    .where(eq(badgeReconciliationRun.id, id))
    .limit(1);
  return row ?? null;
}
