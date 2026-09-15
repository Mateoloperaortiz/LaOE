import { and, count, countDistinct, eq, sql, sum } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  boosterItem,
  challenge,
  challengeEvidenceFile,
  challengeParticipation,
  reward,
} from "../schema";

// Panel de la gamificación (ADR-067 regla 13/16): participación, premios y errores del término.

export interface GamificationOverview {
  uniqueParticipants: number;
  pendingSubmissions: number;
  reservedRewards: { count: number; points: number };
  grantedRewards: { count: number; points: number };
  boostersUsed: number;
  processingErrors: number;
}

export async function gamificationOverview(termId: string): Promise<GamificationOverview> {
  const db = getDb();
  const [[participants], [pending], rewardRows, [boosters], [errors]] = await Promise.all([
    db
      .select({ n: countDistinct(challengeParticipation.personId) })
      .from(challengeParticipation)
      .innerJoin(challenge, eq(challenge.id, challengeParticipation.challengeId))
      .where(eq(challenge.termId, termId)),
    db
      .select({ n: count() })
      .from(challengeParticipation)
      .innerJoin(challenge, eq(challenge.id, challengeParticipation.challengeId))
      .where(and(eq(challenge.termId, termId), eq(challengeParticipation.status, "PENDING"))),
    db
      .select({
        status: reward.status,
        n: count(),
        points: sum(sql`${reward.baseGranted} + ${reward.extraPoints}`),
      })
      .from(reward)
      .innerJoin(challengeParticipation, eq(challengeParticipation.rewardId, reward.id))
      .innerJoin(challenge, eq(challenge.id, challengeParticipation.challengeId))
      .where(eq(challenge.termId, termId))
      .groupBy(reward.status),
    db
      .select({ n: count() })
      .from(boosterItem)
      .where(and(eq(boosterItem.termId, termId), eq(boosterItem.status, "CONSUMED"))),
    db
      .select({ n: count() })
      .from(challengeEvidenceFile)
      .innerJoin(
        challengeParticipation,
        eq(challengeParticipation.id, challengeEvidenceFile.participationId),
      )
      .innerJoin(challenge, eq(challenge.id, challengeParticipation.challengeId))
      .where(and(eq(challenge.termId, termId), eq(challengeEvidenceFile.status, "FAILED"))),
  ]);
  const byStatus = new Map(
    rewardRows.map((row) => [row.status, { count: row.n, points: Number(row.points ?? 0) }]),
  );
  return {
    uniqueParticipants: participants?.n ?? 0,
    pendingSubmissions: pending?.n ?? 0,
    reservedRewards: byStatus.get("RESERVED") ?? { count: 0, points: 0 },
    grantedRewards: byStatus.get("GRANTED") ?? { count: 0, points: 0 },
    boostersUsed: boosters?.n ?? 0,
    processingErrors: errors?.n ?? 0,
  };
}
