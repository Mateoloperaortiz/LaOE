import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { getEnv } from "@/env";
import { t } from "@/shared/copy";
import { formatTime } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  competitionBet,
  competitionCreditEntry,
  competitionMarket,
  competitionMarketOption,
  competitionMatchup,
  competitionRotation,
  competitionTeam,
} from "../schema";
import type { CompetitionActor } from "./access";
import { marketState, settleParimutuel } from "./betting-pure";
import { lockAfterFailure, teamCodeMatches } from "./codes-pure";
import type { HubSession } from "./hub-pure";
import { openCompetition, writableCompetition } from "./setup";

// Apuestas de The Games (ADR-091): puntos virtuales en un libro propio que no cuentan para el
// ganador, apuestas que abre el operador y registra con el código del equipo, reparto por bolsa y un
// solo pago por apuesta. El capitán también apuesta desde el hub con su sesión (ADR-096), con el
// mismo núcleo.

async function lockedMarket(ctx: CommandContext, competitionId: string, marketId: string) {
  const [row] = await ctx.tx
    .select()
    .from(competitionMarket)
    .where(
      and(eq(competitionMarket.id, marketId), eq(competitionMarket.competitionId, competitionId)),
    )
    .for("update");
  if (!row) throw new DomainError(t("T-2764"));
  return row;
}

async function optionsOf(ctx: CommandContext, marketId: string): Promise<string[]> {
  const rows = await ctx.tx
    .select({ teamId: competitionMarketOption.teamId })
    .from(competitionMarketOption)
    .where(eq(competitionMarketOption.marketId, marketId));
  return rows.map((row) => row.teamId);
}

async function balance(ctx: CommandContext, competitionId: string, teamId: string) {
  const [row] = await ctx.tx
    .select({ total: sql<number>`coalesce(sum(${competitionCreditEntry.amount}), 0)::int` })
    .from(competitionCreditEntry)
    .where(
      and(
        eq(competitionCreditEntry.competitionId, competitionId),
        eq(competitionCreditEntry.teamId, teamId),
      ),
    );
  return row?.total ?? 0;
}

/** Los puntos iniciales a cada equipo activo que todavía no los tiene; repetir no duplica. */
export async function grantStartingCredits(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
): Promise<{ granted: number }> {
  const row = await openCompetition(ctx, actor, competitionId);
  if (row.startingCredits === null || row.startingCredits <= 0) {
    throw new DomainError(t("T-2790"));
  }
  const teams = await ctx.tx
    .select({ id: competitionTeam.id })
    .from(competitionTeam)
    .where(
      and(eq(competitionTeam.competitionId, competitionId), eq(competitionTeam.status, "ACTIVE")),
    );
  if (teams.length === 0) return { granted: 0 };
  const inserted = await ctx.tx
    .insert(competitionCreditEntry)
    .values(
      teams.map((team) => ({
        competitionId,
        teamId: team.id,
        kind: "GRANT" as const,
        amount: row.startingCredits ?? 0,
        createdById: actor.personId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: competitionCreditEntry.id });
  await ctx.audit({
    action: "competition.credits.grant",
    entityType: "competition",
    entityId: competitionId,
    after: { amount: row.startingCredits, teams: inserted.length },
  });
  return { granted: inserted.length };
}

export const marketInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  teamIds: z.array(z.string().trim().min(1)).max(99),
  matchupId: z.string().trim().min(1).nullable().default(null),
  closesAt: z.coerce.date().nullable().default(null),
});
export type MarketInput = z.input<typeof marketInputSchema>;

