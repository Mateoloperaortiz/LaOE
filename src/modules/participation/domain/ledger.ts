import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { pointsAdjusted, pointsReversed } from "@/domain-events/participation";
import { lockOpenTermPoints } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import type { PanalCheckpointId } from "../panal-types";
import { pointEntry } from "../schema";
import { ghPointCondition } from "./ledger-classification";
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

// Premios de la gamificación (ADR-067 regla 5): la base entra como CHALLENGE y el extra como
// BOOST, ambos ligados al `Reward` por `rewardId`; la corrección es una REVERSAL por entrada.

export interface CreditRewardInput {
  rewardId: string;
  personId: string;
  termId: string;
  kind: "CHALLENGE" | "BOOST";
  points: number;
  reason: string;
}

/** La entrada del kind dado de un premio, si existe (el unique parcial garantiza una sola). */
async function rewardEntry(
  ctx: CommandContext,
  rewardId: string,
  kind: "CHALLENGE" | "BOOST",
): Promise<PointEntryRow | null> {
  const [row] = await ctx.tx
    .select()
    .from(pointEntry)
    .where(and(eq(pointEntry.rewardId, rewardId), eq(pointEntry.kind, kind)))
    .limit(1);
  return row ?? null;
}

/** Acredita la base o el extra de un premio; idempotente por (rewardId, kind). Sin puntos, null. */
export async function creditReward(
  ctx: CommandContext,
  input: CreditRewardInput,
): Promise<PointEntryRow | null> {
  if (input.points <= 0) {
    return null;
  }
  await lockOpenTermPoints(ctx.tx, input.termId);
  const existing = await rewardEntry(ctx, input.rewardId, input.kind);
  if (existing) {
    return existing;
  }
  const [row] = await ctx.tx
    .insert(pointEntry)
    .values({
      personId: input.personId,
      termId: input.termId,
      rewardId: input.rewardId,
      kind: input.kind,
      points: input.points,
      reason: input.reason,
      createdById: ctx.actor.personId,
    })
    .returning();
  return row ?? null;
}

/** Revierte las entradas vivas (CHALLENGE y BOOST) de un premio. Devuelve los puntos revertidos. */
export async function reverseRewardCredits(
  ctx: CommandContext,
  rewardId: string,
  reason: string,
): Promise<number> {
  const entries = await ctx.tx
    .select()
    .from(pointEntry)
    .where(
      and(eq(pointEntry.rewardId, rewardId), inArray(pointEntry.kind, ["CHALLENGE", "BOOST"])),
    );
  const [first] = entries;
  if (!first) {
    return 0;
  }
  await lockOpenTermPoints(ctx.tx, first.termId);
  let reversed = 0;
  for (const entry of entries) {
    if (await reversalOf(ctx, entry.id)) {
      continue;
    }
    // La REVERSAL no lleva rewardId: el check lo exige nulo fuera de CHALLENGE y BOOST.
    await ctx.tx.insert(pointEntry).values({
      personId: entry.personId,
      termId: entry.termId,
      kind: "REVERSAL",
      points: -entry.points,
      reason,
      reversalOfId: entry.id,
      createdById: ctx.actor.personId,
    });
    reversed += entry.points;
  }
  return reversed;
}

// Premios de los juegos (ADR-119 regla 8): el libro es el único que sabe qué columna liga una
// entrada con su partida. Si acredita, cuánto, con qué motivo y qué evento sale lo decide el juego.

/** Los tipos de entrada que no son el premio de un juego. Cualquier otro del enum lo es. */
type NonGameKind =
  | "CHECKIN"
  | "ADJUSTMENT"
  | "REVERSAL"
  | "LEGACY"
  | "CHALLENGE"
  | "BOOST"
  | "PRESENCE_STREAK";
type GameKind = Exclude<PointEntryRow["kind"], NonGameKind>;

/**
 * La columna de `point_entry` que guarda la partida de cada juego. Es exhaustivo sobre el enum de
 * la tabla: un tipo nuevo no compila hasta que dice aquí cuál es la suya, o hasta que entra a
 * `NonGameKind` si no es un juego.
 */
const GAME_RUN_COLUMN = {
  WORDLE: "wordleGameId",
  GAME2048: "game2048RunId",
  SUDOKU: "sudokuRunId",
  PANAL: "panalGameId",
  COLOR: "colorRunId",
} as const satisfies Record<GameKind, keyof typeof pointEntry.$inferInsert>;

type GameRun =
  | { game: Exclude<GameKind, "PANAL">; runId: string }
  // La meta del Panal no es opcional: 1 a 3, o `null` en el premio único de antes de las metas.
  | { game: "PANAL"; runId: string; checkpoint: PanalCheckpointId | null };

type CreditGameInput = GameRun & {
  personId: string;
  termId: string;
  points: number;
  reason: string;
};

