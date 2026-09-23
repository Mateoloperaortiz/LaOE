import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { drain } from "@/jobs/poller";
import "@/jobs/handlers";
import { interaction } from "@/modules/crm/schema";
import { getTermStanding } from "@/modules/participation/domain/closing";
import { closeTermPointsAs } from "@/modules/participation/domain/commands";
import {
  getTodayPanal,
  listPanalGamesFor,
  startPanalAs,
  submitPanalWordAs,
} from "@/modules/participation/domain/panal";
import {
  panalPuzzleForDay,
  panalPuzzleView,
} from "@/modules/participation/domain/panal-dictionary";
import { wordleDay } from "@/modules/participation/domain/wordle-pure";
import { panalWordScore } from "@/modules/participation/panal-engine";
import { panalGame, panalWord, pointEntry } from "@/modules/participation/schema";
import { membership } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { truncateAll } from "./db";
import { seedMember, seedPerson } from "./factories";

const db = () => getDb();
const submit = (personId: string, gameId: string, word: string) =>
  submitPanalWordAs({ personId }, { gameId, word });
async function start(personId: string) {
  const result = await startPanalAs({ personId }, wordleDay());
  if (!result.ok) throw new Error(result.reason);
  return result.game;
}
const credits = () => db().select().from(pointEntry).where(eq(pointEntry.kind, "PANAL"));