export async function createMarket(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: MarketInput,
): Promise<{ id: string }> {
  await openCompetition(ctx, actor, competitionId);
  const input = marketInputSchema.parse(raw);
  const teamIds = [...new Set(input.teamIds)];
  if (teamIds.length < 2) throw new DomainError(t("T-2787"), "teamIds");
  const teams = await ctx.tx
    .select({ id: competitionTeam.id })
    .from(competitionTeam)
    .where(
      and(eq(competitionTeam.competitionId, competitionId), inArray(competitionTeam.id, teamIds)),
    );
  if (teams.length !== teamIds.length) throw new DomainError(t("T-2764"), "teamIds");
  if (input.matchupId) {
    const [matchup] = await ctx.tx
      .select({ id: competitionMatchup.id })
      .from(competitionMatchup)
      .innerJoin(competitionRotation, eq(competitionRotation.id, competitionMatchup.rotationId))
      .where(
        and(
          eq(competitionMatchup.id, input.matchupId),
          eq(competitionRotation.competitionId, competitionId),
        ),
      )
      .limit(1);
    if (!matchup) throw new DomainError(t("T-2764"), "matchupId");
  }
  const [market] = await ctx.tx
    .insert(competitionMarket)
    .values({
      competitionId,
      title: input.title,
      matchupId: input.matchupId,
      closesAt: input.closesAt,
      createdById: actor.personId,
    })
    .returning({ id: competitionMarket.id });
  if (!market) throw new Error("market insert");
  await ctx.tx
    .insert(competitionMarketOption)
    .values(teamIds.map((teamId) => ({ marketId: market.id, teamId })));
  await ctx.audit({
    action: "competition.market.create",
    entityType: "competition_market",
    entityId: market.id,
    after: { ...input, teamIds },
  });
  return market;
}

/** Abrir y cerrar a mano. El cierre por hora no necesita job: se deriva de `closesAt`. */
export async function setMarketOpen(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  marketId: string,
  open: boolean,
  now = new Date(),
): Promise<void> {
  const row = await openCompetition(ctx, actor, competitionId);
  const market = await lockedMarket(ctx, competitionId, marketId);
  const state = marketState(market, now);
  if (open) {
    if (!row.bettingEnabled) throw new DomainError(t("T-2786"));
    if (state === "OPEN") return;
    if (market.status !== "DRAFT") throw new DomainError(t("T-2792"));
  } else {
    if (market.status === "CLOSED") return;
    if (market.status !== "OPEN") throw new DomainError(t("T-2792"));
  }
  const status = open ? "OPEN" : "CLOSED";
  await ctx.tx.update(competitionMarket).set({ status }).where(eq(competitionMarket.id, marketId));
  await ctx.audit({
    action: open ? "competition.market.open" : "competition.market.close",
    entityType: "competition_market",
    entityId: marketId,
    before: { status: market.status },
    after: { status },
  });
}

export const betInputSchema = z.object({
  marketId: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
  pickTeamId: z.string().trim().min(1),
  stake: z.coerce.number().int().min(1).max(1_000_000),
  code: z.string().trim().min(1).max(20),
});
export type BetInput = z.input<typeof betInputSchema>;

export type PlaceBetResult =
  | { ok: true; betId: string; balance: number }
  | { ok: false; message: string };

/** Registra la apuesta de un equipo. Un código errado no lanza: devuelve el motivo, para que el
 *  contador de fallos y el bloqueo queden guardados (ADR-089 regla 3). */
