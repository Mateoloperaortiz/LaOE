import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { wordleCompleted } from "@/domain-events/participation";
import { findTermContaining } from "@/modules/terms";
import { t } from "@/shared/copy";
import { logger } from "@/shared/log";
import { wordleAttempt, wordleGame } from "../schema";
import type { SubmitWordleInput, TodayWordle, WordleGameView, WordleResult } from "../wordle-types";
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
  hasWordleDictionary,
  isWordleGuess,
  WORDLE_ANSWERS,
  WORDLE_DICTIONARY_VERSION,
} from "./wordle-dictionary";
import {
  isWordleWord,
  normalizeWordleGuess,
  scoreWordleGuess,
  WORDLE_MAX_ATTEMPTS,
  WORDLE_RULES_VERSION,
  wordleReward,
} from "./wordle-pure";

type GameRow = typeof wordleGame.$inferSelect;
type AttemptRow = typeof wordleAttempt.$inferSelect;
type MemberActor = Actor & { personId: string };

const submitSchema = z.object({
  gameId: z.string().min(1).max(80),
  guess: z.string().min(1).max(40),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  expectedAttempt: z.number().int().min(1).max(WORDLE_MAX_ATTEMPTS),
});

/** Lo que el Wordle le declara a la guardia de la partida diaria (ADR-119 regla 7). */
const GUARD = {
  // Serializa solamente la asignación: respuestas únicas por día para toda la comunidad.
  lock: { key: "wordle-day", per: "DAY" },
  startWhenClosed: "SAVED_FIRST",
  expiredAndClosed: "TERM_CLOSED",
  movedTerm: "EXPIRED",
} as const satisfies DailyGameRules;

async function attemptsFor(gameId: string, exec: Executor): Promise<AttemptRow[]> {
  return exec
    .select()
    .from(wordleAttempt)
    .where(eq(wordleAttempt.gameId, gameId))
    .orderBy(asc(wordleAttempt.ordinal));
}

/** Proyección explícita: nunca devolver una fila de juego privada con spread. */
function gameView(row: GameRow, attempts: AttemptRow[], now: Date, ended = false): WordleGameView {
  const status =
    row.status === "IN_PROGRESS" && (ended || row.day !== dayKeyFor(now)) ? "EXPIRED" : row.status;
  return {
    id: row.id,
    day: row.day,
    termId: row.termId,
    status,
    attempts: attempts.map(({ ordinal, guess, feedback }) => ({ ordinal, guess, feedback })),
    points: status === "WON" ? wordleReward(attempts.length) : 0,
    answer: status === "IN_PROGRESS" ? null : row.answer,
    nextAvailableAt: nextDayAt(row.day),
  };
}

