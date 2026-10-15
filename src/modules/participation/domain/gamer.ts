import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { type ActiveMemberRef, listActiveMemberRefs } from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { todayKey } from "@/shared/lib/dates";
import type {
  GamerCredit,
  GamerGame,
  GamerParticipation,
  GamerProfile,
  GamerRankingMetric,
  GamerStanding,
} from "../gamer-types";
import { GAMER_GAMES } from "../gamer-types";
import { game2048Run, panalGame, pointEntry, sudokuRun, termStanding, wordleGame } from "../schema";
import { gamerStreak, rankGamer, uniqueGamerParticipations } from "./gamer-pure";
import { gamerSnapshotStats, standingGamer, storedGamerMetric } from "./gamer-snapshot";
import { getGamificationLaunch } from "./gamification-launch";
import { legacyGamerKind } from "./ledger-classification";

/**
 * Proyección del historial ya validado por cada juego. Usa el día de la partida, no el instante
 * de aprobación; Panal puede entregar tres premios, pero aporta una sola participación diaria.
 * Los créditos legados identificables conservan su fecha en Colombia y una reversión los excluye.
 */
async function participationRows(
  exec: Executor,
  termId?: string,
  personId?: string,
): Promise<Array<GamerCredit & { termId: string }>> {
  const rows = await exec
    .select({
      personId: pointEntry.personId,
      termId: pointEntry.termId,
      points: pointEntry.points,
      game: sql<GamerGame>`case when ${pointEntry.kind}::text = 'LEGACY' then ${legacyGamerKind(pointEntry.legacyType)} else ${pointEntry.kind}::text end`,
      day: sql<string>`coalesce(${wordleGame.day}, ${game2048Run.day}, ${sudokuRun.day}, ${panalGame.day}, (${pointEntry.createdAt} at time zone 'America/Bogota')::date)::text`,
    })
    .from(pointEntry)
    .leftJoin(wordleGame, eq(wordleGame.id, pointEntry.wordleGameId))
    .leftJoin(game2048Run, eq(game2048Run.id, pointEntry.game2048RunId))
    .leftJoin(sudokuRun, eq(sudokuRun.id, pointEntry.sudokuRunId))
    .leftJoin(panalGame, eq(panalGame.id, pointEntry.panalGameId))
    .where(
      and(
        termId ? eq(pointEntry.termId, termId) : undefined,
        personId ? eq(pointEntry.personId, personId) : undefined,
        gt(pointEntry.points, 0),
        or(
          inArray(pointEntry.kind, GAMER_GAMES),
          and(eq(pointEntry.kind, "LEGACY"), isNotNull(legacyGamerKind(pointEntry.legacyType))),
        ),
        sql`not exists (select 1 from point_entry reversal where reversal.reversal_of_id = ${pointEntry.id})`,
      ),
    );
  return rows;
}

export async function loadGamerParticipations(
  termId: string,
  exec: Executor = getDb(),
  personId?: string,
): Promise<GamerParticipation[]> {
  return uniqueGamerParticipations(
    (await participationRows(exec, termId, personId)).map(({ personId, day, game }) => ({
      personId,
      day,
      game,
    })),
  );
}

/** Historia propia, sin nombres ni puestos de otras personas, para Mis datos y Persona 360. */
export async function listGamerHistoryFor(
  personId: string,
): Promise<Array<{ termId: string; day: string; game: GamerGame }>> {
  const rows = await participationRows(getDb(), undefined, personId);
  const unique = new Map<string, { termId: string; day: string; game: GamerGame }>();
  for (const row of rows)
    unique.set(`${row.termId}:${row.day}:${row.game}`, {
      termId: row.termId,
      day: row.day,
      game: row.game,
    });
  return [...unique.values()].sort(
    (a, b) => a.day.localeCompare(b.day) || a.game.localeCompare(b.game),
  );
}

