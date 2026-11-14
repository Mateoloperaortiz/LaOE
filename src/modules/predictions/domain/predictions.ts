import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import {
  balanceFor,
  findCheckIn,
  getOccasion,
  ghBalanceIn,
  listAthleticMatches,
  type PredictionEntryKind,
  recordPredictionEntry,
} from "@/modules/participation";
import { currentSeatAuthority } from "@/modules/people";
import { leadsWorkCommittee } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { t, tLabels, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  predictionMarket,
  predictionOption,
  predictionPick,
  predictionSettings,
  predictionTicket,
} from "../schema";
import { distributePool, parlayWon } from "./pools-pure";
import { PREDICTION_MARKET_STATUSES, PREDICTION_TICKET_STATUSES } from "./predictions-pure";

// Los pronósticos del Athletic (ADR-197 regla 7 y su precisión). Quien lidera el Athletic en el
// semestre crea, abre, resuelve y cancela los pronósticos de cada partido; quien decide por la VP de
// Gestión Humana fija el tope por persona y por partido. Pronostica quien registró su asistencia al
// partido, hasta que empieza, con los GH Points que tiene. Cada pronóstico sencillo entra a la bolsa
// de su pronóstico; cada parley, a la bolsa de parleys de su partido.

export type MarketRow = typeof predictionMarket.$inferSelect;
export type TicketRow = typeof predictionTicket.$inferSelect;

const SETTINGS_ID = "ATHLETIC";
const REGISTERED = ["PENDING", "APPROVED"] as const;
const DAY_MS = 86_400_000;
const guard = (index: number) => tList("T-5149")[index] ?? "";

async function termIdNow(): Promise<string> {
  const term = await getCurrentTerm();
  if (!term) throw new DomainError(t("T-032"));
  return term.id;
}

async function assertAthleticLeader(ctx: CommandContext): Promise<void> {
  const term = await getCurrentTerm();
  const leads =
    ctx.actor.personId !== null &&
    term !== null &&
    (await leadsWorkCommittee(ctx.actor.personId, term.id, "ATHLETIC", ctx.tx));
  if (!leads) throw new DomainError(guard(0));
}

/** El partido del pronóstico: una ocasión del Athletic que no se canceló. */
async function athleticMatch(occasionId: string) {
  const match = await getOccasion(occasionId);
  if (!match || match.category !== "ATHLETIC_MATCH" || match.status === "CANCELLED") {
    throw new DomainError(guard(1));
  }
  return match;
}

async function lockMarket(ctx: CommandContext, id: string): Promise<MarketRow> {
  const [row] = await ctx.tx
    .select()
    .from(predictionMarket)
    .where(eq(predictionMarket.id, id))
    .for("update");
  if (!row) throw new DomainError(t("T-032"));
  return row;
}

// --- El tope ---

export async function getMatchCap(exec: Executor = getDb()): Promise<number | null> {
  const [row] = await exec
    .select({ matchCap: predictionSettings.matchCap })
    .from(predictionSettings)
    .where(eq(predictionSettings.id, SETTINGS_ID));
  return row?.matchCap ?? null;
}

/** Gestión Humana fija cuántos GH Points puede apostar una persona en un partido. */
export async function setMatchCap(ctx: CommandContext, rawCap: number): Promise<void> {
  const cap = z.number().int().min(1).max(1000).parse(rawCap);
  const decides =
    ctx.actor.personId !== null &&
    (await currentSeatAuthority(ctx.actor.personId, "VP_GH", ctx.tx)) !== null;
  if (!decides) throw new DomainError(guard(2));
  const before = await getMatchCap(ctx.tx);
  await ctx.tx
    .insert(predictionSettings)
    .values({ id: SETTINGS_ID, matchCap: cap, updatedById: ctx.actor.personId })
    .onConflictDoUpdate({
      target: predictionSettings.id,
      set: { matchCap: cap, updatedById: ctx.actor.personId },
    });
  await ctx.audit({
    action: "prediction.cap-set",
    entityType: "prediction_settings",
    entityId: SETTINGS_ID,
    before: { matchCap: before },
    after: { matchCap: cap },
  });
}

// --- Los pronósticos de un partido ---

export const marketInputSchema = z.object({
  occasionId: z.string().trim().min(1),
  title: z.string().trim().min(2).max(160),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(12),
});