describe("Panal diario persistido", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T15:00:00Z"));
    await truncateAll();
  });
  afterEach(() => vi.useRealTimers());
  afterAll(closeDb);

  it("GET no crea juegos, las respuestas no viajan y todos reciben el mismo panal", async () => {
    const a = await seedMember("panal.a@eafit.edu.co");
    const b = await seedMember("panal.b@eafit.edu.co");
    const first = await getTodayPanal(a);
    expect(first).toMatchObject({ availability: "AVAILABLE", game: null });
    expect(first.puzzle).toEqual((await getTodayPanal(b)).puzzle);
    expect(first.puzzle).not.toHaveProperty("words");
    expect(await db().select().from(panalGame)).toHaveLength(0);
    const game = await start(a);
    expect((await getTodayPanal(a)).game).toEqual(game);
    expect(await listPanalGamesFor(a)).toEqual([game]);
    expect(await listPanalGamesFor(b)).toEqual([]);
  });

  it("inicios concurrentes crean una única partida y una sola auditoría", async () => {
    const id = await seedMember("panal.inicio@eafit.edu.co");
    const games = await Promise.all(Array.from({ length: 12 }, () => start(id)));
    expect(new Set(games.map((game) => game.id)).size).toBe(1);
    expect(await db().select().from(panalGame)).toHaveLength(1);
    expect(
      await db().select().from(auditLog).where(eq(auditLog.action, "panal.started")),
    ).toHaveLength(1);
  });

  it("normaliza y deduplica reintentos concurrentes, sin perder palabras de otras pestañas", async () => {
    const id = await seedMember("panal.reintento@eafit.edu.co");
    const game = await start(id);
    const [first = "", second = ""] = panalPuzzleForDay(game.day).words;
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => submit(id, game.id, first.toLowerCase())),
    );
    expect(responses.filter((r) => r.ok && r.added)).toHaveLength(1);
    const results = await Promise.all([submit(id, game.id, first), submit(id, game.id, second)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await getTodayPanal(id)).game).toMatchObject({
      score: panalWordScore(first) + panalWordScore(second),
    });
    expect(await db().select().from(panalWord)).toHaveLength(2);
  });

  it("rechaza reglas inválidas, palabras desconocidas y partidas ajenas", async () => {
    const id = await seedMember("panal.validacion@eafit.edu.co");
    const other = await seedMember("panal.ajeno@eafit.edu.co");
    const game = await start(id);
    const puzzle = panalPuzzleForDay(game.day);
    expect(await submit(other, game.id, puzzle.words[0] ?? "")).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    expect(await submit(id, game.id, "A")).toMatchObject({ ok: false, reason: "TOO_SHORT" });
    const outside = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZÑ"].find((l) => !puzzle.letters.includes(l));
    expect(await submit(id, game.id, puzzle.center.repeat(3) + outside)).toMatchObject({
      reason: "OUTSIDE_LETTERS",
    });
    const outer = [...puzzle.letters].find((l) => l !== puzzle.center) ?? "";
    expect(await submit(id, game.id, outer.repeat(4))).toMatchObject({ reason: "MISSING_CENTER" });
    expect(await submit(id, game.id, puzzle.center.repeat(20))).toMatchObject({
      reason: "UNKNOWN_WORD",
    });
    expect(await submitPanalWordAs({ personId: id }, { gameId: game.id, word: 123 })).toMatchObject(
      { reason: "INVALID_INPUT" },
    );
    expect(await db().select().from(panalWord)).toHaveLength(0);
  });

  it("acredita 1 + 2 + 3 automáticamente y deja completar el panal", async () => {
    const id = await seedMember("panal.genio@eafit.edu.co");
    const game = await start(id);
    const puzzle = panalPuzzleForDay(game.day);
    const threshold = panalPuzzleView(puzzle).geniusScore;
    let score = 0;
    let last: Awaited<ReturnType<typeof submit>> | undefined;
    for (const [index, word] of puzzle.words.entries()) {
      last = await submit(id, game.id, word);
      score += panalWordScore(word);
      expect(last).toMatchObject({
        ok: true,
        game: {
          score,
          points: (index >= 4 ? 1 : 0) + (index >= 9 ? 2 : 0) + (score >= threshold ? 3 : 0),
        },
      });
    }
    expect(last).toMatchObject({ game: { complete: true } });
    expect(await credits()).toHaveLength(3);
    expect((await credits()).map((entry) => entry.points).sort()).toEqual([1, 2, 3]);
    expect(
      await db().select().from(outbox).where(eq(outbox.eventType, "panal.completed")),
    ).toHaveLength(1);
    expect((await drain(20)).failed).toBe(0);
    const timeline = await db().select().from(interaction).where(eq(interaction.personId, id));
    expect(timeline.some((row) => JSON.stringify(row.metadata).includes(game.id))).toBe(true);
    await submit(id, game.id, puzzle.words[0] ?? "");
    expect(await credits()).toHaveLength(3);
  });

  it("dos palabras cruzando Genio a la vez no duplican el premio", async () => {
    const id = await seedMember("panal.concurrente@eafit.edu.co");
    const game = await start(id);
    const puzzle = panalPuzzleForDay(game.day);
    const threshold = panalPuzzleView(puzzle).geniusScore;
    let score = 0;
    let i = 0;
    while (score + panalWordScore(puzzle.words[i] ?? "") < threshold) {
      const word = puzzle.words[i++] ?? "";
      await submit(id, game.id, word);
      score += panalWordScore(word);
    }
    const result = await Promise.all(
      puzzle.words.slice(i).map((word) => submit(id, game.id, word)),
    );
    expect(result.every((r) => r.ok)).toBe(true);
    expect(await credits()).toHaveLength(3);
    expect((await getTodayPanal(id)).game?.complete).toBe(true);
  });

  it("cierre de semestre impide palabras nuevas y conserva reintentos", async () => {
    const id = await seedMember("panal.cierre@eafit.edu.co");
    const game = await start(id);
    const puzzle = panalPuzzleForDay(game.day);
    await submit(id, game.id, puzzle.words[0] ?? "");
    await db().update(term).set({ pointsClosedAt: new Date() });
    expect(await submit(id, game.id, puzzle.words[1] ?? "")).toMatchObject({
      reason: "TERM_CLOSED",
    });
    expect(await submit(id, game.id, puzzle.words[0] ?? "")).toMatchObject({
      ok: true,
      added: false,
    });
    expect((await getTodayPanal(id)).availability).toBe("TERM_CLOSED");
  });

  it("medianoche rechaza el día anterior y permite el nuevo sin borrar progreso", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-24T04:59:59Z"));
    const id = await seedMember("panal.medianoche@eafit.edu.co");
    const game = await start(id);
    const words = panalPuzzleForDay(game.day).words;
    await submit(id, game.id, words[0] ?? "");
    vi.setSystemTime(new Date("2026-09-24T05:00:01Z"));
    expect(await submit(id, game.id, words[1] ?? "")).toMatchObject({ reason: "EXPIRED" });
    expect(await submit(id, game.id, words[0] ?? "")).toMatchObject({ ok: true, added: false });
    expect(await startPanalAs({ personId: id }, game.day)).toMatchObject({ reason: "EXPIRED" });
    const tomorrow = await getTodayPanal(id);
    expect(tomorrow.game).toBeNull();
    expect(tomorrow.checkpointsEnabled).toBe(true);
    expect(tomorrow.puzzle?.totalWords).toBeLessThanOrEqual(30);
    expect((await start(id)).day).toBe("2026-09-24");
    expect(await listPanalGamesFor(id)).toHaveLength(2);
  });

  it("exige elegibilidad en inicio y envío y falla cerrado con versiones desconocidas", async () => {
    const stranger = await seedPerson("panal.sinmembresia@eafit.edu.co");
    const id = await seedMember("panal.elegibilidad@eafit.edu.co");
    expect(await startPanalAs({ personId: stranger }, wordleDay())).toMatchObject({
      reason: "NOT_ELIGIBLE",
    });
    const game = await start(id);
    const word = panalPuzzleForDay(game.day).words[0] ?? "";
    await db()
      .update(panalGame)
      .set({ dictionaryVersion: "no-existe" })
      .where(eq(panalGame.id, game.id));
    expect(await submit(id, game.id, word)).toMatchObject({ reason: "DICTIONARY_UNAVAILABLE" });
    expect((await getTodayPanal(id)).availability).toBe("DICTIONARY_UNAVAILABLE");
    await db().update(membership).set({ status: "ON_LEAVE" }).where(eq(membership.personId, id));
    expect(await submit(id, game.id, word)).toMatchObject({ reason: "NOT_ELIGIBLE" });
  });

  it("acreditar a la vez que se cierra queda en el snapshot o se rechaza sin crédito", async () => {
    const id = await seedMember("panal.cierreconcurrente@eafit.edu.co");
    const game = await start(id);
    const puzzle = panalPuzzleForDay(game.day);
    const threshold = panalPuzzleView(puzzle).geniusScore;
    let score = 0;
    let i = 0;
    while (score + panalWordScore(puzzle.words[i] ?? "") < threshold) {
      const word = puzzle.words[i++] ?? "";
      await submit(id, game.id, word);
      score += panalWordScore(word);
    }
    const [row] = await db().select().from(panalGame).where(eq(panalGame.id, game.id));
    if (!row) throw new Error("Falta partida");
    const [result] = await Promise.all([
      submit(id, game.id, puzzle.words[i] ?? ""),
      closeTermPointsAs({ personId: id }, row.termId),
    ]);
    const standing = await getTermStanding(row.termId);
    expect(standing?.stats.pointsAwarded).toBe(result.ok ? 6 : 3);
    expect(await credits()).toHaveLength(result.ok ? 3 : 2);
    if (!result.ok) expect(result.reason).toBe("TERM_CLOSED");
    expect(
      await db()
        .select()
        .from(panalWord)
        .where(and(eq(panalWord.gameId, game.id), eq(panalWord.word, puzzle.words[i] ?? ""))),
    ).toHaveLength(result.ok ? 1 : 0);
  });
  it("el 23 conserva las letras, el premio único y los textos de la política original hasta medianoche", async () => {
    vi.setSystemTime(new Date("2026-09-24T04:59:59Z"));
    const id = await seedMember("panal.hoy@eafit.edu.co");
    const game = await start(id);
    const [row] = await db().select().from(panalGame);
    expect(row).toMatchObject({
      dictionaryVersion: "rla-es-2.9-panal-v1",
      rulesVersion: "es-7-v1",
    });
    expect((await getTodayPanal(id)).checkpointsEnabled).toBe(false);
    const puzzle = panalPuzzleForDay(game.day);
    for (const word of puzzle.words.slice(0, 10)) await submit(id, game.id, word);
    expect(await credits()).toHaveLength(0);
    expect((await start(id)).points).toBe(0);
    for (const word of puzzle.words.slice(10)) await submit(id, game.id, word);
    expect(await credits()).toMatchObject([{ points: 6, panalCheckpoint: null }]);
    vi.setSystemTime(new Date("2026-09-24T05:00:00Z"));
    expect((await getTodayPanal(id)).checkpointsEnabled).toBe(true);
    const next = await start(id);
    expect(next).toMatchObject({ points: 0, words: [], day: "2026-09-24" });
    expect((await db().select().from(panalGame).where(eq(panalGame.id, next.id)))[0]).toMatchObject(
      { dictionaryVersion: "rla-es-2.9-panal-v2", rulesVersion: "es-7-v2" },
    );
  });

  it.each([
    5, 10,
  ])("concurrencia al alcanzar %i palabras acredita la meta una sola vez y la conserva al retomar", async (limit) => {
    const id = await seedMember(`panal.meta${limit}@eafit.edu.co`);
    const game = await start(id);
    const words = panalPuzzleForDay(game.day).words;
    for (const word of words.slice(0, limit - 1)) await submit(id, game.id, word);
    const result = await Promise.all(
      Array.from({ length: 8 }, () => submit(id, game.id, words[limit - 1] ?? "")),
    );
    expect(result.filter((r) => r.ok && r.added)).toHaveLength(1);
    const resumed = await start(id);
    expect(resumed.points).toBe(limit === 5 ? 1 : 3);
    expect(resumed.words).toHaveLength(limit);
    expect((await getTodayPanal(id)).game).toEqual(resumed);
    expect(await credits()).toHaveLength(limit === 5 ? 1 : 2);
    expect((await db().select().from(panalGame))[0]?.creditedAt).toBeNull();
  });

  it("preserva V1 y créditos históricos de 6 sin sumar nuevos premios", async () => {
    const id = await seedMember("panal.historico@eafit.edu.co");
    const game = await start(id);
    const puzzle = panalPuzzleForDay("2026-09-23");
    await db()
      .update(panalGame)
      .set({
        puzzleId: puzzle.id,
        dictionaryVersion: "rla-es-2.9-panal-v1",
        rulesVersion: "es-7-v1",
        creditedAt: new Date(),
      })
      .where(eq(panalGame.id, game.id));
    const [row] = await db().select().from(panalGame);
    if (!row) throw new Error("Falta partida");
    await db().insert(pointEntry).values({
      personId: id,
      termId: row.termId,
      panalGameId: game.id,
      kind: "PANAL",
      points: 6,
      reason: "Premio histórico de prueba",
    });
    for (const word of puzzle.words.slice(0, 11)) await submit(id, game.id, word);
    expect((await getTodayPanal(id)).puzzle).toEqual(panalPuzzleView(puzzle));
    expect((await start(id)).points).toBe(6);
    expect(await credits()).toHaveLength(1);
  });

  it("leer no paga avances de un despliegue gradual; guardarlos es idempotente", async () => {
    const id = await seedMember("panal.guardado@eafit.edu.co");
    const game = await start(id);
    const puzzle = panalPuzzleForDay(game.day);
    await db()
      .insert(panalWord)
      .values(puzzle.words.map((word) => ({ gameId: game.id, word })));
    expect((await getTodayPanal(id)).game?.points).toBe(0);
    const results = await Promise.all(Array.from({ length: 5 }, () => start(id)));
    expect(results.every((result) => result.points === 6)).toBe(true);
    expect(await credits()).toHaveLength(3);
    expect((await drain(20)).failed).toBe(0);
    const timeline = await db().select().from(interaction).where(eq(interaction.personId, id));
    expect(
      timeline.filter((entry) => JSON.stringify(entry.metadata).includes(game.id)),
    ).toHaveLength(3);
  });

  it("la base rechaza importes incorrectos y metas duplicadas", async () => {
    const id = await seedMember("panal.constraints@eafit.edu.co");
    const game = await start(id);
    const [row] = await db().select().from(panalGame);
    if (!row) throw new Error("Falta partida");
    const entry = {
      personId: id,
      termId: row.termId,
      panalGameId: game.id,
      kind: "PANAL" as const,
      panalCheckpoint: 1,
      points: 1,
      reason: "Premio de prueba",
    };
    await expect(
      db()
        .insert(pointEntry)
        .values({ ...entry, points: 2 }),
    ).rejects.toThrow();
    await expect(
      db()
        .insert(pointEntry)
        .values({ ...entry, panalCheckpoint: 4, points: 4 }),
    ).rejects.toThrow();
    await db().insert(pointEntry).values(entry);
    await expect(db().insert(pointEntry).values(entry)).rejects.toThrow();
    expect(await credits()).toHaveLength(1);
  });
});
