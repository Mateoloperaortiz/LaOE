import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { termPointsClosed } from "@/domain-events/participation";
import { type ActiveMemberRef, listActiveMemberRefs, listAllCommittees } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import type { GamerRankingMetric } from "../gamer-types";
import type { PresenceRecognitionSnapshot } from "../presence-types";
import {
  challenge,
  challengeParticipation,
  checkIn,
  occasion,
  pointEntry,
  termStanding,
} from "../schema";
import { rankGamerFromMembers } from "./gamer";
import { gamerSnapshotStats, standingGamer, storedGamerMetric } from "./gamer-snapshot";
import { ghPointCondition } from "./ledger-classification";
import { rankCommittees, rankPeopleFromMembers } from "./rankings";
import { countPendingGamification } from "./rewards";

// Cierre de puntos del término (ADR-004, ADR-035 regla 13): snapshot de los tableros con ids y nombres
// congelados; el término se estampa en `terms` dentro de la misma transacción.

const standingPerson = z.object({
  rank: z.number().int(),
  personId: z.string(),
  name: z.string(),
  total: z.number().int(),
});
const standingCommittee = z.object({
  rank: z.number().int(),
  committeeId: z.string(),
  name: z.string(),
  score: z.number(),
  rawScore: z.number(),
  occasions: z.number().int(),
});
const standingStats = z
  .object({
    activeMembers: z.number().int(),
    newMembers: z.number().int(),
    occasions: z.number().int(),
    checkIns: z.number().int(),
    pointsAwarded: z.number().int(),
    // ADR-067: retos completados y puntos entregados por boosters y campañas.
    challengesCompleted: z.number().int().optional(),
    boostPoints: z.number().int().optional(),
    ...gamerSnapshotStats.shape,
  })
  .passthrough();

export type StandingPerson = z.infer<typeof standingPerson>;
export type StandingCommittee = z.infer<typeof standingCommittee>;
export type StandingStats = z.infer<typeof standingStats> & {
  gamerRankingMetric: GamerRankingMetric | null;
};

export interface TermStandingView {
  termId: string;
  topNew: StandingPerson[];
  topVeteran: StandingPerson[];
  topCommittees: StandingCommittee[];
  topGamer: z.infer<typeof standingGamer>[];
  stats: StandingStats;
  createdAt: Date;
}

export const TOP_SIZE = 10;