export type MarketInput = z.input<typeof marketInputSchema>;

/** Nace en borrador; las opciones no se repiten. */
export async function createMarket(
  ctx: CommandContext,
  raw: MarketInput,
  now = new Date(),
): Promise<{ id: string }> {
  const input = marketInputSchema.parse(raw);
  await assertAthleticLeader(ctx);
  const match = await athleticMatch(input.occasionId);
  if (match.startsAt <= now) throw new DomainError(guard(3));
  const options = [...new Set(input.options)];
  if (options.length < 2) throw new DomainError(guard(4), "options");
  const [row] = await ctx.tx
    .insert(predictionMarket)
    .values({ occasionId: input.occasionId, title: input.title, createdById: ctx.actor.personId })
    .returning({ id: predictionMarket.id });
  if (!row) throw new Error("No se pudo crear el pronóstico");
  await ctx.tx
    .insert(predictionOption)
    .values(options.map((label, index) => ({ marketId: row.id, label, sortOrder: index })));
  await ctx.audit({
    action: "prediction.market-created",
    entityType: "prediction_market",
    entityId: row.id,
    after: { occasionId: input.occasionId, title: input.title, options },
  });
  return row;
}

/** Abrirlo exige el tope de Gestión Humana y que el partido no haya empezado. */
export async function openMarket(ctx: CommandContext, id: string, now = new Date()): Promise<void> {
  await assertAthleticLeader(ctx);
  const market = await lockMarket(ctx, id);
  if (market.status !== "DRAFT") throw new DomainError(guard(5));
  if ((await getMatchCap(ctx.tx)) === null) throw new DomainError(guard(6));
  const match = await athleticMatch(market.occasionId);
  if (match.startsAt <= now) throw new DomainError(guard(3));
  await ctx.tx.update(predictionMarket).set({ status: "OPEN" }).where(eq(predictionMarket.id, id));
  await ctx.audit({
    action: "prediction.market-opened",
    entityType: "prediction_market",
    entityId: id,
    before: { status: "DRAFT" },
    after: { status: "OPEN" },
  });
}

/** El resultado se registra cuando el partido ya empezó, y reparte la bolsa. */
export async function resolveMarket(
  ctx: CommandContext,
  id: string,
  optionId: string,
  now = new Date(),
): Promise<void> {
  await assertAthleticLeader(ctx);
  const market = await lockMarket(ctx, id);
  if (market.status !== "OPEN") throw new DomainError(guard(5));
  const match = await athleticMatch(market.occasionId);
  if (match.startsAt > now) throw new DomainError(guard(7));
  const [option] = await ctx.tx
    .select({ id: predictionOption.id })
    .from(predictionOption)
    .where(and(eq(predictionOption.id, optionId), eq(predictionOption.marketId, id)));
  if (!option) throw new DomainError(guard(8), "optionId");
  await ctx.tx
    .update(predictionMarket)
    .set({
      status: "RESOLVED",
      winningOptionId: optionId,
      resolvedById: ctx.actor.personId,
      resolvedAt: now,
    })
    .where(eq(predictionMarket.id, id));
  await ctx.audit({
    action: "prediction.market-resolved",
    entityType: "prediction_market",
    entityId: id,
    before: { status: "OPEN" },
    after: { status: "RESOLVED", winningOptionId: optionId },
  });
  await settleSingles(
    ctx,
    { ...market, status: "RESOLVED", winningOptionId: optionId },
    match.title,
    now,
  );
  await settleParlays(ctx, market.occasionId, match.title, now);
}

