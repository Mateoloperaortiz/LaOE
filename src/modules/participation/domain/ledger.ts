import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { lockOpenTermPoints } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { pointEntry } from "../schema";
import { POINT_ENTRY_KINDS, type PointEntryKind } from "./ledger-pure";

// Ledger append-only (ADR-007): el crédito de un check-in nace en su misma transacción; corregir es
// revertir con motivo, nunca editar. El saldo es la suma.

export type PointEntryRow = typeof pointEntry.$inferSelect;

export interface CreditInput {
  checkInId: string;
  personId: string;
  termId: string;
  points: number;
  reason: string;
}

/** La entrada CHECKIN de un check-in, si existe (el unique parcial garantiza una sola). */
async function checkInEntry(ctx: CommandContext, checkInId: string): Promise<PointEntryRow | null> {
  const [row] = await ctx.tx
    .select()
    .from(pointEntry)
    .where(and(eq(pointEntry.checkInId, checkInId), eq(pointEntry.kind, "CHECKIN")))
    .limit(1);
  return row ?? null;
}

async function reversalOf(ctx: CommandContext, entryId: string): Promise<PointEntryRow | null> {
  const [row] = await ctx.tx
    .select()
    .from(pointEntry)
    .where(eq(pointEntry.reversalOfId, entryId))
    .limit(1);
  return row ?? null;
}

/** Acredita un check-in aprobado; si ya tiene su entrada, no duplica. Devuelve la entrada viva. */
export async function creditCheckIn(
  ctx: CommandContext,
  input: CreditInput,
): Promise<PointEntryRow | null> {
  if (input.points <= 0) {
    return null;
  }
  await lockOpenTermPoints(ctx.tx, input.termId);
  const existing = await checkInEntry(ctx, input.checkInId);
  if (existing) {
    return existing;
  }
  const [row] = await ctx.tx
    .insert(pointEntry)
    .values({
      personId: input.personId,
      termId: input.termId,
      checkInId: input.checkInId,
      kind: "CHECKIN",
      points: input.points,
      reason: input.reason,
      createdById: ctx.actor.personId,
    })
    .returning();
  return row ?? null;
}

/** Revierte el crédito vivo de un check-in (neto cero). Devuelve los puntos revertidos, 0 si no había. */
export async function reverseCheckInCredit(
  ctx: CommandContext,
  checkInId: string,
  reason: string,
): Promise<number> {
  const entry = await checkInEntry(ctx, checkInId);
  if (!entry || (await reversalOf(ctx, entry.id))) {
    return 0;
  }
  await lockOpenTermPoints(ctx.tx, entry.termId);
  await ctx.tx.insert(pointEntry).values({
    personId: entry.personId,
    termId: entry.termId,
    checkInId: entry.checkInId,
    kind: "REVERSAL",
    points: -entry.points,
    reason,
    reversalOfId: entry.id,
    createdById: ctx.actor.personId,
  });
  return entry.points;
}