/** Agregados definitivos, dentro de la transacción que mantiene el término bloqueado. */
export async function buildStanding(
  termId: string,
  context?: {
    exec: Executor;
    members: readonly ActiveMemberRef[];
    gamerMembers?: readonly ActiveMemberRef[];
    presenceRecognitions?: PresenceRecognitionSnapshot[];
    committees: readonly { id: string; name: string; status: "ACTIVE" | "INACTIVE" | "ON_TRIAL" }[];
  },
): Promise<Omit<TermStandingView, "termId" | "createdAt">> {
  // La migración histórica también consume esta lectura fuera de un comando. El cierre siempre
  // pasa contexto completo para no abrir conexiones del pool dentro de su transacción.
  if (!context) {
    const [members, gamerMembers, committees] = await Promise.all([
      listActiveMemberRefs(),
      listActiveMemberRefs(true),
      listAllCommittees(),
    ]);
    context = { exec: getDb(), members, gamerMembers, committees };
  }
  const { exec: db, members, committees } = context;
  const nuevos = await rankPeopleFromMembers(db, termId, "NEW", members);
  const veteranos = await rankPeopleFromMembers(db, termId, "VETERAN", members);
  const gamers = await rankGamerFromMembers(db, termId, context.gamerMembers ?? members);
  // Los comités llegan leídos fuera de la transacción del cierre; de ahí salen los vivos (ADR-073).
  const comites = await rankCommittees(
    termId,
    db,
    new Set(committees.filter((item) => item.status !== "INACTIVE").map((item) => item.id)),
  );
  const committeeName = new Map(committees.map((item) => [item.id, item.name]));
  const [occasions] = await db
    .select({ n: count() })
    .from(occasion)
    .where(and(eq(occasion.termId, termId), ne(occasion.status, "CANCELLED")));
  const termOccasions = db
    .select({ id: occasion.id })
    .from(occasion)
    .where(eq(occasion.termId, termId));
  const [approved] = await db
    .select({ n: count() })
    .from(checkIn)
    .where(and(inArray(checkIn.occasionId, termOccasions), eq(checkIn.status, "APPROVED")));
  const [points] = await db
    .select({ total: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int` })
    .from(pointEntry)
    .where(and(eq(pointEntry.termId, termId), ghPointCondition));
  const termChallenges = db
    .select({ id: challenge.id })
    .from(challenge)
    .where(eq(challenge.termId, termId));
  const [challengesDone] = await db
    .select({ n: count() })
    .from(challengeParticipation)
    .where(
      and(
        inArray(challengeParticipation.challengeId, termChallenges),
        eq(challengeParticipation.status, "COMPLETED"),
      ),
    );
  const [boost] = await db
    .select({ total: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int` })
    .from(pointEntry)
    .where(and(eq(pointEntry.termId, termId), eq(pointEntry.kind, "BOOST")));
  const top = (rows: typeof nuevos) =>
    rows
      .filter((item) => item.total > 0)
      .slice(0, TOP_SIZE)
      .map((item) => ({
        rank: item.rank,
        personId: item.row.personId,
        name: item.row.anonymized ? t("T-223") : item.row.name,
        total: item.total,
      }));
  return {
    topNew: top(nuevos),
    topVeteran: top(veteranos),
    topGamer: gamers.slice(0, TOP_SIZE).map((item) => ({
      rank: item.rank,
      personId: item.personId,
      name: item.anonymized ? t("T-223") : item.name,
      points: item.points,
      participations: item.participations,
      activeDays: item.activeDays,
    })),
    topCommittees: comites.map((item) => ({
      rank: item.rank,
      committeeId: item.row.committeeId,
      name: committeeName.get(item.row.committeeId) ?? "",
      score: item.row.score,
      rawScore: item.row.rawScore,
      occasions: item.row.occasions,
    })),
    stats: {
      activeMembers: members.length,
      newMembers: members.filter((member) => member.firstTermId === termId).length,
      occasions: occasions?.n ?? 0,
      checkIns: approved?.n ?? 0,
      pointsAwarded: points?.total ?? 0,
      challengesCompleted: challengesDone?.n ?? 0,
      boostPoints: boost?.total ?? 0,
      gamerParticipants: gamers.length,
      gamerParticipations: gamers.reduce((sum, item) => sum + item.participations, 0),
      gamerPlayers: gamers.length,
      gamerRankingMetric: "POINTS",
      gamerPositions: gamers.map((item) => ({
        personId: item.personId,
        rank: item.rank,
        points: item.points,
        participations: item.participations,
        activeDays: item.activeDays,
      })),
      ...(context.presenceRecognitions
        ? { presenceRecognitions: context.presenceRecognitions }
        : {}),
    },
  };
}

/** Escribe el snapshot (una vez por término) y emite `term.points-closed`. Exige que no haya ocasiones abiertas. */
export async function writeTermStanding(
  ctx: CommandContext,
  termId: string,
  standing: Omit<TermStandingView, "termId" | "createdAt">,
  context: { openOccasions: number },
): Promise<{ id: string }> {
  if (context.openOccasions > 0) {
    throw new DomainError(t("T-646", { n: context.openOccasions }));
  }
  const [row] = await ctx.tx
    .insert(termStanding)
    .values({
      termId,
      topNew: standing.topNew,
      topVeteran: standing.topVeteran,
      topCommittees: standing.topCommittees,
      topGamer: standing.topGamer,
      stats: standing.stats,
    })
    .returning({ id: termStanding.id });
  if (!row) {
    throw new Error("No se pudo guardar el cierre");
  }
  await ctx.audit({
    action: "term.standing-written",
    entityType: "term_standing",
    entityId: row.id,
    after: { termId, stats: standing.stats },
  });
  await ctx.emit(eventOf(termPointsClosed, { termId }));
  return row;
}

