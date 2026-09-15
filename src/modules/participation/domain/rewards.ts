import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { lockOpenTermPoints } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import type {
  CampaignPercent,
  PersonalPercent,
  RewardBreakdown,
  RewardCaps,
  RewardSource,
} from "../gamification-types";
import { boosterItem, challenge, challengeParticipation, reward } from "../schema";
import { computeReward, dayKeyFor, weekKeyFor } from "./gamification-pure";
import { creditReward, reverseRewardCredits } from "./ledger";

// Premios de la gamificación (ADR-067 reglas 4 a 6): el cálculo se reserva al enviar dentro de la
// transacción del comando, con la barrera del término y un advisory por persona; confirmar escribe
// las entradas CHALLENGE/BOOST del ledger, liberar devuelve el booster reservado y revertir anula
// los créditos con REVERSAL sin reabrir cupo.

export type RewardRow = typeof reward.$inferSelect;

export interface ReserveRewardInput {
  personId: string;
  termId: string;
  source: RewardSource;
  participationId?: string | null;
  checkInId?: string | null;
  /** Puntos base pedidos, de 0 a 20. */
  base: number;
  /** Booster ya validado por el llamador: propio, AVAILABLE o RESERVED, vigente y de kind conocido. */
  boosterItemId?: string | null;
  /** Objetivo que el llamador espera del booster: si se re-apuntó a otra cosa, no se consume. */
  expectedTarget?: { challengeId?: string | null; occasionId?: string | null } | undefined;
  /** 0 si no hay booster personal. */
  personalPercent: PersonalPercent;
  campaignId?: string | null;
  campaignPercent: 0 | CampaignPercent;
  now?: Date | undefined;
}

/** Puntos extra ya comprometidos en el día y la semana de la reserva: RESERVED + GRANTED + REVERSED. */
export async function usedRewardPoints(
  exec: Executor,
  personId: string,
  dayKey: string,
  weekKey: string,
): Promise<{ daily: number; weekly: number }> {
  const [row] = await exec
    .select({
      daily: sql<number>`coalesce(sum(case when ${reward.dayKey} = ${dayKey} then ${reward.baseGranted} + ${reward.extraPoints} else 0 end), 0)::int`,
      weekly: sql<number>`coalesce(sum(case when ${reward.weekKey} = ${weekKey} then ${reward.baseGranted} + ${reward.extraPoints} else 0 end), 0)::int`,
    })
    .from(reward)
    .where(
      and(
        eq(reward.personId, personId),
        inArray(reward.status, ["RESERVED", "GRANTED", "REVERSED"]),
      ),
    );
  return { daily: row?.daily ?? 0, weekly: row?.weekly ?? 0 };
}

/**
 * Reserva el premio de una entrega o de un check-in impulsado: calcula contra el cupo del día y
 * de la semana de Colombia y, si el booster personal aporta por encima de la campaña, lo marca
 * RESERVED. La reserva no escribe en el ledger; eso lo hace `grantReward`.
 */