/** Lectura sin crear partidas; el personId siempre lo resuelve el servidor desde la sesión. */
export async function getTodayWordle(personId: string): Promise<TodayWordle> {
  const now = new Date();
  const day = dayKeyFor(now);
  // Estado e intentos pertenecen al mismo snapshot aunque otro dispositivo termine al leer.
  return getDb().transaction(
    async (db): Promise<TodayWordle> => {
      const current = await findTermContaining(day, db);
      const allowed = await isEligibleToPlay(personId, db);
      const [row] = await db
        .select()
        .from(wordleGame)
        .where(and(eq(wordleGame.personId, personId), eq(wordleGame.day, day)))
        .limit(1);
      const availability = !allowed
        ? "NOT_ELIGIBLE"
        : !current
          ? "NO_TERM"
          : current.pointsClosedAt
            ? "TERM_CLOSED"
            : "AVAILABLE";
      return {
        day,
        nextAvailableAt: nextDayAt(day),
        termId: current?.id ?? null,
        availability,
        game: row
          ? gameView(
              row,
              await attemptsFor(row.id, db),
              now,
              Boolean(current?.pointsClosedAt) || row.termId !== current?.id,
            )
          : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function startWordleAs(actor: MemberActor): Promise<WordleResult> {
  return runCommand(actor, async (ctx) => {
    const guard = await startDailyGame(ctx, GUARD, {
      personId: actor.personId,
      now: () => new Date(),
      expectedDay: null,
    });
    if (!guard.ok) return { ok: false, reason: guard.reason };
    const { day: initialDay, term: current, open, now } = guard;
    const [existing] = await ctx.tx
      .select()
      .from(wordleGame)
      .where(and(eq(wordleGame.personId, actor.personId), eq(wordleGame.day, initialDay)))
      .limit(1)
      .for("update");
    if (existing)
      return {
        ok: true,
        game: gameView(
          existing,
          await attemptsFor(existing.id, ctx.tx),
          now,
          !open || existing.termId !== current.id,
        ),
      };
    if (!open) return { ok: false, reason: "TERM_CLOSED" };
    const taken = await ctx.tx
      .select({ answer: wordleGame.answer })
      .from(wordleGame)
      .where(eq(wordleGame.day, initialDay));
    const used = new Set(taken.map((row) => row.answer));
    const available = WORDLE_ANSWERS.filter((answer) => !used.has(answer));
    if (available.length === 0) {
      logger.error({ day: initialDay, assigned: used.size }, "wordle.answer-pool-exhausted");
      return { ok: false, reason: "EXHAUSTED" };
    }
    const answer = available[randomInt(available.length)];
    if (!answer) throw new Error("No se pudo asignar la palabra de Wordle");
    const [created] = await ctx.tx
      .insert(wordleGame)
      .values({
        personId: actor.personId,
        termId: current.id,
        day: initialDay,
        answer,
        dictionaryVersion: WORDLE_DICTIONARY_VERSION,
        rulesVersion: WORDLE_RULES_VERSION,
      })
      .returning();
    if (!created) throw new Error("No se pudo crear la partida de Wordle");
    await ctx.audit({
      action: "wordle.started",
      entityType: "wordle_game",
      entityId: created.id,
      after: { personId: actor.personId, day: initialDay, termId: current.id },
    });
    return { ok: true, game: gameView(created, [], now) };
  });
}

async function expireGame(ctx: CommandContext, row: GameRow, now: Date): Promise<GameRow> {
  if (row.status !== "IN_PROGRESS") return row;
  await ctx.tx
    .update(wordleGame)
    .set({ status: "EXPIRED", completedAt: now })
    .where(eq(wordleGame.id, row.id));
  await ctx.audit({
    action: "wordle.expired",
    entityType: "wordle_game",
    entityId: row.id,
    after: { day: row.day, termId: row.termId },
  });
  return { ...row, status: "EXPIRED", completedAt: now };
}

/** Toda regla, comparación y acreditación se decide en servidor bajo la misma transacción. */
export async function submitWordleGuessAs(
  actor: MemberActor,
  raw: SubmitWordleInput,
): Promise<WordleResult> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID_INPUT" };
  const input = parsed.data;
  const guess = normalizeWordleGuess(input.guess);
  if (!isWordleWord(guess)) return { ok: false, reason: "INVALID_INPUT" };
  // Solo localiza el semestre. La propiedad y el estado vuelven a comprobarse bajo lock.
  const [ref] = await getDb()
    .select({ termId: wordleGame.termId })
    .from(wordleGame)
    .where(and(eq(wordleGame.id, input.gameId), eq(wordleGame.personId, actor.personId)))
    .limit(1);
  if (!ref) return { ok: false, reason: "NOT_FOUND" };
  return runCommand(actor, async (ctx) => {
    const open = await lockDailyGame(ctx, GUARD, {
      personId: actor.personId,
      termId: ref.termId,
    });
    const [row] = await ctx.tx
      .select()
      .from(wordleGame)
      .where(and(eq(wordleGame.id, input.gameId), eq(wordleGame.personId, actor.personId)))
      .for("update");
    if (!row) return { ok: false, reason: "NOT_FOUND" };
    const attempts = await attemptsFor(row.id, ctx.tx);
    const now = new Date();
    const replay = attempts.find((attempt) => attempt.requestId === input.requestId);
    if (replay) {
      if (replay.guess !== guess || replay.ordinal !== input.expectedAttempt)
        return { ok: false, reason: "REQUEST_CONFLICT", game: gameView(row, attempts, now, !open) };
      return { ok: true, game: gameView(row, attempts, now, !open) };
    }
    if (row.status !== "IN_PROGRESS")
      return {
        ok: false,
        reason: row.status === "EXPIRED" ? "EXPIRED" : "FINISHED",
        game: gameView(row, attempts, now),
      };
    const refusal = await refusalToContinue(ctx, GUARD, {
      personId: actor.personId,
      game: row,
      open,
      now,
    });
    // Sin elegibilidad la partida sigue abierta; vencida o con el semestre cerrado, termina.
    if (refusal === "NOT_ELIGIBLE")
      return { ok: false, reason: refusal, game: gameView(row, attempts, now) };
    if (refusal) {
      const expired = await expireGame(ctx, row, now);
      return { ok: false, reason: refusal, game: gameView(expired, attempts, now) };
    }
    if (attempts.length + 1 !== input.expectedAttempt)
      return { ok: false, reason: "STALE_ATTEMPT", game: gameView(row, attempts, now) };
    if (row.rulesVersion !== WORDLE_RULES_VERSION || !hasWordleDictionary(row.dictionaryVersion))
      return { ok: false, reason: "DICTIONARY_UNAVAILABLE", game: gameView(row, attempts, now) };
    if (!isWordleGuess(guess, row.dictionaryVersion))
      return { ok: false, reason: "UNKNOWN_WORD", game: gameView(row, attempts, now) };
    const feedback = scoreWordleGuess(guess, row.answer);
    const ordinal = attempts.length + 1;
    const won = guess === row.answer;
    const status = won ? "WON" : ordinal === WORDLE_MAX_ATTEMPTS ? "LOST" : "IN_PROGRESS";
    const [attempt] = await ctx.tx
      .insert(wordleAttempt)
      .values({ gameId: row.id, ordinal, requestId: input.requestId, guess, feedback })
      .returning();
    if (!attempt) throw new Error("No se pudo guardar el intento de Wordle");
    await ctx.tx
      .update(wordleGame)
      .set({ status, completedAt: status === "IN_PROGRESS" ? null : now })
      .where(eq(wordleGame.id, row.id));
    const points = won ? wordleReward(ordinal) : 0;
    if (won) {
      await creditGame(ctx, {
        game: "WORDLE",
        runId: row.id,
        personId: actor.personId,
        termId: row.termId,
        points,
        reason: t("T-1261", { fecha: row.day, intento: ordinal }),
      });
      await ctx.emit(
        eventOf(wordleCompleted, {
          personId: actor.personId,
          termId: row.termId,
          gameId: row.id,
          day: row.day,
          attempts: ordinal,
          points,
        }),
      );
    }
    await ctx.audit({
      action: won ? "wordle.completed" : "wordle.attempted",
      entityType: "wordle_game",
      entityId: row.id,
      after: {
        personId: actor.personId,
        day: row.day,
        termId: row.termId,
        ordinal,
        status,
        points,
      },
    });
    return { ok: true, game: gameView({ ...row, status }, [...attempts, attempt], now) };
  });
}

/** Historial propio para Mis datos. La respuesta de hoy sigue privada hasta finalizar. */
export async function listWordleGamesFor(personId: string): Promise<WordleGameView[]> {
  return getDb().transaction(
    async (db) => {
      const games = await db
        .select()
        .from(wordleGame)
        .where(eq(wordleGame.personId, personId))
        .orderBy(desc(wordleGame.day));
      if (games.length === 0) return [];
      const attempts = await db
        .select()
        .from(wordleAttempt)
        .where(
          inArray(
            wordleAttempt.gameId,
            games.map((row) => row.id),
          ),
        )
        .orderBy(asc(wordleAttempt.ordinal));
      const now = new Date();
      return games.map((row) =>
        gameView(
          row,
          attempts.filter((attempt) => attempt.gameId === row.id),
          now,
        ),
      );
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
