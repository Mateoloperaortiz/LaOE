import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { t } from "@/shared/copy";
import { addDays, atHourIn } from "@/shared/lib/dates-pure";
import { DomainError } from "@/shared/lib/errors";
import {
  challengeParticipation,
  checkIn,
  collectiveGoal,
  colorRun,
  occasion,
  panalGame,
  sudokuRun,
  thresholdReward,
  thresholdRewardClaim,
  wordleGame,
} from "../schema";
import { GAMIFICATION_TIMEZONE } from "./gamification-pure";
import { balanceFor } from "./ledger";

// Metas colectivas y recompensas por umbral (ADR-177). Una meta suma lo de todos, sin nombres, y
// celebra al cumplirse sin dar puntos. Reclamar una recompensa no gasta ni toca el libro de puntos.

export const COLLECTIVE_GOAL_METRICS = ["CHECKINS", "CHALLENGES", "GAMES"] as const;
export type CollectiveGoalMetric = (typeof COLLECTIVE_GOAL_METRICS)[number];

export type CollectiveGoalRow = typeof collectiveGoal.$inferSelect;

export interface GoalProgress extends CollectiveGoalRow {
  progress: number;
  done: boolean;
}

/** Lo sumado en una meta: el conteo de su métrica en su rango de días, en la hora de la OE. */
async function progressOf(goal: CollectiveGoalRow): Promise<number> {
  const db = getDb();
  const from = atHourIn(GAMIFICATION_TIMEZONE, goal.startsOn, 0);
  const to = atHourIn(GAMIFICATION_TIMEZONE, addDays(goal.endsOn, 1), 0);
  if (goal.metric === "CHECKINS") {
    const [row] = await db
      .select({ n: count() })
      .from(checkIn)
      .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
      .where(
        and(
          eq(checkIn.status, "APPROVED"),
          gte(occasion.startsAt, from),
          lt(occasion.startsAt, to),
          goal.committeeId ? eq(occasion.committeeId, goal.committeeId) : undefined,
        ),
      );
    return row?.n ?? 0;
  }
  if (goal.metric === "CHALLENGES") {
    const [row] = await db
      .select({ n: count() })
      .from(challengeParticipation)
      .where(
        and(
          eq(challengeParticipation.status, "COMPLETED"),
          gte(challengeParticipation.submittedAt, from),
          lt(challengeParticipation.submittedAt, to),
        ),
      );
    return row?.n ?? 0;
  }
  const inDays = (day: AnyPgColumn) => and(gte(day, goal.startsOn), lte(day, goal.endsOn));
  const [wordle, sudoku, color, panal] = await Promise.all([
    db
      .select({ n: count() })
      .from(wordleGame)
      .where(and(inDays(wordleGame.day), isNotNull(wordleGame.completedAt))),
    db
      .select({ n: count() })
      .from(sudokuRun)
      .where(and(inDays(sudokuRun.day), isNotNull(sudokuRun.finishedAt))),
    db
      .select({ n: count() })
      .from(colorRun)
      .where(and(inDays(colorRun.day), isNotNull(colorRun.finishedAt))),
    db.select({ n: count() }).from(panalGame).where(inDays(panalGame.day)),
  ]);
  return [wordle, sudoku, color, panal].reduce((sum, rows) => sum + (rows[0]?.n ?? 0), 0);
}

/**
 * Las metas en curso hoy de la OE y de estos comités, con su avance, de la más cercana a cumplirse a la
 * más lejana; las cumplidas al final.
 */
export async function listActiveGoals(
  committeeIds: string[],
  today: string,
): Promise<GoalProgress[]> {
  const goals = await getDb()
    .select()
    .from(collectiveGoal)
    .where(
      and(
        lte(collectiveGoal.startsOn, today),
        gte(collectiveGoal.endsOn, today),
        committeeIds.length > 0
          ? or(
              isNull(collectiveGoal.committeeId),
              inArray(collectiveGoal.committeeId, committeeIds),
            )
          : isNull(collectiveGoal.committeeId),
      ),
    );
  const withProgress = await Promise.all(
    goals.map(async (goal) => {
      const progress = await progressOf(goal);
      return { ...goal, progress, done: progress >= goal.target };
    }),
  );
  return withProgress.sort(
    (a, b) => Number(a.done) - Number(b.done) || b.progress / b.target - a.progress / a.target,
  );
}

