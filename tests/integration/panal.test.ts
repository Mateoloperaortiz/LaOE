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
  beforeEach(truncateAll);
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

  it("Genio acredita exactamente 6 una sola vez y deja completar el panal", async () => {
    const id = await seedMember("panal.genio@eafit.edu.co");
    const game = await start(id);
    const puzzle = panalPuzzleForDay(game.day);
    const threshold = panalPuzzleView(puzzle).geniusScore;
    let score = 0;
    let last: Awaited<ReturnType<typeof submit>> | undefined;
    for (const word of puzzle.words) {
      last = await submit(id, game.id, word);
      score += panalWordScore(word);
      expect(last).toMatchObject({ ok: true, game: { score, points: score >= threshold ? 6 : 0 } });
    }
    expect(last).toMatchObject({ game: { complete: true } });
    expect(await credits()).toHaveLength(1);
    expect((await credits())[0]?.points).toBe(6);
    expect(
      await db().select().from(outbox).where(eq(outbox.eventType, "panal.completed")),
    ).toHaveLength(1);
    expect((await drain(20)).failed).toBe(0);
    const timeline = await db().select().from(interaction).where(eq(interaction.personId, id));
    expect(timeline.some((row) => JSON.stringify(row.metadata).includes(game.id))).toBe(true);
    await submit(id, game.id, puzzle.words[0] ?? "");
    expect(await credits()).toHaveLength(1);
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
    expect(await credits()).toHaveLength(1);
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
    expect((await getTodayPanal(id)).game).toBeNull();
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
    expect(standing?.stats.pointsAwarded).toBe(result.ok ? 6 : 0);
    expect(await credits()).toHaveLength(result.ok ? 1 : 0);
    if (!result.ok) expect(result.reason).toBe("TERM_CLOSED");
    expect(
      await db()
        .select()
        .from(panalWord)
        .where(and(eq(panalWord.gameId, game.id), eq(panalWord.word, puzzle.words[i] ?? ""))),
    ).toHaveLength(result.ok ? 1 : 0);
  });
});
