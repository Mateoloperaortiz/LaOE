import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { type ActiveMemberRef, listActiveMemberRefs } from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { todayKey } from "@/shared/lib/dates";
import type { GamerGame, GamerParticipation, GamerProfile, GamerStanding } from "../gamer-types";
import { GAMER_GAMES } from "../gamer-types";
import { game2048Run, panalGame, pointEntry, sudokuRun, termStanding, wordleGame } from "../schema";
import { gamerStreak, rankGamer, uniqueGamerParticipations } from "./gamer-pure";
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
): Promise<Array<GamerParticipation & { termId: string }>> {
  const rows = await exec
    .select({
      personId: pointEntry.personId,
      termId: pointEntry.termId,
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
    await loadGamerParticipations(termId, exec),
  );
}

const seasonForRender = cache(async (termId: string) => {
  const [members, participations, term, launch] = await Promise.all([
    listActiveMemberRefs(true),
    loadGamerParticipations(termId),
    getTerm(termId),
    getGamificationLaunch(),
  ]);
  let ranking = rankGamer(
    members.map((member) => ({
      personId: member.personId,
      name: member.fullName.trim(),
      anonymized: member.anonymized,
    })),
    participations,
  );
  let positions = ranking.map((row) => ({ personId: row.personId, rank: row.rank }));
  let totalPlayers = ranking.length;
  if (term?.pointsClosedAt) {
    const [frozen] = await getDb()
      .select({ topGamer: termStanding.topGamer, stats: termStanding.stats })
      .from(termStanding)
      .where(eq(termStanding.termId, termId));
    if (frozen) {
      const top = z
        .array(
          z.object({
            personId: z.string(),
            name: z.string(),
            rank: z.number().int(),
            participations: z.number().int(),
            activeDays: z.number().int(),
          }),
        )
        .parse(frozen.topGamer);
      const stats = z
        .object({
          gamerPositions: z
            .array(z.object({ personId: z.string(), rank: z.number().int() }))
            .optional(),
          gamerPlayers: z.number().int().optional(),
        })
        .parse(frozen.stats);
      ranking = top.map((row) => ({ ...row, anonymized: false }));
      positions =
        stats.gamerPositions ?? ranking.map((row) => ({ personId: row.personId, rank: row.rank }));
      totalPlayers = stats.gamerPlayers ?? ranking.length;
    }
  }
  return { ranking, positions, totalPlayers, participations, term, launch };
});

/** Misma privacidad de GH Points: diez personas y el puesto propio por otra lectura. */
export async function getGamerLeaderboard(termId: string): Promise<GamerStanding[]> {
  return (await seasonForRender(termId)).ranking.slice(0, 10);
}

export async function getGamerProfile(personId: string, termId: string): Promise<GamerProfile> {
  const { positions, totalPlayers, participations, term, launch } = await seasonForRender(termId);
  const effectiveNow = term?.pointsClosedAt ?? new Date();
  const today = todayKey(effectiveNow);
  const mine = participations.filter((row) => row.personId === personId);
  return {
    launched: Boolean(
      term?.gamePointsSeparated && launch.launchedAt && new Date(launch.launchedAt) <= effectiveNow,
    ),
    participations: mine.length,
    activeDays: new Set(mine.map((row) => row.day)).size,
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
