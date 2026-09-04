import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { pointEntry } from "../schema";

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
