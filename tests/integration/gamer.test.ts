import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  closeTermPointsAs,
  getTermStanding,
  setGamificationEnabledAs,
} from "@/modules/participation";
import { adjustPointsAs, reverseEntryAs } from "@/modules/participation/domain/commands";
import {
  getGamerLeaderboard,
  getGamerProfile,
  listGamerHistoryFor,
  loadGamerParticipations,
} from "@/modules/participation/domain/gamer";
import { balanceFor, creditGame } from "@/modules/participation/domain/ledger";
import { pointEntry } from "@/modules/participation/schema";
import { anonymizePersonAs, requestDeletionAs } from "@/modules/people";
import { membership } from "@/modules/people/schema";
import { closeTermPoints, lockOpenTermPoints } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import {
  seedMembership,
  seedPanalGame,
  seedPerson,
  seedTerm,
  seedTermStanding,
  seedWordleGame,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

const db = () => getDb();

async function player(
  termId: string,
  email = "gamer@example.test",
  status: "ACTIVE" | "HONORARY" = "ACTIVE",
) {
  const personId = await seedPerson(email);
  await seedMembership(personId, termId, status);
  return personId;
}

async function legacy(
  personId: string,
  termId: string,
  day: string,
  points = 6,
  legacyType = "WORDLE",
) {
  // Es historia importada de GHPOINTS; los comandos actuales no crean créditos LEGACY.
  const [row] = await db()
    .insert(pointEntry)
    .values({
      personId,
      termId,
      kind: "LEGACY",
      legacyType,
      points,
      reason: "Partida histórica sintética",
      createdAt: new Date(`${day}T18:00:00Z`),
    })
    .returning({ id: pointEntry.id });
  if (!row) throw new Error("No se guardó el histórico sintético");
  return row.id;
}

async function credit(input: Parameters<typeof creditGame>[1]) {
  await runCommand({ personId: input.personId, ip: null }, async (ctx) => {
    await lockOpenTermPoints(ctx.tx, input.termId);
    await creditGame(ctx, input);
  });
}

describe("temporada gamer persistida", () => {
  beforeEach(async () => {
    await truncateAll();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T18:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => closeDb());

  it("separa todo el semestre de GH y cuenta los avances de Panal como una participación", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await player(termId);
    const gameId = await seedPanalGame({
      personId,
      termId,
      day: "2026-09-15",
      puzzleId: "test",
      dictionaryVersion: "test",
      rulesVersion: "test",
    });
    for (const checkpoint of [1, 2, 3] as const) {
      await credit({
        personId,
        termId,
        game: "PANAL",
        runId: gameId,
        checkpoint,
        points: checkpoint,
        reason: "Avance de Panal sintético",
      });
      expect(await getGamerProfile(personId, termId)).toMatchObject({
        points: checkpoint === 1 ? 1 : checkpoint === 2 ? 3 : 6,
        participations: 1,
        activeDays: 1,
      });
    }
    const wordleId = await seedWordleGame(personId, termId, "2026-09-15", { status: "WON" });
    await credit({
      personId,
      termId,
      game: "WORDLE",
      runId: wordleId,
      points: 6,
      reason: "Wordle sintético",
    });
    await adjustPointsAs(
      { personId, ip: null },
      {
        personId,
        termId,
        points: 10,
        reason: "Ajuste GH sintético",
      },
    );
    expect(await balanceFor(personId, termId)).toBe(10);
    expect(await getGamerProfile(personId, termId)).toMatchObject({
      launched: false,
      points: 12,
      rankingMetric: "POINTS",
      participations: 2,
      activeDays: 1,
      rank: 1,
      currentStreak: 1,
    });
    expect(await loadGamerParticipations(termId)).toHaveLength(2);
    await setGamificationEnabledAs({ personId, ip: null }, true);
    expect((await getGamerProfile(personId, termId)).launched).toBe(true);
    await setGamificationEnabledAs({ personId, ip: null }, false);
    expect((await getGamerProfile(personId, termId)).launched).toBe(true);
  });

  it("usa el día de la partida aunque el crédito se haya guardado después de medianoche", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await player(termId);
    const wordleId = await seedWordleGame(personId, termId, "2026-09-15", { status: "WON" });
    await credit({
      personId,
      termId,
      game: "WORDLE",
      runId: wordleId,
      points: 1,
      reason: "Wordle sintético",
    });
    expect(await loadGamerParticipations(termId)).toEqual([
      { personId, day: "2026-09-15", game: "WORDLE" },
    ]);
    expect((await getGamerProfile(personId, termId)).todayGames).toEqual([]);
  });

  it("deduplica créditos legados del mismo día y excluye los anulados", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await player(termId);
    const reversed = await legacy(personId, termId, "2026-09-14");
    await legacy(personId, termId, "2026-09-15", 1);
    await legacy(personId, termId, "2026-09-15", 6);
    await reverseEntryAs({ personId, ip: null }, reversed, "Corrección histórica sintética");
    expect(await getGamerProfile(personId, termId)).toMatchObject({
      points: 7,
      participations: 1,
      activeDays: 1,
    });
    expect(await balanceFor(personId, termId)).toBe(0);
  });

  it("reconoce el mismo origen legado que GH, con alias, espacios y minúsculas", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await player(termId);
    for (const kind of [" wordle ", "game2048", "2048", "sudoku", "panal"])
      await legacy(personId, termId, "2026-09-15", 1, kind);
    await legacy(personId, termId, "2026-09-15", 8, "TRIVIA");
    await legacy(personId, termId, "2026-09-15", 9, "EVIDENCE");
    // COLOR es nuevo y nativo: ese nombre no amplía la allowlist legada de los cuatro juegos.
    await legacy(personId, termId, "2026-09-15", 4, "Color");
    await legacy(personId, termId, "2026-09-15", -4, "WORDLE");
    expect(await getGamerProfile(personId, termId)).toMatchObject({
      participations: 4,
      activeDays: 1,
      points: 5,
    });
    expect(await balanceFor(personId, termId)).toBe(21);
  });

  it("incluye honorarios y limita los nombres públicos a diez mientras conserva el puesto propio", async () => {
    const termId = await seedTerm("2026-2");
    let lastId = "";
    for (let index = 0; index < 11; index += 1) {
      const personId = await player(
        termId,
        `gamer-${index}@example.test`,
        index === 0 ? "HONORARY" : "ACTIVE",
      );
      await legacy(personId, termId, "2026-09-15");
      if (index < 10) await legacy(personId, termId, "2026-09-16");
      lastId = personId;
    }
    const board = await getGamerLeaderboard(termId);
    expect(board).toHaveLength(10);
    expect(board.every((row) => row.participations === 2 && row.rank === 1)).toBe(true);
    expect(await getGamerProfile(lastId, termId)).toMatchObject({
      participations: 1,
      rank: 11,
      totalPlayers: 11,
    });
  });

  it("la temporada cerrada conserva puestos y racha aunque cambien las membresías", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await player(termId);
    await legacy(personId, termId, "2026-09-14");
    await legacy(personId, termId, "2026-09-15");
    await legacy(personId, termId, "2026-09-16");
    await db()
      .update(term)
      .set({ pointsClosedAt: new Date("2026-09-16T18:00:00Z") })
      .where(eq(term.id, termId));
    await seedTermStanding({
      termId,
      topNew: [],
      topVeteran: [],
      topCommittees: [],
      topGamer: [
        { personId, name: "Jugador sintético", rank: 1, participations: 3, activeDays: 3 },
      ],
      stats: { gamerPositions: [{ personId, rank: 1 }], gamerPlayers: 1 },
    });
    await db()
      .update(membership)
      .set({ status: "ON_LEAVE", leaveUntil: "2026-12-31" })
      .where(eq(membership.personId, personId));
    vi.setSystemTime(new Date("2026-12-31T18:00:00Z"));
    expect(await getGamerProfile(personId, termId)).toMatchObject({
      rankingMetric: "PARTICIPATIONS",
      points: null,
      rank: 1,
      currentStreak: 3,
      longestStreak: 3,
      totalPlayers: 1,
    });
    expect(await getGamerLeaderboard(termId)).toMatchObject([{ personId, rank: 1, points: null }]);
  });

  it("cierra por puntos, conserva el puesto propio fuera del top10 y anonimiza sin borrar importes", async () => {
    const termId = await seedTerm("2026-2");
    const ids: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      const personId = await player(termId, `cierre-gamer-${index}@example.test`);
      ids.push(personId);
      await legacy(personId, termId, "2026-09-15", 11 - index);
    }
    const firstId = ids[0];
    const lastId = ids[10];
    if (!firstId || !lastId) throw new Error("Faltan personas sintéticas del cierre");
    await closeTermPointsAs({ personId: lastId, ip: null }, termId);
    const standing = await getTermStanding(termId);
    expect(standing?.stats.gamerRankingMetric).toBe("POINTS");
    expect(standing?.topGamer).toHaveLength(10);
    expect(standing?.topGamer[0]).toMatchObject({
      personId: firstId,
      points: 11,
      participations: 1,
      activeDays: 1,
      rank: 1,
    });
    expect(await getGamerProfile(lastId, termId)).toMatchObject({
      rankingMetric: "POINTS",
      points: 1,
      rank: 11,
      participations: 1,
      activeDays: 1,
      totalPlayers: 11,
    });
    expect(standing?.stats.pointsAwarded).toBe(0);
    expect(await balanceFor(lastId, termId)).toBe(0);

    await requestDeletionAs({ personId: firstId, ip: null });
    await anonymizePersonAs({ personId: lastId, ip: null }, firstId);
    await drainOutbox();
    expect((await getTermStanding(termId))?.topGamer[0]).toMatchObject({
      personId: firstId,
      name: t("T-223"),
      points: 11,
      participations: 1,
      activeDays: 1,
      rank: 1,
    });
    expect((await getGamerLeaderboard(termId))[0]).toMatchObject({
      personId: firstId,
      name: t("T-223"),
      points: 11,
      rank: 1,
    });
    expect(await getGamerProfile(lastId, termId)).toMatchObject({
      points: 1,
      rank: 11,
      rankingMetric: "POINTS",
    });
  });

  it.each([
    false,
    true,
  ])("un cierre previo sin foto gamer no inventa ranking desde créditos actuales, standing=%s", async (withStanding) => {
    const termId = await seedTerm("2026-2");
    const personId = await player(termId);
    await legacy(personId, termId, "2026-09-15", 6);
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    if (withStanding)
      await seedTermStanding({
        termId,
        topNew: [],
        topVeteran: [],
        topCommittees: [],
        stats: { activeMembers: 1, newMembers: 0, occasions: 0, checkIns: 0, pointsAwarded: 0 },
      });
    expect(await getGamerLeaderboard(termId)).toEqual([]);
    expect(await getGamerProfile(personId, termId)).toMatchObject({
      rankingMetric: null,
      points: null,
      rank: null,
      totalPlayers: 0,
    });
    if (withStanding) expect((await getTermStanding(termId))?.stats.gamerRankingMetric).toBeNull();
  });

  it("Mis datos devuelve la historia propia de cada temporada sin datos ajenos", async () => {
    const first = await seedTerm("2026-1");
    const second = await seedTerm("2026-2");
    const personId = await player(first);
    const otherId = await player(first, "otro@example.test");
    await legacy(personId, first, "2026-06-30");
    await legacy(personId, second, "2026-09-15");
    await legacy(otherId, second, "2026-09-15");
    expect(await listGamerHistoryFor(personId)).toEqual([
      { termId: first, day: "2026-06-30", game: "WORDLE" },
      { termId: second, day: "2026-09-15", game: "WORDLE" },
    ]);
  });
});