/**
 * Escribe el premio de una partida. El juego llega con el término tomado y abierto por la guardia
 * de la partida diaria (ADR-119 regla 7): aquí no se vuelve a tomar. Tampoco se busca una entrada
 * previa ni se descarta un premio sin puntos: los índices únicos por partida (y por meta en el
 * Panal) y los `check` de la tabla rechazan lo que el juego no debió mandar. La firma quien corre
 * el comando, como en el resto del libro; en los juegos es siempre quien juega.
 */
export async function creditGame(ctx: CommandContext, input: CreditGameInput): Promise<void> {
  const run: Partial<Record<(typeof GAME_RUN_COLUMN)[GameKind], string>> = {};
  run[GAME_RUN_COLUMN[input.game]] = input.runId;
  await ctx.tx.insert(pointEntry).values({
    personId: input.personId,
    termId: input.termId,
    ...run,
    ...(input.game === "PANAL" ? { panalCheckpoint: input.checkpoint } : {}),
    kind: input.game,
    points: input.points,
    reason: input.reason,
    createdById: ctx.actor.personId,
  });
}

/** El bono semanal pasa por el mismo escritor del libro que asistencias, retos y juegos. */
export async function creditPresenceBonus(
  ctx: CommandContext,
  input: {
    personId: string;
    termId: string;
    bonusId: string;
    points: number;
    reason: string;
  },
): Promise<void> {
  await lockOpenTermPoints(ctx.tx, input.termId);
  await ctx.tx.insert(pointEntry).values({
    personId: input.personId,
    termId: input.termId,
    kind: "PRESENCE_STREAK",
    presenceBonusId: input.bonusId,
    points: input.points,
    reason: input.reason,
    createdById: ctx.actor.personId,
  });
}

/** Compensa una liquidación anterior sin modificarla ni permitir dos reversiones. */
export async function reversePresenceBonus(
  ctx: CommandContext,
  entry: PointEntryRow,
  reason: string,
): Promise<void> {
  if (entry.kind !== "PRESENCE_STREAK") throw new Error("La entrada no es un bono presencial");
  await lockOpenTermPoints(ctx.tx, entry.termId);
  if (await reversalOf(ctx, entry.id)) return;
  await ctx.tx.insert(pointEntry).values({
    personId: entry.personId,
    termId: entry.termId,
    kind: "REVERSAL",
    points: -entry.points,
    reason,
    reversalOfId: entry.id,
    createdById: ctx.actor.personId,
  });
}

/** Saldo del término: `SUM(points)`, nunca persistido. */
export async function balanceFor(personId: string, termId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int` })
    .from(pointEntry)
    .where(and(eq(pointEntry.personId, personId), eq(pointEntry.termId, termId), ghPointCondition));
  return row?.total ?? 0;
}

/** Movimientos de la persona en el término, del más reciente al más viejo. */
export async function listEntriesFor(personId: string, termId: string): Promise<PointEntryRow[]> {
  return getDb()
    .select()
    .from(pointEntry)
    .where(and(eq(pointEntry.personId, personId), eq(pointEntry.termId, termId), ghPointCondition))
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
  await ctx.emit(
    eventOf(pointsAdjusted, {
      personId: input.personId,
      termId: input.termId,
      points: input.points,
      reason,
    }),
  );
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
  await ctx.emit(
    eventOf(pointsReversed, {
      personId: entry.personId,
      termId: entry.termId,
      points: entry.points,
      reason: cleanReason,
    }),
  );
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
  account: "GH" | "GAMER";
}

// SQL crudo con la tabla exterior calificada (dentro de una plantilla `sql` las columnas salen sin calificar).
const reversedBy = sql<string | null>`(
  select r.id from point_entry r where r.reversal_of_id = point_entry.id limit 1
)`;
const entryAccount = sql<"GH" | "GAMER">`case when ${ghPointCondition} then 'GH' else 'GAMER' end`;

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
      .select({ row: pointEntry, reversedById: reversedBy, account: entryAccount })
      .from(pointEntry)
      .where(where)
      .orderBy(desc(pointEntry.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(pointEntry).where(where),
  ]);
  return {
    rows: rows.map((item) => ({
      ...item.row,
      reversedById: item.reversedById,
      account: item.account,
    })),
    total: total?.n ?? 0,
  };
}

/** Todas las entradas de una persona (todos los términos), para la Persona 360. */
export async function listEntriesForPerson(personId: string): Promise<LedgerListRow[]> {
  const rows = await getDb()
    .select({ row: pointEntry, reversedById: reversedBy, account: entryAccount })
    .from(pointEntry)
    .where(eq(pointEntry.personId, personId))
    .orderBy(desc(pointEntry.createdAt));
  return rows.map((item) => ({
    ...item.row,
    reversedById: item.reversedById,
    account: item.account,
  }));
}