/** Cancelarlo devuelve lo apostado en él, y los parleys que lo incluyen. */
export async function cancelMarket(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<void> {
  await assertAthleticLeader(ctx);
  const market = await lockMarket(ctx, id);
  if (market.status !== "DRAFT" && market.status !== "OPEN") throw new DomainError(guard(5));
  const match = await getOccasion(market.occasionId);
  await ctx.tx
    .update(predictionMarket)
    .set({ status: "CANCELLED" })
    .where(eq(predictionMarket.id, id));
  await ctx.audit({
    action: "prediction.market-cancelled",
    entityType: "prediction_market",
    entityId: id,
    before: { status: market.status },
    after: { status: "CANCELLED" },
  });
  const title = match?.title ?? "";
  await settleSingles(ctx, { ...market, status: "CANCELLED" }, title, now);
  await settleParlays(ctx, market.occasionId, title, now);
}

// --- Pronosticar ---

export const ticketInputSchema = z.object({
  occasionId: z.string().trim().min(1),
  stake: z.number().int().min(1),
  picks: z
    .array(z.object({ marketId: z.string().trim().min(1), optionId: z.string().trim().min(1) }))
    .min(1)
    .max(12),
});

export type TicketInput = z.input<typeof ticketInputSchema>;

/**
 * Un pronóstico sencillo (una elección) o un parley (varias, de pronósticos distintos del mismo
 * partido). Solo quien registró su asistencia, hasta que el partido empieza, dentro del tope y del
 * saldo GH.
 */
export async function placePrediction(
  ctx: CommandContext,
  raw: TicketInput,
  now = new Date(),
): Promise<{ id: string }> {
  const input = ticketInputSchema.parse(raw);
  const personId = ctx.actor.personId;
  if (!personId) throw new DomainError(guard(9));
  const match = await athleticMatch(input.occasionId);
  if (match.startsAt <= now) throw new DomainError(guard(3));
  const checkIn = await findCheckIn(input.occasionId, personId);
  if (!checkIn || !(REGISTERED as readonly string[]).includes(checkIn.status)) {
    throw new DomainError(guard(9));
  }
  const marketIds = input.picks.map((pick) => pick.marketId);
  if (new Set(marketIds).size !== marketIds.length) throw new DomainError(guard(10));
  const markets = await ctx.tx
    .select()
    .from(predictionMarket)
    .where(inArray(predictionMarket.id, marketIds));
  const options = await ctx.tx
    .select()
    .from(predictionOption)
    .where(
      inArray(
        predictionOption.id,
        input.picks.map((pick) => pick.optionId),
      ),
    );
  for (const pick of input.picks) {
    const market = markets.find((item) => item.id === pick.marketId);
    const option = options.find((item) => item.id === pick.optionId);
    if (
      !market ||
      market.occasionId !== input.occasionId ||
      market.status !== "OPEN" ||
      option?.marketId !== market.id
    ) {
      throw new DomainError(guard(11));
    }
  }
  const termId = await termIdNow();
  // Uno a la vez por persona: dos pronósticos simultáneos no gastan el mismo saldo ni el mismo tope.
  await ctx.tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`prediction:${personId}`}))`);
  const cap = await getMatchCap(ctx.tx);
  if (cap === null) throw new DomainError(guard(6));
  const [spent] = await ctx.tx
    .select({ total: sql<number>`coalesce(sum(${predictionTicket.stake}), 0)::int` })
    .from(predictionTicket)
    .where(
      and(
        eq(predictionTicket.personId, personId),
        eq(predictionTicket.occasionId, input.occasionId),
      ),
    );
  const used = spent?.total ?? 0;
  if (used + input.stake > cap) {
    throw new DomainError(t("T-5153", { n: Math.max(cap - used, 0) }), "stake");
  }
  if ((await ghBalanceIn(ctx, personId, termId)) < input.stake) {
    throw new DomainError(guard(12), "stake");
  }
  const [ticket] = await ctx.tx
    .insert(predictionTicket)
    .values({ occasionId: input.occasionId, personId, termId, stake: input.stake })
    .returning({ id: predictionTicket.id });
  if (!ticket) throw new Error("No se pudo guardar el pronóstico");
  await ctx.tx
    .insert(predictionPick)
    .values(input.picks.map((pick) => ({ ticketId: ticket.id, ...pick })));
  await recordPredictionEntry(ctx, {
    personId,
    termId,
    kind: "PREDICTION_STAKE",
    points: -input.stake,
    ticketId: ticket.id,
    reason: reasonFor("PREDICTION_STAKE", match.title),
  });
  await ctx.audit({
    action: "prediction.placed",
    entityType: "prediction_ticket",
    entityId: ticket.id,
    after: { occasionId: input.occasionId, stake: input.stake, picks: input.picks },
  });
  return ticket;
}

function reasonFor(kind: PredictionEntryKind, match: string): string {
  const [stake, payout, refund] = tList("T-5152");
  const text = kind === "PREDICTION_STAKE" ? stake : kind === "PREDICTION_PAYOUT" ? payout : refund;
  return (text ?? "").replace("{partido}", match);
}

// --- Repartir ---

interface Settling {
  ticket: TicketRow;
  won: boolean;
}

/** Cierra un grupo de pronósticos: los que ya no asisten se devuelven; el resto, por bolsa. */
async function settle(
  ctx: CommandContext,
  group: Settling[],
  refunds: TicketRow[],
  match: string,
  now: Date,
): Promise<void> {
  const eligible: Settling[] = [];
  for (const item of group) {
    const checkIn = await findCheckIn(item.ticket.occasionId, item.ticket.personId);
    if (checkIn && (REGISTERED as readonly string[]).includes(checkIn.status)) eligible.push(item);
    else refunds.push(item.ticket);
  }
  const outcome = distributePool(
    eligible.map((item) => ({
      id: item.ticket.id,
      stake: item.ticket.stake,
      createdAt: item.ticket.createdAt,
      won: item.won,
    })),
  );
  if (outcome.kind === "REFUNDED") refunds.push(...eligible.map((item) => item.ticket));
  for (const ticket of refunds) await close(ctx, ticket, "REFUNDED", ticket.stake, match, now);
  if (outcome.kind === "PAID") {
    for (const item of eligible) {
      const payout = outcome.payouts.get(item.ticket.id) ?? 0;
      await close(ctx, item.ticket, payout > 0 ? "WON" : "LOST", payout, match, now);
    }
  }
}

async function close(
  ctx: CommandContext,
  ticket: TicketRow,
  status: "WON" | "LOST" | "REFUNDED",
  payout: number,
  match: string,
  now: Date,
): Promise<void> {
  await ctx.tx
    .update(predictionTicket)
    .set({ status, payout, settledAt: now })
    .where(and(eq(predictionTicket.id, ticket.id), eq(predictionTicket.status, "OPEN")));
  if (payout <= 0) return;
  const kind = status === "REFUNDED" ? "PREDICTION_REFUND" : "PREDICTION_PAYOUT";
  await recordPredictionEntry(ctx, {
    personId: ticket.personId,
    termId: ticket.termId,
    kind,
    points: payout,
    ticketId: ticket.id,
    reason: reasonFor(kind, match),
  });
}

/** Los pronósticos sencillos de un pronóstico ya resuelto o cancelado. */
async function settleSingles(
  ctx: CommandContext,
  market: MarketRow,
  match: string,
  now: Date,
): Promise<void> {
  const rows = await ctx.tx
    .select({ ticket: predictionTicket, optionId: predictionPick.optionId })
    .from(predictionPick)
    .innerJoin(predictionTicket, eq(predictionTicket.id, predictionPick.ticketId))
    .where(and(eq(predictionPick.marketId, market.id), eq(predictionTicket.status, "OPEN")));
  const counts = await pickCounts(
    ctx,
    rows.map((row) => row.ticket.id),
  );
  const singles = rows.filter((row) => counts.get(row.ticket.id) === 1);
  if (market.status === "CANCELLED") {
    await settle(
      ctx,
      [],
      singles.map((row) => row.ticket),
      match,
      now,
    );
    return;
  }
  await settle(
    ctx,
    singles.map((row) => ({ ticket: row.ticket, won: row.optionId === market.winningOptionId })),
    [],
    match,
    now,
  );
}

async function pickCounts(ctx: CommandContext, ticketIds: string[]): Promise<Map<string, number>> {
  if (ticketIds.length === 0) return new Map();
  const rows = await ctx.tx
    .select({ ticketId: predictionPick.ticketId, n: sql<number>`count(*)::int` })
    .from(predictionPick)
    .where(inArray(predictionPick.ticketId, ticketIds))
    .groupBy(predictionPick.ticketId);
  return new Map(rows.map((row) => [row.ticketId, row.n]));
}

/**
 * La bolsa de parleys de un partido se reparte cuando ya se resolvió o se canceló cada pronóstico que
 * incluyen sus parleys abiertos. Un parley con un pronóstico cancelado se devuelve.
 */
async function settleParlays(
  ctx: CommandContext,
  occasionId: string,
  match: string,
  now: Date,
): Promise<void> {
  const open = await ctx.tx
    .select()
    .from(predictionTicket)
    .where(and(eq(predictionTicket.occasionId, occasionId), eq(predictionTicket.status, "OPEN")));
  const counts = await pickCounts(
    ctx,
    open.map((ticket) => ticket.id),
  );
  const parlays = open.filter((ticket) => (counts.get(ticket.id) ?? 0) > 1);
  if (parlays.length === 0) return;
  const picks = await ctx.tx
    .select({
      ticketId: predictionPick.ticketId,
      optionId: predictionPick.optionId,
      status: predictionMarket.status,
      winningOptionId: predictionMarket.winningOptionId,
    })
    .from(predictionPick)
    .innerJoin(predictionMarket, eq(predictionMarket.id, predictionPick.marketId))
    .where(
      inArray(
        predictionPick.ticketId,
        parlays.map((ticket) => ticket.id),
      ),
    );
  if (picks.some((pick) => pick.status === "OPEN" || pick.status === "DRAFT")) return;
  const refunds: TicketRow[] = [];
  const group: Settling[] = [];
  for (const ticket of parlays) {
    const own = picks.filter((pick) => pick.ticketId === ticket.id);
    if (own.some((pick) => pick.status === "CANCELLED")) refunds.push(ticket);
    else group.push({ ticket, won: parlayWon(own) });
  }
  await settle(ctx, group, refunds, match, now);
}

// --- Lecturas ---

export interface MarketView {
  id: string;
  title: string;
  status: MarketRow["status"];
  winningOptionId: string | null;
  options: Array<{ id: string; label: string; pool: number }>;
  /** Lo apostado en pronósticos sencillos de este pronóstico. */
  pool: number;
}

export interface MatchView {
  id: string;
  title: string;
  startsAt: Date;
  markets: MarketView[];
  /** Lo apostado en parleys de este partido. */
  parlayPool: number;
}

async function marketsFor(occasionIds: string[]): Promise<Map<string, MarketView[]>> {
  const result = new Map<string, MarketView[]>();
  if (occasionIds.length === 0) return result;
  const db = getDb();
  const markets = await db
    .select()
    .from(predictionMarket)
    .where(inArray(predictionMarket.occasionId, occasionIds))
    .orderBy(asc(predictionMarket.createdAt));
  const ids = markets.map((market) => market.id);
  const [options, picks] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select()
            .from(predictionOption)
            .where(inArray(predictionOption.marketId, ids))
            .orderBy(asc(predictionOption.sortOrder)),
          db
            .select({
              ticketId: predictionPick.ticketId,
              marketId: predictionPick.marketId,
              optionId: predictionPick.optionId,
              stake: predictionTicket.stake,
            })
            .from(predictionPick)
            .innerJoin(predictionTicket, eq(predictionTicket.id, predictionPick.ticketId))
            .where(inArray(predictionPick.marketId, ids)),
        ]);
  const legs = new Map<string, number>();
  for (const pick of picks) legs.set(pick.ticketId, (legs.get(pick.ticketId) ?? 0) + 1);
  const singles = picks.filter((pick) => legs.get(pick.ticketId) === 1);
  for (const market of markets) {
    const own = options.filter((option) => option.marketId === market.id);
    const view: MarketView = {
      id: market.id,
      title: market.title,
      status: market.status,
      winningOptionId: market.winningOptionId,
      options: own.map((option) => ({
        id: option.id,
        label: option.label,
        pool: singles
          .filter((pick) => pick.optionId === option.id)
          .reduce((sum, pick) => sum + pick.stake, 0),
      })),
      pool: singles
        .filter((pick) => pick.marketId === market.id)
        .reduce((sum, pick) => sum + pick.stake, 0),
    };
    result.set(market.occasionId, [...(result.get(market.occasionId) ?? []), view]);
  }
  return result;
}

async function parlayPools(occasionIds: string[]): Promise<Map<string, number>> {
  if (occasionIds.length === 0) return new Map();
  const rows = await getDb()
    .select({
      occasionId: predictionTicket.occasionId,
      stake: predictionTicket.stake,
      legs: sql<number>`(select count(*) from prediction_pick p where p.ticket_id = ${predictionTicket.id})::int`,
    })
    .from(predictionTicket)
    .where(inArray(predictionTicket.occasionId, occasionIds));
  const pools = new Map<string, number>();
  for (const row of rows) {
    if (row.legs > 1) pools.set(row.occasionId, (pools.get(row.occasionId) ?? 0) + row.stake);
  }
  return pools;
}

/** Los partidos del último mes y de los próximos dos meses, con sus pronósticos y bolsas. */
export async function listPredictionMatches(now = new Date()): Promise<MatchView[]> {
  const matches = await listAthleticMatches(
    new Date(now.getTime() - 30 * DAY_MS),
    new Date(now.getTime() + 60 * DAY_MS),
  );
  const ids = matches.map((match) => match.id);
  const [markets, pools] = await Promise.all([marketsFor(ids), parlayPools(ids)]);
  return matches.map((match) => ({
    id: match.id,
    title: match.title,
    startsAt: match.startsAt,
    markets: markets.get(match.id) ?? [],
    parlayPool: pools.get(match.id) ?? 0,
  }));
}

export interface MyTicket {
  id: string;
  occasionId: string;
  stake: number;
  status: TicketRow["status"];
  payout: number | null;
  picks: Array<{ marketTitle: string; optionLabel: string }>;
}

export interface MyPredictions {
  balance: number;
  cap: number | null;
  /** Los partidos con asistencia registrada que todavía no empiezan, con lo que ya apostó en cada uno. */
  matches: Array<MatchView & { spent: number }>;
  tickets: MyTicket[];
}

/** Lo que ve una persona en Mi OE: dónde puede pronosticar y lo que ya pronosticó. */
export async function myPredictions(personId: string, now = new Date()): Promise<MyPredictions> {
  const term = await getCurrentTerm();
  const [all, cap, balance, tickets] = await Promise.all([
    listPredictionMatches(now),
    getMatchCap(),
    term ? balanceFor(personId, term.id) : 0,
    getDb()
      .select()
      .from(predictionTicket)
      .where(eq(predictionTicket.personId, personId))
      .orderBy(desc(predictionTicket.createdAt))
      .limit(50),
  ]);
  const upcoming: Array<MatchView & { spent: number }> = [];
  for (const match of all) {
    if (match.startsAt <= now || !match.markets.some((market) => market.status === "OPEN"))
      continue;
    const checkIn = await findCheckIn(match.id, personId);
    if (!checkIn || !(REGISTERED as readonly string[]).includes(checkIn.status)) continue;
    const spent = tickets
      .filter((ticket) => ticket.occasionId === match.id)
      .reduce((sum, ticket) => sum + ticket.stake, 0);
    upcoming.push({ ...match, spent });
  }
  const picks =
    tickets.length === 0
      ? []
      : await getDb()
          .select({
            ticketId: predictionPick.ticketId,
            marketTitle: predictionMarket.title,
            optionLabel: predictionOption.label,
          })
          .from(predictionPick)
          .innerJoin(predictionMarket, eq(predictionMarket.id, predictionPick.marketId))
          .innerJoin(predictionOption, eq(predictionOption.id, predictionPick.optionId))
          .where(
            inArray(
              predictionPick.ticketId,
              tickets.map((ticket) => ticket.id),
            ),
          );
  return {
    balance,
    cap,
    matches: upcoming,
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      occasionId: ticket.occasionId,
      stake: ticket.stake,
      status: ticket.status,
      payout: ticket.payout,
      picks: picks
        .filter((pick) => pick.ticketId === ticket.id)
        .map((pick) => ({ marketTitle: pick.marketTitle, optionLabel: pick.optionLabel })),
    })),
  };
}

export function marketStatusLabel(status: MarketRow["status"]): string {
  return tLabels("T-5148", PREDICTION_MARKET_STATUSES)[status] ?? status;
}

export function ticketStatusLabel(status: TicketRow["status"]): string {
  return tLabels("T-5151", PREDICTION_TICKET_STATUSES)[status] ?? status;
}

// --- Comandos (ADR-003) ---

export function setMatchCapAs(actor: Actor, cap: number): Promise<void> {
  return runCommand(actor, (ctx) => setMatchCap(ctx, cap));
}

export function createMarketAs(actor: Actor, input: MarketInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createMarket(ctx, input));
}

export function openMarketAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => openMarket(ctx, id));
}

export function resolveMarketAs(actor: Actor, id: string, optionId: string): Promise<void> {
  return runCommand(actor, (ctx) => resolveMarket(ctx, id, optionId));
}

export function cancelMarketAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => cancelMarket(ctx, id));
}

export function placePredictionAs(actor: Actor, input: TicketInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => placePrediction(ctx, input));
}
