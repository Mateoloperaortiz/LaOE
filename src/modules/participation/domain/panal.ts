import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { panalCheckpointReached, panalCompleted } from "@/domain-events/participation";
import { findTermContaining } from "@/modules/terms";
import { t } from "@/shared/copy";
import {
  hasPanalCheckpoints,
  isSupportedPanalRules,
  normalizePanalWord,
  PANAL_REWARD,
  PANAL_RULES_VERSION,
  panalWordError,
  panalWordScore,
  reachedPanalCheckpoints,
} from "../panal-engine";
import type { PanalCheckpointId, PanalGameView, PanalResult, TodayPanal } from "../panal-types";
import { panalGame, panalWord, pointEntry } from "../schema";
import {
  type DailyGameRules,
  isEligibleToPlay,
  lockDailyGame,
  refusalToContinue,
  startDailyGame,
} from "./daily-game-guard";
import { dayKeyFor, nextDayAt } from "./gamification-pure";
import { creditGame } from "./ledger";
import {
  getPanalPuzzle,
  panalDictionaryVersion,
  panalPuzzleForDay,
  panalPuzzleView,
} from "./panal-dictionary";

type Row = typeof panalGame.$inferSelect;
type MemberActor = Actor & { personId: string };
const submitSchema = z.object({
  gameId: z.string().min(1).max(80),
  word: z.string().min(1).max(64),
});

/** Lo que el Panal le declara a la guardia de la partida diaria (ADR-119 regla 7). */
const GUARD = {
  lock: { key: "panal", per: "PERSON" },
  // Con el semestre cerrado responde antes de mirar la partida guardada (decisión abierta 49).
  startWhenClosed: "REFUSE",
  expiredAndClosed: "EXPIRED",
  movedTerm: "TERM_CLOSED",
} as const satisfies DailyGameRules;

async function gameView(row: Row, db: Executor): Promise<PanalGameView> {
  const words = (
    await db
      .select({ word: panalWord.word })
      .from(panalWord)
      .where(eq(panalWord.gameId, row.id))
      .orderBy(asc(panalWord.createdAt), asc(panalWord.word))
  ).map((item) => item.word);
  const entries = await db
    .select({ points: pointEntry.points, checkpoint: pointEntry.panalCheckpoint })
    .from(pointEntry)
    .where(eq(pointEntry.panalGameId, row.id));
  const legacyReward = entries.some((entry) => entry.checkpoint === null);
  const awardedCheckpoints: PanalCheckpointId[] = legacyReward
    ? [1, 2, 3]
    : entries.map((entry) => entry.checkpoint as PanalCheckpointId).sort();
  const puzzle = getPanalPuzzle(row.dictionaryVersion, row.puzzleId);
  return {
    id: row.id,
    day: row.day,
    words,
    score: words.reduce((sum, word) => sum + panalWordScore(word), 0),
    points: entries.reduce((sum, entry) => sum + entry.points, 0),
    awardedCheckpoints,
    complete: Boolean(puzzle && words.length === puzzle.words.length),
  };
}