export async function reserveReward(
  ctx: CommandContext,
  input: ReserveRewardInput,
  caps: RewardCaps,
): Promise<{ reward: RewardRow; breakdown: RewardBreakdown }> {
  await lockOpenTermPoints(ctx.tx, input.termId);
  // Serializa las reservas de la persona: el cupo del día se decide dentro de este bloqueo.
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`reward:${input.personId}`}, 0))`,
  );
  const now = input.now ?? new Date();
  const dayKey = dayKeyFor(now);
  const weekKey = weekKeyFor(now);
  const used = await usedRewardPoints(ctx.tx, input.personId, dayKey, weekKey);
  const breakdown = computeReward({
    base: input.base,
    personalPercent: input.personalPercent,
    campaignPercent: input.campaignPercent,
    usedDaily: used.daily,
    usedWeekly: used.weekly,
    caps,
    // ADR-067 regla 4: el cupo cubre la base del reto y los extras; la asistencia (CHECKIN)
    // ya acredita su base como entrada CHECKIN fuera del cupo y aquí solo pesa el extra.
    baseCountsTowardCap: input.source === "CHALLENGE",
  });
  let boosterId = breakdown.personalConsumed ? (input.boosterItemId ?? null) : null;
  let booster: typeof boosterItem.$inferSelect | null = null;
  if (boosterId) {
    booster = await lockConsumableBooster(ctx, boosterId, input.expectedTarget, now);
    if (!booster) {
      boosterId = null;
    }
  }
  // Si el booster se fue con otra operación concurrente (o se re-apuntó entre la lectura y el
  // bloqueo) la acción no aborta: el premio se recalcula sin la parte personal.
  const final =
    breakdown.personalConsumed && !booster
      ? computeReward({
          base: input.base,
          personalPercent: 0,
          campaignPercent: input.campaignPercent,
          usedDaily: used.daily,
          usedWeekly: used.weekly,
          caps,
          baseCountsTowardCap: input.source === "CHALLENGE",
        })
      : breakdown;
  const [row] = await ctx.tx
    .insert(reward)
    .values({
      personId: input.personId,
      termId: input.termId,
      source: input.source,
      participationId: input.participationId ?? null,
      checkInId: input.checkInId ?? null,
      basePoints: input.base,
      personalPercent: final.personalConsumed ? input.personalPercent : 0,
      requestedPersonalPercent: input.personalPercent,
      campaignPercent: input.campaignPercent,
      campaignId: input.campaignId ?? null,
      boosterItemId: boosterId,
      baseGranted: final.baseGranted,
      extraPoints: final.extraGranted,
      dayKey,
      weekKey,
      capDaily: caps.daily,
      capWeekly: caps.weekly,
      reservedAt: now,
    })
    .returning();
  if (!row) {
    throw new Error("No se pudo reservar el premio");
  }
  if (booster) {
    await ctx.tx
      .update(boosterItem)
      .set({ status: "RESERVED" })
      .where(and(eq(boosterItem.id, booster.id), eq(boosterItem.status, "AVAILABLE")));
  }
  await ctx.audit({
    action: "reward.reserved",
    entityType: "reward",
    entityId: row.id,
    after: {
      personId: input.personId,
      termId: input.termId,
      source: input.source,
      breakdown: final,
    },
  });
  return { reward: row, breakdown: final };
}

/**
 * Recalcula una reserva liberada (la reaprobación de un check-in no puede insertar otra fila por
 * el unique de `checkInId`): mismo cálculo que `reserveReward` — cupo de hoy, booster vigente y
 * apuntado al objetivo — y la fila vuelve a RESERVED lista para confirmar.
 */
export async function rereserveReward(
  ctx: CommandContext,
  rewardId: string,
  input: ReserveRewardInput,
  caps: RewardCaps,
  now = new Date(),
): Promise<void> {
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`reward:${input.personId}`}, 0))`,
  );
  const dayKey = dayKeyFor(now);
  const weekKey = weekKeyFor(now);
  const used = await usedRewardPoints(ctx.tx, input.personId, dayKey, weekKey);
  const baseCountsTowardCap = input.source === "CHALLENGE";
  const breakdown = computeReward({
    base: input.base,
    personalPercent: input.personalPercent,
    campaignPercent: input.campaignPercent,
    usedDaily: used.daily,
    usedWeekly: used.weekly,
    caps,
    baseCountsTowardCap,
  });
  let boosterId = breakdown.personalConsumed ? (input.boosterItemId ?? null) : null;
  if (boosterId) {
    const locked = await lockConsumableBooster(ctx, boosterId, input.expectedTarget, now);
    if (locked) {
      await ctx.tx
        .update(boosterItem)
        .set({ status: "RESERVED" })
        .where(and(eq(boosterItem.id, locked.id), eq(boosterItem.status, "AVAILABLE")));
    } else {
      boosterId = null;
    }
  }
  const final =
    breakdown.personalConsumed && !boosterId
      ? computeReward({
          base: input.base,
          personalPercent: 0,
          campaignPercent: input.campaignPercent,
          usedDaily: used.daily,
          usedWeekly: used.weekly,
          caps,
          baseCountsTowardCap,
        })
      : breakdown;
  await ctx.tx
    .update(reward)
    .set({
      personalPercent: final.personalConsumed ? input.personalPercent : 0,
      requestedPersonalPercent: input.personalPercent,
      campaignPercent: input.campaignPercent,
      campaignId: input.campaignId ?? null,
      boosterItemId: boosterId,
      baseGranted: final.baseGranted,
      extraPoints: final.extraGranted,
      status: "RESERVED",
      dayKey,
      weekKey,
      capDaily: caps.daily,
      capWeekly: caps.weekly,
      reservedAt: now,
      decidedAt: null,
      decidedById: null,
      reason: null,
    })
    .where(eq(reward.id, rewardId));
}

/**
 * Bloquea el booster y confirma que sigue siendo consumible para este objetivo: AVAILABLE,
 * vigente y apuntado donde el llamador espera. Si otra operación se lo llevó o lo re-apuntó,
 * devuelve null y el premio continúa sin la parte personal (nunca aborta la acción).
 */
