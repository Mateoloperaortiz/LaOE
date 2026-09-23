import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { panalCompleted } from "@/domain-events/participation";
import { getMembershipRef } from "@/modules/people";
import { findTermContaining, getTerm, lockOpenTermPoints } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  normalizePanalWord,
  PANAL_REWARD,
  PANAL_RULES_VERSION,
  panalWordError,
  panalWordScore,
} from "../panal-engine";
import type { PanalGameView, PanalResult, TodayPanal } from "../panal-types";
import { panalGame, panalWord, pointEntry } from "../schema";
import {
  getPanalPuzzle,
  PANAL_DICTIONARY_VERSION,
  panalPuzzleForDay,
  panalPuzzleView,
} from "./panal-dictionary";
import { nextWordleAt, wordleDay } from "./wordle-pure";

type Row = typeof panalGame.$inferSelect;
type MemberActor = Actor & { personId: string };
const submitSchema = z.object({
  gameId: z.string().min(1).max(80),
  word: z.string().min(1).max(64),
});

async function eligible(personId: string, db: Executor) {
  const membership = await getMembershipRef(personId, db);
  return membership?.status === "ACTIVE" || membership?.status === "HONORARY";
}

async function gameView(row: Row, db: Executor): Promise<PanalGameView> {
  const words = (
    await db
      .select({ word: panalWord.word })
      .from(panalWord)
      .where(eq(panalWord.gameId, row.id))
      .orderBy(asc(panalWord.createdAt), asc(panalWord.word))
  ).map((item) => item.word);
  const puzzle = getPanalPuzzle(row.dictionaryVersion, row.puzzleId);
  return {
    id: row.id,
    day: row.day,
    words,
    score: words.reduce((sum, word) => sum + panalWordScore(word), 0),
    points: row.creditedAt ? PANAL_REWARD : 0,
    complete: Boolean(puzzle && words.length === puzzle.words.length),
  };
}

export async function getTodayPanal(personId: string): Promise<TodayPanal> {
  const day = wordleDay();
  return getDb().transaction(
    async (db) => {
      const current = await findTermContaining(day, db);
      const allowed = await eligible(personId, db);
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
            : !puzzle || (row && row.rulesVersion !== PANAL_RULES_VERSION)
              ? "DICTIONARY_UNAVAILABLE"
              : "AVAILABLE";
      return {
        day,
        nextAvailableAt: nextWordleAt(day),
        availability,
        puzzle: puzzle ? panalPuzzleView(puzzle) : null,
        game: row ? await gameView(row, db) : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function lockTerm(ctx: CommandContext, termId: string): Promise<boolean> {
  try {
    await lockOpenTermPoints(ctx.tx, termId);
    return true;
  } catch (error) {
    if (error instanceof DomainError && (await getTerm(termId, ctx.tx))?.pointsClosedAt)
      return false;
    throw error;
  }
}

async function lockPerson(ctx: CommandContext, personId: string) {
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`panal:${personId}`}, 0))`,
  );
}

export async function startPanalAs(actor: MemberActor, expectedDay: string): Promise<PanalResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDay)) return { ok: false, reason: "INVALID_INPUT" };
  return runCommand(actor, async (ctx): Promise<PanalResult> => {
    const current = await findTermContaining(wordleDay(), ctx.tx);
    if (!current) return { ok: false, reason: "NO_TERM" };
    const open = await lockTerm(ctx, current.id);
    await lockPerson(ctx, actor.personId);
    const day = wordleDay();
    if (day !== expectedDay) return { ok: false, reason: "EXPIRED" };
    if (!(await eligible(actor.personId, ctx.tx))) return { ok: false, reason: "NOT_ELIGIBLE" };
    if (!open) return { ok: false, reason: "TERM_CLOSED" };
    const [existing] = await ctx.tx
      .select()
      .from(panalGame)
      .where(and(eq(panalGame.personId, actor.personId), eq(panalGame.day, day)));
    if (existing) return { ok: true, game: await gameView(existing, ctx.tx), added: false };
    const puzzle = panalPuzzleForDay(day);
    const [row] = await ctx.tx
      .insert(panalGame)
      .values({
        personId: actor.personId,
        termId: current.id,
        day,
        puzzleId: puzzle.id,
        dictionaryVersion: PANAL_DICTIONARY_VERSION,
        rulesVersion: PANAL_RULES_VERSION,
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
    const open = await lockTerm(ctx, ref.termId);
    await lockPerson(ctx, actor.personId);
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
    if (row.day !== wordleDay(now)) return { ok: false, reason: "EXPIRED", game };
    if (!open || (await findTermContaining(row.day, ctx.tx))?.id !== row.termId)
      return { ok: false, reason: "TERM_CLOSED", game };
    if (!(await eligible(actor.personId, ctx.tx)))
      return { ok: false, reason: "NOT_ELIGIBLE", game };
    const puzzle = getPanalPuzzle(row.dictionaryVersion, row.puzzleId);
    if (!puzzle || row.rulesVersion !== PANAL_RULES_VERSION)
      return { ok: false, reason: "DICTIONARY_UNAVAILABLE", game };
    const error = panalWordError(word, puzzle.letters, puzzle.center);
    if (error) return { ok: false, reason: error, game };
    if (!puzzle.words.includes(word)) return { ok: false, reason: "UNKNOWN_WORD", game };
    await ctx.tx.insert(panalWord).values({ gameId: row.id, word });
    const score = game.score + panalWordScore(word);
    const credit = !row.creditedAt && score >= panalPuzzleView(puzzle).geniusScore;
    if (credit) {
      await ctx.tx.update(panalGame).set({ creditedAt: now }).where(eq(panalGame.id, row.id));
      await ctx.tx.insert(pointEntry).values({
        personId: actor.personId,
        termId: row.termId,
        panalGameId: row.id,
        kind: "PANAL",
        points: PANAL_REWARD,
        reason: t("T-2752", { fecha: row.day }),
        createdById: actor.personId,
      });
      await ctx.emit(
        eventOf(panalCompleted, {
          personId: actor.personId,
          termId: row.termId,
          gameId: row.id,
          day: row.day,
          score,
          points: PANAL_REWARD,
        }),
      );
    }
    await ctx.audit({
      action: credit ? "panal.credited" : "panal.word-found",
      entityType: "panal_game",
      entityId: row.id,
      after: {
        day: row.day,
        score,
        words: game.words.length + 1,
        points: credit ? PANAL_REWARD : 0,
      },
    });
    return {
      ok: true,
      added: true,
      game: {
        ...game,
        words: [...game.words, word],
        score,
        points: credit ? PANAL_REWARD : game.points,
        complete: game.words.length + 1 === puzzle.words.length,
      },
    };
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