export type ThresholdRewardRow = typeof thresholdReward.$inferSelect;

export interface RewardView extends ThresholdRewardRow {
  claimedAt: Date | null;
  deliveredAt: Date | null;
}

/** Las recompensas del semestre, de la de menos puntos a la de más, con lo que la persona reclamó. */
export async function listRewardsFor(personId: string, termId: string): Promise<RewardView[]> {
  const rows = await getDb()
    .select({ reward: thresholdReward, claim: thresholdRewardClaim })
    .from(thresholdReward)
    .leftJoin(
      thresholdRewardClaim,
      and(
        eq(thresholdRewardClaim.rewardId, thresholdReward.id),
        eq(thresholdRewardClaim.personId, personId),
      ),
    )
    .where(eq(thresholdReward.termId, termId))
    .orderBy(thresholdReward.points);
  return rows.map((row) => ({
    ...row.reward,
    claimedAt: row.claim?.claimedAt ?? null,
    deliveredAt: row.claim?.deliveredAt ?? null,
  }));
}

async function claimReward(ctx: CommandContext, rewardId: string): Promise<void> {
  const personId = ctx.actor.personId;
  if (!personId) throw new DomainError(t("T-032"));
  const [reward] = await ctx.tx
    .select()
    .from(thresholdReward)
    .where(eq(thresholdReward.id, rewardId));
  if (!reward) throw new DomainError(t("T-032"));
  if ((await balanceFor(personId, reward.termId)) < reward.points) {
    throw new DomainError(t("T-4980"));
  }
  const inserted = await ctx.tx
    .insert(thresholdRewardClaim)
    .values({ rewardId, personId })
    .onConflictDoNothing()
    .returning({ id: thresholdRewardClaim.id });
  if (inserted.length === 0) throw new DomainError(t("T-4981"));
  await ctx.audit({
    action: "threshold-reward.claimed",
    entityType: "threshold_reward",
    entityId: rewardId,
    after: { points: reward.points },
  });
}

/** Reclamar una recompensa alcanzada: deja la entrega pendiente, sin gastar puntos (ADR-177 regla 2). */
export function claimRewardAs(actor: Actor, rewardId: string): Promise<void> {
  return runCommand(actor, (ctx) => claimReward(ctx, rewardId));
}

/** Marcar una entrega como hecha, desde la Operación. */
export async function markRewardDelivered(ctx: CommandContext, claimId: string): Promise<void> {
  const [row] = await ctx.tx
    .update(thresholdRewardClaim)
    .set({ deliveredAt: new Date() })
    .where(and(eq(thresholdRewardClaim.id, claimId), isNull(thresholdRewardClaim.deliveredAt)))
    .returning({ id: thresholdRewardClaim.id });
  if (!row) throw new DomainError(t("T-032"));
  await ctx.audit({
    action: "threshold-reward.delivered",
    entityType: "threshold_reward_claim",
    entityId: claimId,
  });
}

export interface RewardClaimRow {
  id: string;
  personId: string;
  rewardTitle: string;
  points: number;
  claimedAt: Date;
  deliveredAt: Date | null;
}