export async function lockConsumableBooster(
  ctx: CommandContext,
  boosterId: string,
  expectedTarget: { challengeId?: string | null; occasionId?: string | null } | undefined,
  now: Date,
): Promise<typeof boosterItem.$inferSelect | null> {
  const [row] = await ctx.tx
    .select()
    .from(boosterItem)
    .where(eq(boosterItem.id, boosterId))
    .for("update");
  if (!row || row.status !== "AVAILABLE" || row.expiresAt <= now) {
    return null;
  }
  if (expectedTarget) {
    const matches =
      (expectedTarget.challengeId != null &&
        row.targetChallengeId === expectedTarget.challengeId) ||
      (expectedTarget.occasionId != null && row.targetOccasionId === expectedTarget.occasionId);
    if (!matches) {
      return null;
    }
  }
  return row;
}

async function rewardForUpdate(ctx: CommandContext, rewardId: string): Promise<RewardRow> {
  const [row] = await ctx.tx
    .select()
    .from(reward)
    .where(eq(reward.id, rewardId))
    .for("update")
    .limit(1);
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  return row;
}

/**
 * Confirma una reserva: acredita la base (CHALLENGE) y el extra (BOOST) en el ledger, consume el
 * booster y estampa la decisión. Idempotente: un premio ya GRANTED se devuelve tal cual.
 */
export async function grantReward(
  ctx: CommandContext,
  rewardId: string,
  reasons: { base: string; extra: string },
  now = new Date(),
): Promise<RewardRow> {
  const row = await rewardForUpdate(ctx, rewardId);
  if (row.status === "GRANTED") {
    return row;
  }
  if (row.status !== "RESERVED") {
    throw new DomainError(t("T-676", { estado: row.status }));
  }
  await lockOpenTermPoints(ctx.tx, row.termId);
  // La base del CHECKIN ya está en el ledger como entrada CHECKIN (creditCheckIn): el premio
  // solo materializa el extra BOOST; la entrada CHALLENGE es exclusiva de los retos.
  if (row.source === "CHALLENGE") {
    await creditReward(ctx, {
      rewardId: row.id,
      personId: row.personId,
      termId: row.termId,
      kind: "CHALLENGE",
      points: row.baseGranted,
      reason: reasons.base,
    });
  }
  await creditReward(ctx, {
    rewardId: row.id,
    personId: row.personId,
    termId: row.termId,
    kind: "BOOST",
    points: row.extraPoints,
    reason: reasons.extra,
  });
  if (row.boosterItemId) {
    await ctx.tx
      .update(boosterItem)
      .set({ status: "CONSUMED", consumedRewardId: row.id })
      .where(and(eq(boosterItem.id, row.boosterItemId), eq(boosterItem.status, "RESERVED")));
  }
  await ctx.tx
    .update(reward)
    .set({ status: "GRANTED", decidedAt: now, decidedById: ctx.actor.personId })
    .where(eq(reward.id, row.id));
  await ctx.audit({
    action: "reward.granted",
    entityType: "reward",
    entityId: row.id,
    before: { status: "RESERVED" },
    after: { status: "GRANTED", baseGranted: row.baseGranted, extraPoints: row.extraPoints },
  });
  return { ...row, status: "GRANTED", decidedAt: now, decidedById: ctx.actor.personId };
}

/** Reserva y confirma seguidas: el premio inmediato de la trivia y del reto presencial. */
export async function reserveAndGrantReward(
  ctx: CommandContext,
  input: ReserveRewardInput,
  caps: RewardCaps,
  reasons: { base: string; extra: string },
): Promise<{ reward: RewardRow; breakdown: RewardBreakdown }> {
  const reserved = await reserveReward(ctx, input, caps);
  const granted = await grantReward(ctx, reserved.reward.id, reasons, input.now ?? new Date());
  return { reward: granted, breakdown: reserved.breakdown };
}