/** Saldo del término: `SUM(points)`, nunca persistido. */
export async function balanceFor(personId: string, termId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int` })
    .from(pointEntry)
    .where(and(eq(pointEntry.personId, personId), eq(pointEntry.termId, termId)));
  return row?.total ?? 0;
}

/** Movimientos de la persona en el término, del más reciente al más viejo. */
export async function listEntriesFor(personId: string, termId: string): Promise<PointEntryRow[]> {
  return getDb()
    .select()
    .from(pointEntry)
    .where(and(eq(pointEntry.personId, personId), eq(pointEntry.termId, termId)))
    .orderBy(desc(pointEntry.createdAt));
}

// Ajustes y reversiones manuales (ADR-007, ADR-035 regla 9): ADMIN con motivo; solo se revierten
// ajustes e históricos, y nunca una reversión.

export interface AdjustInput {
  personId: string;
  termId: string;
  points: number;
  reason: string;
}

export async function adjustPoints(
  ctx: CommandContext,
  input: AdjustInput,
): Promise<PointEntryRow> {
  await lockOpenTermPoints(ctx.tx, input.termId);
  if (!Number.isInteger(input.points) || input.points === 0) {
    throw new DomainError(t("T-627"), "points");
  }
  const reason = input.reason.trim();
  if (!reason) {
    throw new DomainError(t("T-628"), "reason");
  }
  const [row] = await ctx.tx
    .insert(pointEntry)
    .values({
      personId: input.personId,
      termId: input.termId,
      kind: "ADJUSTMENT",
      points: input.points,
      reason,
      createdById: ctx.actor.personId,
    })
    .returning();
  if (!row) {
    throw new Error("No se pudo registrar el ajuste");
  }
  await ctx.audit({
    action: "points.adjusted",
    entityType: "point_entry",
    entityId: row.id,
    after: { personId: input.personId, termId: input.termId, points: input.points, reason },
  });
  await ctx.emit({
    type: "points.adjusted",
    payload: { personId: input.personId, termId: input.termId, points: input.points, reason },
  });
  return row;
}

export async function reverseEntry(
  ctx: CommandContext,
  entryId: string,
  reason: string,
): Promise<PointEntryRow> {
  const [entry] = await ctx.tx.select().from(pointEntry).where(eq(pointEntry.id, entryId)).limit(1);
  if (!entry) {
    throw new DomainError(t("T-032"));
  }
  if (entry.kind !== "ADJUSTMENT" && entry.kind !== "LEGACY") {
    throw new DomainError(t("T-632"));
  }
  await lockOpenTermPoints(ctx.tx, entry.termId);
  if (await reversalOf(ctx, entry.id)) {
    throw new DomainError(t("T-633"));
  }
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new DomainError(t("T-628"), "reason");
  }
  const [row] = await ctx.tx
    .insert(pointEntry)
    .values({
      personId: entry.personId,
      termId: entry.termId,
      checkInId: entry.checkInId,
      kind: "REVERSAL",
      points: -entry.points,
      reason: cleanReason,
      reversalOfId: entry.id,
      createdById: ctx.actor.personId,
    })
    .returning();
  if (!row) {
    throw new Error("No se pudo revertir");
  }
  await ctx.audit({
    action: "points.reversed",
    entityType: "point_entry",
    entityId: row.id,
    before: { entryId: entry.id, points: entry.points },
    after: { points: row.points, reason: cleanReason },
  });
  await ctx.emit({
    type: "points.reversed",
    payload: {
      personId: entry.personId,
      termId: entry.termId,
      points: entry.points,
      reason: cleanReason,
    },
  });
  return row;
}

export interface LedgerListParams {
  personId?: string | undefined;
  termId?: string | undefined;
  kind?: string | undefined;
  page: number;
  pageSize: number;
}

export interface LedgerListRow extends PointEntryRow {
  /** Id de la reversión que anula esta entrada, si existe. */
  reversedById: string | null;
}

// SQL crudo con la tabla exterior calificada (dentro de una plantilla `sql` las columnas salen sin calificar).
const reversedBy = sql<string | null>`(
  select r.id from point_entry r where r.reversal_of_id = point_entry.id limit 1
)`;

export async function listLedger(
  params: LedgerListParams,
): Promise<{ rows: LedgerListRow[]; total: number }> {
  const conditions = [];
  if (params.personId) {
    conditions.push(eq(pointEntry.personId, params.personId));
  }
  if (params.termId) {
    conditions.push(eq(pointEntry.termId, params.termId));
  }
  if (POINT_ENTRY_KINDS.includes(params.kind as PointEntryKind)) {
    conditions.push(eq(pointEntry.kind, params.kind as PointEntryKind));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({ row: pointEntry, reversedById: reversedBy })
      .from(pointEntry)
      .where(where)
      .orderBy(desc(pointEntry.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(pointEntry).where(where),
  ]);
  return {
    rows: rows.map((item) => ({ ...item.row, reversedById: item.reversedById })),
    total: total?.n ?? 0,
  };
}

/** Todas las entradas de una persona (todos los términos), para la Persona 360. */
export async function listEntriesForPerson(personId: string): Promise<LedgerListRow[]> {
  const rows = await getDb()
    .select({ row: pointEntry, reversedById: reversedBy })
    .from(pointEntry)
    .where(eq(pointEntry.personId, personId))
    .orderBy(desc(pointEntry.createdAt));
  return rows.map((item) => ({ ...item.row, reversedById: item.reversedById }));
}