export async function getTermStanding(termId: string): Promise<TermStandingView | null> {
  const [row] = await getDb()
    .select()
    .from(termStanding)
    .where(eq(termStanding.termId, termId))
    .limit(1);
  if (!row) {
    return null;
  }
  const stats = standingStats
    .catch({ activeMembers: 0, newMembers: 0, occasions: 0, checkIns: 0, pointsAwarded: 0 })
    .parse(row.stats);
  const gamerStats = gamerSnapshotStats.parse(row.stats);
  return {
    termId: row.termId,
    topNew: z.array(standingPerson).catch([]).parse(row.topNew),
    topVeteran: z.array(standingPerson).catch([]).parse(row.topVeteran),
    topCommittees: z.array(standingCommittee).catch([]).parse(row.topCommittees),
    topGamer: z.array(standingGamer).catch([]).parse(row.topGamer),
    stats: { ...stats, ...gamerStats, gamerRankingMetric: storedGamerMetric(gamerStats) },
    createdAt: row.createdAt,
  };
}

/** Al anonimizar a una persona, su nombre congelado en los standings pasa a T-223 (ADR-030). */
export async function scrubStandingName(personId: string): Promise<number> {
  const rows = await getDb().select().from(termStanding);
  let changed = 0;
  for (const row of rows) {
    const scrub = (value: unknown) => {
      const parsed = z.array(standingPerson).safeParse(value);
      if (!parsed.success) return { value, touched: false };
      let touched = false;
      const next = parsed.data.map((item) => {
        if (item.personId !== personId || item.name === t("T-223")) return item;
        touched = true;
        return { ...item, name: t("T-223") };
      });
      return { value: next, touched };
    };
    const topNew = scrub(row.topNew);
    const topVeteran = scrub(row.topVeteran);
    const topGamer = z.array(standingGamer).safeParse(row.topGamer);
    const gamerTouched =
      topGamer.success &&
      topGamer.data.some((item) => item.personId === personId && item.name !== t("T-223"));
    if (topNew.touched || topVeteran.touched || gamerTouched) {
      await getDb()
        .update(termStanding)
        .set({
          topNew: topNew.value,
          topVeteran: topVeteran.value,
          ...(gamerTouched && topGamer.success
            ? {
                topGamer: topGamer.data.map((item) =>
                  item.personId === personId ? { ...item, name: t("T-223") } : item,
                ),
              }
            : {}),
        })
        .where(eq(termStanding.id, row.id));
      changed += 1;
    }
  }
  return changed;
}

/** Cifras del término antes de cerrar (resumen de /admin/cierre). */
export async function closingSummary(termId: string): Promise<{
  openOccasions: number;
  pendingCheckIns: number;
  pendingParticipations: number;
  reservedRewards: number;
  membersWithPoints: number;
  pointsAwarded: number;
}> {
  const db = getDb();
  const termOccasions = db
    .select({ id: occasion.id })
    .from(occasion)
    .where(eq(occasion.termId, termId));
  const [open] = await db
    .select({ n: count() })
    .from(occasion)
    .where(and(eq(occasion.termId, termId), eq(occasion.status, "OPEN")));
  const [pending] = await db
    .select({ n: count() })
    .from(checkIn)
    .where(and(inArray(checkIn.occasionId, termOccasions), eq(checkIn.status, "PENDING")));
  const [members] = await db
    .select({ n: sql<number>`count(distinct ${pointEntry.personId})::int` })
    .from(pointEntry)
    .where(and(eq(pointEntry.termId, termId), ghPointCondition));
  const [points] = await db
    .select({ total: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int` })
    .from(pointEntry)
    .where(and(eq(pointEntry.termId, termId), ghPointCondition));
  const gamification = await countPendingGamification(termId, db);
  return {
    openOccasions: open?.n ?? 0,
    pendingCheckIns: pending?.n ?? 0,
    pendingParticipations: gamification.pendingParticipations,
    reservedRewards: gamification.reservedRewards,
    membersWithPoints: members?.n ?? 0,
    pointsAwarded: points?.total ?? 0,
  };
}