/** También se usa bajo la barrera exclusiva del cierre, con el mismo executor. */
export async function rankGamerFromMembers(
  exec: Executor,
  termId: string,
  members: readonly ActiveMemberRef[],
): Promise<GamerStanding[]> {
  return rankGamer(
    members.map((member) => ({
      personId: member.personId,
      name: member.fullName.trim(),
      anonymized: member.anonymized,
    })),
    await participationRows(exec, termId),
  );
}

const seasonForRender = cache(async (termId: string) => {
  const [members, credits, term, launch] = await Promise.all([
    listActiveMemberRefs(true),
    participationRows(getDb(), termId),
    getTerm(termId),
    getGamificationLaunch(),
  ]);
  const participations = uniqueGamerParticipations(
    credits.map(({ personId, day, game }) => ({ personId, day, game })),
  );
  let ranking = term?.pointsClosedAt
    ? []
    : rankGamer(
        members.map((member) => ({
          personId: member.personId,
          name: member.fullName.trim(),
          anonymized: member.anonymized,
        })),
        credits,
      );
  let rankingMetric: GamerRankingMetric | null = term?.pointsClosedAt ? null : "POINTS";
  let positions: Array<{
    personId: string;
    rank: number;
    points: number | null;
    participations?: number;
    activeDays?: number;
  }> = ranking.map((row) => ({
    personId: row.personId,
    rank: row.rank,
    points: row.points,
    participations: row.participations,
    activeDays: row.activeDays,
  }));
  let totalPlayers = ranking.length;
  if (term?.pointsClosedAt) {
    const [frozen] = await getDb()
      .select({ topGamer: termStanding.topGamer, stats: termStanding.stats })
      .from(termStanding)
      .where(eq(termStanding.termId, termId));
    if (frozen) {
      const stats = gamerSnapshotStats.parse(frozen.stats);
      rankingMetric = storedGamerMetric(stats);
      if (rankingMetric) {
        ranking = z
          .array(standingGamer)
          .parse(frozen.topGamer)
          .map((row) => ({
            ...row,
            points: rankingMetric === "POINTS" ? row.points : null,
            anonymized: false,
          }));
        positions =
          stats.gamerPositions ??
          ranking.map((row) => ({ personId: row.personId, rank: row.rank, points: row.points }));
        totalPlayers = stats.gamerPlayers ?? ranking.length;
      }
    }
  }
  return { ranking, positions, totalPlayers, participations, credits, rankingMetric, term, launch };
});

/** Misma privacidad de GH Points: diez personas y el puesto propio por otra lectura. */
export async function getGamerLeaderboard(termId: string): Promise<GamerStanding[]> {
  return (await seasonForRender(termId)).ranking.slice(0, 10);
}

export async function getGamerProfile(personId: string, termId: string): Promise<GamerProfile> {
  const { positions, totalPlayers, participations, credits, rankingMetric, term, launch } =
    await seasonForRender(termId);
  const effectiveNow = term?.pointsClosedAt ?? new Date();
  const today = todayKey(effectiveNow);
  const mine = participations.filter((row) => row.personId === personId);
  const frozen = term?.pointsClosedAt
    ? positions.find((row) => row.personId === personId)
    : undefined;
  return {
    launched: Boolean(
      term?.gamePointsSeparated && launch.launchedAt && new Date(launch.launchedAt) <= effectiveNow,
    ),
    points:
      rankingMetric !== "POINTS"
        ? null
        : term?.pointsClosedAt
          ? (frozen?.points ?? null)
          : credits
              .filter((row) => row.personId === personId)
              .reduce((sum, row) => sum + row.points, 0),
    rankingMetric,
    participations: frozen?.participations ?? mine.length,
    activeDays: frozen?.activeDays ?? new Set(mine.map((row) => row.day)).size,
    rank: positions.find((row) => row.personId === personId)?.rank ?? null,
    totalPlayers,
    todayGames: term?.pointsClosedAt
      ? []
      : mine.filter((row) => row.day === today).map((row) => row.game),
    ...gamerStreak(
      mine.map((row) => row.day),
      term?.startsOn ?? today,
      term?.endsOn ?? today,
      today,
    ),
  };
}