export async function placeBet(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: BetInput,
  now = new Date(),
): Promise<PlaceBetResult> {
  const row = await openCompetition(ctx, actor, competitionId);
  const input = betInputSchema.parse(raw);
  if (!row.bettingEnabled) throw new DomainError(t("T-2786"));
  const market = await lockedMarket(ctx, competitionId, input.marketId);
  if (marketState(market, now) !== "OPEN") throw new DomainError(t("T-2781"));
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`competition-credits:${input.teamId}`}, 0))`,
  );
  const [team] = await ctx.tx
    .select()
    .from(competitionTeam)
    .where(
      and(
        eq(competitionTeam.id, input.teamId),
        eq(competitionTeam.competitionId, competitionId),
        eq(competitionTeam.status, "ACTIVE"),
      ),
    )
    .for("update");
  if (!team) throw new DomainError(t("T-2764"), "teamId");
  if (team.codeLockedUntil && team.codeLockedUntil > now) {
    return { ok: false, message: t("T-2779", { hora: formatTime(team.codeLockedUntil) }) };
  }
  if (!team.codeHash) return { ok: false, message: t("T-2780") };
  if (!teamCodeMatches(team.codeHash, getEnv().SESSION_SECRET, team.id, input.code)) {
    const failures = team.codeFailures + 1;
    const lockedUntil = lockAfterFailure(failures, now);
    await ctx.tx
      .update(competitionTeam)
      .set({ codeFailures: lockedUntil ? 0 : failures, codeLockedUntil: lockedUntil })
      .where(eq(competitionTeam.id, team.id));
    await ctx.audit({
      action: "competition.team.code-failed",
      entityType: "competition_team",
      entityId: team.id,
      after: { failures, lockedUntil },
    });
    return {
      ok: false,
      message: lockedUntil ? t("T-2779", { hora: formatTime(lockedUntil) }) : t("T-2778"),
    };
  }
  const placed = await recordBet(ctx, {
    competitionId,
    allowSelfBet: row.allowSelfBet,
    marketId: market.id,
    teamId: team.id,
    pickTeamId: input.pickTeamId,
    stake: input.stake,
    createdById: actor.personId,
    via: "OPERATOR",
  });
  if (team.codeFailures > 0) {
    await ctx.tx
      .update(competitionTeam)
      .set({ codeFailures: 0 })
      .where(eq(competitionTeam.id, team.id));
  }
  return { ok: true, ...placed };
}

/** El núcleo de una apuesta (ADR-091), una vez que se sabe qué equipo apuesta: el operador con el
 *  código o el hub de capitanes con su sesión (ADR-096). El mercado y el saldo ya están bloqueados. */
async function recordBet(
  ctx: CommandContext,
  input: {
    competitionId: string;
    allowSelfBet: boolean;
    marketId: string;
    teamId: string;
    pickTeamId: string;
    stake: number;
    createdById: string | null;
    via: "OPERATOR" | "HUB";
  },
): Promise<{ betId: string; balance: number }> {
  const options = await optionsOf(ctx, input.marketId);
  if (!options.includes(input.pickTeamId)) throw new DomainError(t("T-2784"), "pickTeamId");
  if (!input.allowSelfBet && input.pickTeamId === input.teamId) {
    throw new DomainError(t("T-2785"), "pickTeamId");
  }
  const [already] = await ctx.tx
    .select({ id: competitionBet.id })
    .from(competitionBet)
    .where(
      and(eq(competitionBet.marketId, input.marketId), eq(competitionBet.teamId, input.teamId)),
    )
    .limit(1);
  if (already) throw new DomainError(t("T-2783"));
  const available = await balance(ctx, input.competitionId, input.teamId);
  if (available < input.stake) {
    throw new DomainError(t("T-2782", { saldo: available }), "stake");
  }
  const [bet] = await ctx.tx
    .insert(competitionBet)
    .values({
      marketId: input.marketId,
      teamId: input.teamId,
      pickTeamId: input.pickTeamId,
      stake: input.stake,
      createdById: input.createdById,
    })
    .returning({ id: competitionBet.id });
  if (!bet) throw new Error("bet insert");
  await ctx.tx.insert(competitionCreditEntry).values({
    competitionId: input.competitionId,
    teamId: input.teamId,
    kind: "STAKE",
    amount: -input.stake,
    betId: bet.id,
    createdById: input.createdById,
  });
  await ctx.audit({
    action: "competition.bet.place",
    entityType: "competition_bet",
    entityId: bet.id,
    after: {
      marketId: input.marketId,
      teamId: input.teamId,
      pickTeamId: input.pickTeamId,
      stake: input.stake,
      via: input.via,
    },
  });
  return { betId: bet.id, balance: available - input.stake };
}

export const hubBetInputSchema = betInputSchema.pick({
  marketId: true,
  pickTeamId: true,
  stake: true,
});
export type HubBetInput = z.input<typeof hubBetInputSchema>;

/** La apuesta que registra el capitán desde el hub (ADR-096). La sesión ya probó el código, pero
 *  todo se vuelve a leer aquí dentro de la transacción: el equipo sigue activo, su código no cambió,
 *  la competencia sigue en vivo con apuestas y la apuesta sigue abierta. */
export async function placeHubBet(
  ctx: CommandContext,
  session: HubSession,
  raw: HubBetInput,
  now = new Date(),
): Promise<{ betId: string; balance: number }> {
  const row = await writableCompetition(ctx, session.competitionId);
  if (row.status !== "LIVE") throw new DomainError(t("T-3056"));
  if (!row.bettingEnabled) throw new DomainError(t("T-2786"));
  const input = hubBetInputSchema.parse(raw);
  const market = await lockedMarket(ctx, session.competitionId, input.marketId);
  if (marketState(market, now) !== "OPEN") throw new DomainError(t("T-2781"));
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`competition-credits:${session.teamId}`}, 0))`,
  );
  const [team] = await ctx.tx
    .select({ id: competitionTeam.id, codeIssuedAt: competitionTeam.codeIssuedAt })
    .from(competitionTeam)
    .where(
      and(
        eq(competitionTeam.id, session.teamId),
        eq(competitionTeam.competitionId, session.competitionId),
        eq(competitionTeam.status, "ACTIVE"),
      ),
    )
    .for("update");
  if (!team || team.codeIssuedAt?.getTime() !== session.codeIssuedAt) {
    throw new DomainError(t("T-3056"));
  }
  return recordBet(ctx, {
    competitionId: session.competitionId,
    allowSelfBet: row.allowSelfBet,
    marketId: market.id,
    teamId: team.id,
    pickTeamId: input.pickTeamId,
    stake: input.stake,
    createdById: null,
    via: "HUB",
  });
}