/** Las entregas por hacer y hechas, para el kit del admin. */
export async function listRewardClaims(params: {
  pending: boolean | null;
  page: number;
  pageSize: number;
}): Promise<{ rows: RewardClaimRow[]; total: number }> {
  const where =
    params.pending === null
      ? undefined
      : params.pending
        ? isNull(thresholdRewardClaim.deliveredAt)
        : isNotNull(thresholdRewardClaim.deliveredAt);
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: thresholdRewardClaim.id,
        personId: thresholdRewardClaim.personId,
        rewardTitle: thresholdReward.title,
        points: thresholdReward.points,
        claimedAt: thresholdRewardClaim.claimedAt,
        deliveredAt: thresholdRewardClaim.deliveredAt,
      })
      .from(thresholdRewardClaim)
      .innerJoin(thresholdReward, eq(thresholdReward.id, thresholdRewardClaim.rewardId))
      .where(where)
      .orderBy(desc(thresholdRewardClaim.claimedAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(thresholdRewardClaim).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getRewardClaim(id: string): Promise<RewardClaimRow | null> {
  const { rows } = await listRewardClaimsById([id]);
  return rows[0] ?? null;
}

async function listRewardClaimsById(ids: string[]): Promise<{ rows: RewardClaimRow[] }> {
  const rows = await getDb()
    .select({
      id: thresholdRewardClaim.id,
      personId: thresholdRewardClaim.personId,
      rewardTitle: thresholdReward.title,
      points: thresholdReward.points,
      claimedAt: thresholdRewardClaim.claimedAt,
      deliveredAt: thresholdRewardClaim.deliveredAt,
    })
    .from(thresholdRewardClaim)
    .innerJoin(thresholdReward, eq(thresholdReward.id, thresholdRewardClaim.rewardId))
    .where(inArray(thresholdRewardClaim.id, ids));
  return { rows };
}

export interface GoalInput {
  title: string;
  metric: CollectiveGoalMetric;
  target: number;
  committeeId?: string | undefined;
  startsOn: string;
  endsOn: string;
}

/** Una meta de un comité solo cuenta asistencias: los retos y las partidas no tienen comité. */
function assertGoalScope(input: GoalInput): void {
  if (input.committeeId && input.metric !== "CHECKINS") {
    throw new DomainError(t("T-4991"), "metric");
  }
}

export async function createGoal(ctx: CommandContext, input: GoalInput): Promise<{ id: string }> {
  assertGoalScope(input);
  const [row] = await ctx.tx
    .insert(collectiveGoal)
    .values({ ...input, committeeId: input.committeeId ?? null })
    .returning({ id: collectiveGoal.id });
  if (!row) throw new Error("No se pudo crear la meta");
  await ctx.audit({
    action: "collective-goal.created",
    entityType: "collective_goal",
    entityId: row.id,
    after: input,
  });
  return row;
}

export async function updateGoal(ctx: CommandContext, id: string, input: GoalInput): Promise<void> {
  assertGoalScope(input);
  const [row] = await ctx.tx
    .update(collectiveGoal)
    .set({ ...input, committeeId: input.committeeId ?? null, updatedAt: new Date() })
    .where(eq(collectiveGoal.id, id))
    .returning({ id: collectiveGoal.id });
  if (!row) throw new DomainError(t("T-032"));
  await ctx.audit({
    action: "collective-goal.updated",
    entityType: "collective_goal",
    entityId: id,
    after: input,
  });
}

export async function listGoals(params: {
  page: number;
  pageSize: number;
}): Promise<{ rows: CollectiveGoalRow[]; total: number }> {
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(collectiveGoal)
      .orderBy(desc(collectiveGoal.startsOn))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(collectiveGoal),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getGoal(id: string): Promise<CollectiveGoalRow | null> {
  const [row] = await getDb().select().from(collectiveGoal).where(eq(collectiveGoal.id, id));
  return row ?? null;
}

export interface RewardInput {
  termId: string;
  points: number;
  title: string;
  description?: string | undefined;
}

export async function createReward(
  ctx: CommandContext,
  input: RewardInput,
): Promise<{ id: string }> {
  const [row] = await ctx.tx
    .insert(thresholdReward)
    .values({ ...input, description: input.description ?? "" })
    .returning({ id: thresholdReward.id });
  if (!row) throw new Error("No se pudo crear la recompensa");
  await ctx.audit({
    action: "threshold-reward.created",
    entityType: "threshold_reward",
    entityId: row.id,
    after: input,
  });
  return row;
}

export async function updateReward(
  ctx: CommandContext,
  id: string,
  input: RewardInput,
): Promise<void> {
  const [row] = await ctx.tx
    .update(thresholdReward)
    .set({ ...input, description: input.description ?? "", updatedAt: new Date() })
    .where(eq(thresholdReward.id, id))
    .returning({ id: thresholdReward.id });
  if (!row) throw new DomainError(t("T-032"));
  await ctx.audit({
    action: "threshold-reward.updated",
    entityType: "threshold_reward",
    entityId: id,
    after: input,
  });
}

export async function listRewards(params: {
  page: number;
  pageSize: number;
}): Promise<{ rows: ThresholdRewardRow[]; total: number }> {
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(thresholdReward)
      .orderBy(desc(thresholdReward.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(thresholdReward),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getReward(id: string): Promise<ThresholdRewardRow | null> {
  const [row] = await getDb().select().from(thresholdReward).where(eq(thresholdReward.id, id));
  return row ?? null;
}