export async function getTodayPanal(personId: string): Promise<TodayPanal> {
  const day = dayKeyFor(new Date());
  return getDb().transaction(
    async (db) => {
      const current = await findTermContaining(day, db);
      const allowed = await isEligibleToPlay(personId, db);
      const [row] = await db
        .select()
        .from(panalGame)
        .where(and(eq(panalGame.personId, personId), eq(panalGame.day, day)))
        .limit(1);
      const puzzle = row
        ? getPanalPuzzle(row.dictionaryVersion, row.puzzleId)
        : panalPuzzleForDay(day);
      const availability = !allowed
        ? "NOT_ELIGIBLE"
        : !current
          ? "NO_TERM"
          : current.pointsClosedAt || (row && row.termId !== current.id)
            ? "TERM_CLOSED"
            : !puzzle || (row && !isSupportedPanalRules(row.rulesVersion))
              ? "DICTIONARY_UNAVAILABLE"
              : "AVAILABLE";
      return {
        day,
        nextAvailableAt: nextDayAt(day),
        checkpointsEnabled: hasPanalCheckpoints(day),
        availability,
        puzzle: puzzle ? panalPuzzleView(puzzle) : null,
        game: row ? await gameView(row, db) : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Se llama bajo locks de semestre, persona y partida; el ledger es la fuente del premio. */
async function grantRewards(
  ctx: CommandContext,
  row: Row,
  game: PanalGameView,
  geniusScore: number,
  now: Date,
): Promise<PanalGameView> {
  if (game.points >= PANAL_REWARD) return game;
  const checkpoints = hasPanalCheckpoints(row.day)
    ? reachedPanalCheckpoints(game.words.length, game.score, geniusScore).filter(
        (checkpoint) => !game.awardedCheckpoints.includes(checkpoint.id),
      )
    : game.score >= geniusScore
      ? [{ id: null, points: PANAL_REWARD }]
      : [];
  if (!checkpoints.length) return game;
  const delta = checkpoints.reduce((sum, checkpoint) => sum + checkpoint.points, 0);
  if (game.points + delta > PANAL_REWARD) throw new Error("Premio de Panal inconsistente");
  for (const checkpoint of checkpoints) {
    await creditGame(ctx, {
      game: "PANAL",
      runId: row.id,
      checkpoint: checkpoint.id,
      personId: row.personId,
      termId: row.termId,
      points: checkpoint.points,
      reason:
        checkpoint.id === null
          ? t("T-2752", { fecha: row.day })
          : t("T-3010", {
              fecha: row.day,
              meta:
                checkpoint.id === 3
                  ? t("T-3003")
                  : t("T-3002", { n: checkpoint.id === 1 ? 5 : 10 }),
            }),
    });
    const payload = {
      personId: row.personId,
      termId: row.termId,
      gameId: row.id,
      day: row.day,
      points: checkpoint.points,
    };
    await ctx.emit(
      checkpoint.id === null || checkpoint.id === 3
        ? eventOf(panalCompleted, { ...payload, score: game.score })
        : eventOf(panalCheckpointReached, {
            ...payload,
            checkpoint: checkpoint.id,
            words: game.words.length,
          }),
    );
  }
  const points = game.points + delta;
  await ctx.tx
    .update(panalGame)
    .set({
      creditedAt: points === PANAL_REWARD ? now : null,
      rulesVersion: hasPanalCheckpoints(row.day) ? PANAL_RULES_VERSION : row.rulesVersion,
    })
    .where(eq(panalGame.id, row.id));
  await ctx.audit({
    action: "panal.credited",
    entityType: "panal_game",
    entityId: row.id,
    after: {
      day: row.day,
      score: game.score,
      words: game.words.length,
      points: delta,
      checkpoints: checkpoints.map((checkpoint) => checkpoint.id),
    },
  });
  return {
    ...game,
    points,
    awardedCheckpoints: checkpoints.some((checkpoint) => checkpoint.id === null)
      ? [1, 2, 3]
      : [
          ...game.awardedCheckpoints,
          ...checkpoints.flatMap((checkpoint) => (checkpoint.id === null ? [] : [checkpoint.id])),
        ].sort(),
  };
}

export async function startPanalAs(actor: MemberActor, expectedDay: string): Promise<PanalResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDay)) return { ok: false, reason: "INVALID_INPUT" };
  return runCommand(actor, async (ctx): Promise<PanalResult> => {
    const guard = await startDailyGame(ctx, GUARD, {
      personId: actor.personId,
      now: () => new Date(),
      expectedDay,
    });
    if (!guard.ok) return { ok: false, reason: guard.reason };
    const { day, term: current } = guard;
    const [existing] = await ctx.tx
      .select()
      .from(panalGame)
      .where(and(eq(panalGame.personId, actor.personId), eq(panalGame.day, day)))
      .for("update");
    if (existing) {
      if (existing.termId !== current.id) return { ok: false, reason: "TERM_CLOSED" };
      const puzzle = getPanalPuzzle(existing.dictionaryVersion, existing.puzzleId);
      if (!puzzle || !isSupportedPanalRules(existing.rulesVersion))
        return { ok: false, reason: "DICTIONARY_UNAVAILABLE" };
      const saved = await gameView(existing, ctx.tx);
      const game = hasPanalCheckpoints(day)
        ? await grantRewards(ctx, existing, saved, panalPuzzleView(puzzle).geniusScore, new Date())
        : saved;
      return { ok: true, game, added: false };
    }
    const puzzle = panalPuzzleForDay(day);
    const [row] = await ctx.tx
      .insert(panalGame)
      .values({
        personId: actor.personId,
        termId: current.id,
        day,
        puzzleId: puzzle.id,
        dictionaryVersion: panalDictionaryVersion(day),
        rulesVersion: hasPanalCheckpoints(day) ? PANAL_RULES_VERSION : "es-7-v1",
      })
      .returning();
    if (!row) throw new Error("No se pudo crear Panal");
    await ctx.audit({
      action: "panal.started",
      entityType: "panal_game",
      entityId: row.id,
      after: { day, termId: current.id, personId: actor.personId },
    });
    return { ok: true, game: await gameView(row, ctx.tx), added: false };
  });
}

export async function submitPanalWordAs(actor: MemberActor, raw: unknown): Promise<PanalResult> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID_INPUT" };
  const { gameId } = parsed.data;
  const word = normalizePanalWord(parsed.data.word);
  const [ref] = await getDb()
    .select({ termId: panalGame.termId })
    .from(panalGame)
    .where(and(eq(panalGame.id, gameId), eq(panalGame.personId, actor.personId)))
    .limit(1);
  if (!ref) return { ok: false, reason: "NOT_FOUND" };
  return runCommand(actor, async (ctx): Promise<PanalResult> => {
    const open = await lockDailyGame(ctx, GUARD, {
      personId: actor.personId,
      termId: ref.termId,
    });
    const [row] = await ctx.tx
      .select()
      .from(panalGame)
      .where(and(eq(panalGame.id, gameId), eq(panalGame.personId, actor.personId)))
      .for("update");
    if (!row) return { ok: false, reason: "NOT_FOUND" };
    const game = await gameView(row, ctx.tx);
    // La palabra es la clave idempotente: también reconoce una respuesta de red perdida.
    if (game.words.includes(word)) return { ok: true, game, added: false };
    const now = new Date();
    const refusal = await refusalToContinue(ctx, GUARD, {
      personId: actor.personId,
      game: row,
      open,
      now,
    });
    if (refusal) return { ok: false, reason: refusal, game };
    const puzzle = getPanalPuzzle(row.dictionaryVersion, row.puzzleId);
    if (!puzzle || !isSupportedPanalRules(row.rulesVersion))
      return { ok: false, reason: "DICTIONARY_UNAVAILABLE", game };
    const error = panalWordError(word, puzzle.letters, puzzle.center);
    if (error) return { ok: false, reason: error, game };
    if (!puzzle.words.includes(word)) return { ok: false, reason: "UNKNOWN_WORD", game };
    await ctx.tx.insert(panalWord).values({ gameId: row.id, word });
    const score = game.score + panalWordScore(word);
    const updated = await grantRewards(
      ctx,
      row,
      {
        ...game,
        words: [...game.words, word],
        score,
        complete: game.words.length + 1 === puzzle.words.length,
      },
      panalPuzzleView(puzzle).geniusScore,
      now,
    );
    await ctx.audit({
      action: "panal.word-found",
      entityType: "panal_game",
      entityId: row.id,
      after: { day: row.day, score, words: updated.words.length },
    });
    return { ok: true, added: true, game: updated };
  });
}

export async function listPanalGamesFor(personId: string): Promise<PanalGameView[]> {
  return getDb().transaction(
    async (db) => {
      const rows = await db
        .select()
        .from(panalGame)
        .where(eq(panalGame.personId, personId))
        .orderBy(desc(panalGame.day));
      return Promise.all(rows.map((row) => gameView(row, db)));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