async function settle(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  marketId: string,
  winnerTeamId: string | null,
) {
  const bets = await ctx.tx
    .select()
    .from(competitionBet)
    .where(eq(competitionBet.marketId, marketId));
  const settlement = settleParimutuel(bets, winnerTeamId);
  if (settlement.length > 0) {
    await ctx.tx
      .insert(competitionCreditEntry)
      .values(
        settlement.map((item) => ({
          competitionId,
          teamId: item.teamId,
          kind: item.kind,
          amount: item.amount,
          betId: item.betId,
          createdById: actor.personId,
        })),
      )
      .onConflictDoNothing();
  }
  return settlement;
}

/** Declara el ganador y paga. Resolver otra vez no hace nada, y el índice único (apuesta, tipo) lo
 *  garantiza también en la base (ADR-091 regla 4). */
export async function resolveMarket(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  marketId: string,
  winnerTeamId: string,
  now = new Date(),
): Promise<{ paid: number }> {
  await openCompetition(ctx, actor, competitionId);
  const market = await lockedMarket(ctx, competitionId, marketId);
  if (market.status === "RESOLVED") return { paid: 0 };
  if (market.status !== "OPEN" && market.status !== "CLOSED") {
    throw new DomainError(t("T-2792"));
  }
  if (!(await optionsOf(ctx, marketId)).includes(winnerTeamId)) {
    throw new DomainError(t("T-2788"), "winnerTeamId");
  }
  const settlement = await settle(ctx, actor, competitionId, marketId, winnerTeamId);
  await ctx.tx
    .update(competitionMarket)
    .set({ status: "RESOLVED", winnerTeamId, resolvedAt: now })
    .where(eq(competitionMarket.id, marketId));
  await ctx.audit({
    action: "competition.market.resolve",
    entityType: "competition_market",
    entityId: marketId,
    after: { winnerTeamId, settlement },
  });
  return { paid: settlement.reduce((sum, item) => sum + item.amount, 0) };
}

/** Cancela una apuesta sin resolver y devuelve todo lo apostado. */
export async function cancelMarket(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  marketId: string,
  now = new Date(),
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  const market = await lockedMarket(ctx, competitionId, marketId);
  if (market.status === "CANCELLED") return;
  if (market.status === "RESOLVED") throw new DomainError(t("T-2792"));
  const settlement = await settle(ctx, actor, competitionId, marketId, null);
  await ctx.tx
    .update(competitionMarket)
    .set({ status: "CANCELLED", resolvedAt: now })
    .where(eq(competitionMarket.id, marketId));
  await ctx.audit({
    action: "competition.market.cancel",
    entityType: "competition_market",
    entityId: marketId,
    after: { refunds: settlement.length },
  });
}