/** Libera una reserva sin entregar (rechazo o cancelación): el booster vuelve a AVAILABLE. */
export async function releaseReward(
  ctx: CommandContext,
  rewardId: string,
  reason: string,
): Promise<RewardRow> {
  const row = await rewardForUpdate(ctx, rewardId);
  if (row.status === "RELEASED") {
    return row;
  }
  if (row.status !== "RESERVED") {
    throw new DomainError(t("T-676", { estado: row.status }));
  }
  const now = new Date();
  if (row.boosterItemId) {
    await ctx.tx
      .update(boosterItem)
      .set({ status: "AVAILABLE", targetChallengeId: null, targetOccasionId: null })
      .where(and(eq(boosterItem.id, row.boosterItemId), eq(boosterItem.status, "RESERVED")));
  }
  await ctx.tx
    .update(reward)
    .set({ status: "RELEASED", decidedAt: now, decidedById: ctx.actor.personId, reason })
    .where(eq(reward.id, row.id));
  await ctx.audit({
    action: "reward.released",
    entityType: "reward",
    entityId: row.id,
    before: { status: "RESERVED" },
    after: { status: "RELEASED", reason },
  });
  return { ...row, status: "RELEASED", decidedAt: now, decidedById: ctx.actor.personId, reason };
}

/**
 * Revierte un premio entregado (anulación de GH con motivo y step-up, o la anulación del check-in
 * impulsado): escribe la REVERSAL de cada entrada viva y devuelve el booster consumido si sigue
 * vigente. Una reversión no reabre el cupo: REVERSED sigue contando en el día y la semana.
 */
export async function reverseReward(
  ctx: CommandContext,
  rewardId: string,
  reason: string,
  now = new Date(),
): Promise<{ reversed: number }> {
  const row = await rewardForUpdate(ctx, rewardId);
  if (row.status === "REVERSED") {
    return { reversed: 0 };
  }
  if (row.status !== "GRANTED") {
    throw new DomainError(t("T-676", { estado: row.status }));
  }
  const reversed = await reverseRewardCredits(ctx, rewardId, reason);
  let boosterReturned = false;
  if (row.boosterItemId) {
    const [booster] = await ctx.tx
      .select()
      .from(boosterItem)
      .where(eq(boosterItem.id, row.boosterItemId))
      .for("update");
    if (booster?.status === "CONSUMED" && booster.expiresAt > now) {
      await ctx.tx
        .update(boosterItem)
        .set({
          status: "AVAILABLE",
          targetChallengeId: null,
          targetOccasionId: null,
          consumedRewardId: null,
        })
        .where(eq(boosterItem.id, booster.id));
      boosterReturned = true;
    }
  }
  await ctx.tx
    .update(reward)
    .set({ status: "REVERSED", decidedAt: now, decidedById: ctx.actor.personId, reason })
    .where(eq(reward.id, row.id));
  await ctx.audit({
    action: "reward.reversed",
    entityType: "reward",
    entityId: row.id,
    before: { status: "GRANTED", baseGranted: row.baseGranted, extraPoints: row.extraPoints },
    after: { status: "REVERSED", reason, reversed, boosterReturned },
  });
  await ctx.emit({
    type: "challenge.reward-reversed",
    payload: {
      personId: row.personId,
      termId: row.termId,
      rewardId: row.id,
      participationId: row.participationId,
      checkInId: row.checkInId,
    },
  });
  return { reversed };
}

/** Lo que bloquea el cierre de puntos del término (ADR-067 regla 13): entregas y reservas vivas. */
export async function countPendingGamification(
  termId: string,
  exec: Executor,
): Promise<{ pendingParticipations: number; reservedRewards: number }> {
  const termChallenges = exec
    .select({ id: challenge.id })
    .from(challenge)
    .where(eq(challenge.termId, termId));
  const [pending] = await exec
    .select({ n: count() })
    .from(challengeParticipation)
    .where(
      and(
        inArray(challengeParticipation.challengeId, termChallenges),
        eq(challengeParticipation.status, "PENDING"),
      ),
    );
  const [reserved] = await exec
    .select({ n: count() })
    .from(reward)
    .where(and(eq(reward.termId, termId), eq(reward.status, "RESERVED")));
  return { pendingParticipations: pending?.n ?? 0, reservedRewards: reserved?.n ?? 0 };
}

/** Premios de la persona para "Mis datos" (ADR-034 regla 12), del más reciente al más viejo. */
export async function listRewardsForPerson(personId: string): Promise<
  Array<{
    source: RewardRow["source"];
    status: RewardRow["status"];
    basePoints: number;
    extraPoints: number;
    dayKey: string;
    weekKey: string;
    reservedAt: Date;
    decidedAt: Date | null;
  }>
> {
  return getDb()
    .select({
      source: reward.source,
      status: reward.status,
      basePoints: reward.basePoints,
      extraPoints: reward.extraPoints,
      dayKey: reward.dayKey,
      weekKey: reward.weekKey,
      reservedAt: reward.reservedAt,
      decidedAt: reward.decidedAt,
    })
    .from(reward)
    .where(eq(reward.personId, personId))
    .orderBy(desc(reward.reservedAt));
}
