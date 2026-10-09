import { randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { game2048Completed } from "@/domain-events/participation";
import { findTermContaining } from "@/modules/terms";
import { t } from "@/shared/copy";
import {
  GAME2048_MAX_MOVES,
  GAME2048_RULES_VERSION,
  game2048Reward,
  isGame2048Moves,
  replayGame2048,
} from "../game2048-engine";
import type {
  Game2048Result,
  Game2048RunView,
  Game2048StartedView,
  Game2048StartResult,
  Game2048Status,
  TodayGame2048,
} from "../game2048-types";
import { game2048Run } from "../schema";
import {
  type DailyGameRules,
  isEligibleToPlay,
  lockDailyGame,
  refusalToContinue,
  startDailyGame,
} from "./daily-game-guard";
import { dayKeyFor, nextDayAt } from "./gamification-pure";
import { creditGame } from "./ledger";

// 2048 diario (ADR-075). El servidor nunca lee un puntaje del cliente: reparte la semilla, recibe la
// lista de movimientos y rejuega la partida entera con el motor puro. Se puede jugar sin límite; el
// único parcial sobre `creditedAt` es lo que garantiza un solo crédito por día civil de Colombia.

type RunRow = typeof game2048Run.$inferSelect;
type MemberActor = Actor & { personId: string };

const requestId = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/);
const startSchema = z.object({ requestId });
const finishSchema = z.object({
  runId: z.string().min(1).max(80),
  moves: z
    .string()
    .max(GAME2048_MAX_MOVES)
    .regex(/^[UDLR]*$/),
  requestId,
});

/** Lo que el 2048 le declara a la guardia de la partida diaria (ADR-119 regla 7). */
const GUARD = {
  // Serializa por persona: el crédito del día y la partida abierta se deciden de a uno.
  lock: { key: "game2048", per: "PERSON" },
  startWhenClosed: "SAVED_FIRST",
  expiredAndClosed: "EXPIRED",
  movedTerm: "NOT_ELIGIBLE",
} as const satisfies DailyGameRules;

/** Proyección explícita: la semilla y la lista de movimientos no salen por aquí. */
function runView(row: RunRow, now: Date): Game2048RunView {
  const status: Game2048Status =
    row.status === "IN_PROGRESS" && row.day !== dayKeyFor(now) ? "EXPIRED" : row.status;
  return {
    id: row.id,
    day: row.day,
    status,
    score: row.score,
    maxTile: row.maxTile,
    moveCount: row.moveCount,
    points: row.creditedPoints ?? 0,
  };
}

/** La semilla solo viaja a su dueño y solo para una partida abierta: con ella se reproduce el tablero. */
function startedView(row: RunRow, now: Date): Game2048StartedView {
  return { ...runView(row, now), seed: row.seed, rulesVersion: row.rulesVersion };
}

/** Lectura sin crear partidas; el personId siempre lo resuelve el servidor desde la sesión. */
export async function getTodayGame2048(personId: string): Promise<TodayGame2048> {
  const now = new Date();
  const day = dayKeyFor(now);
  return getDb().transaction(
    async (db): Promise<TodayGame2048> => {
      const current = await findTermContaining(day, db);
      const allowed = await isEligibleToPlay(personId, db);
      const mine = await db
        .select()
        .from(game2048Run)
        .where(eq(game2048Run.personId, personId))
        .orderBy(desc(game2048Run.createdAt));
      const open = mine.find((row) => row.status === "IN_PROGRESS" && row.day === day) ?? null;
      const credited = mine.find((row) => row.day === day && row.creditedAt !== null) ?? null;
      const best = mine
        .filter((row) => row.termId === current?.id)
        .reduce((top, row) => (row.score > top ? row.score : top), 0);
      return {
        day,
        nextAvailableAt: nextDayAt(day),
        termId: current?.id ?? null,
        availability: !allowed
          ? "NOT_ELIGIBLE"
          : !current
            ? "NO_TERM"
            : current.pointsClosedAt
              ? "TERM_CLOSED"
              : "AVAILABLE",
        open: open ? startedView(open, now) : null,
        credited: credited ? runView(credited, now) : null,
        best,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function expireRun(ctx: CommandContext, row: RunRow, now: Date): Promise<RunRow> {
  if (row.status !== "IN_PROGRESS") {
    return row;
  }
  await ctx.tx
    .update(game2048Run)
    .set({ status: "EXPIRED", finishedAt: now })
    .where(eq(game2048Run.id, row.id));
  await ctx.audit({
    action: "game2048.expired",
    entityType: "game2048_run",
    entityId: row.id,
    after: { day: row.day, termId: row.termId },
  });
  return { ...row, status: "EXPIRED", finishedAt: now };
}

/** Empieza una partida, o devuelve la que quedó abierta hoy. Un GET nunca reparte una semilla. */
export async function startGame2048As(
  actor: MemberActor,
  input: unknown,
): Promise<Game2048StartResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  return runCommand(actor, async (ctx) => {
    const guard = await startDailyGame(ctx, GUARD, {
      personId: actor.personId,
      now: () => new Date(),
      expectedDay: null,
    });
    if (!guard.ok) {
      return { ok: false, reason: guard.reason };
    }
    const { day, term: current, open, now } = guard;
    const [existing] = await ctx.tx
      .select()
      .from(game2048Run)
      .where(and(eq(game2048Run.personId, actor.personId), eq(game2048Run.status, "IN_PROGRESS")))
      .limit(1)
      .for("update");
    // Repetir el requestId, o volver a pedir partida con una abierta de hoy, devuelve la misma.
    if (existing?.day === day) {
      return { ok: true, run: startedView(existing, now) };
    }
    if (existing) {
      await expireRun(ctx, existing, now);
    }
    if (!open) {
      return { ok: false, reason: "TERM_CLOSED" };
    }
    const [created] = await ctx.tx
      .insert(game2048Run)
      .values({
        personId: actor.personId,
        termId: current.id,
        day,
        seed: randomBytes(8).toString("hex"),
        rulesVersion: GAME2048_RULES_VERSION,
        startRequestId: parsed.data.requestId,
      })
      .returning();
    if (!created) {
      throw new Error("No se pudo crear la partida de 2048");
    }
    await ctx.audit({
      action: "game2048.started",
      entityType: "game2048_run",
      entityId: created.id,
      // La semilla no entra a la auditoría: reproduce el tablero entero.
      after: { personId: actor.personId, day, termId: current.id },
    });
    return { ok: true, run: startedView(created, now) };
  });
}

/**
 * Cierra la partida con la lista de movimientos. El servidor la rejuega desde la semilla que él mismo
 * repartió y el puntaje que sale de ahí es el único que vale. Acredita si alcanza el primer umbral y
 * la persona todavía no acreditó hoy; una partida que no acredita no consume el crédito del día.
 */
export async function finishGame2048As(
  actor: MemberActor,
  input: unknown,
): Promise<Game2048Result> {
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success || !isGame2048Moves(parsed.data.moves)) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  const { runId, moves } = parsed.data;
  const db = getDb();
  const [stored] = await db
    .select()
    .from(game2048Run)
    .where(and(eq(game2048Run.id, runId), eq(game2048Run.personId, actor.personId)))
    .limit(1);
  if (!stored) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  // Réplica antes de gastar CPU: el mismo envío devuelve lo guardado, otro contenido se rechaza.
  if (stored.finishRequestId === parsed.data.requestId) {
    return stored.moves === moves
      ? { ok: true, run: runView(stored, new Date()) }
      : { ok: false, reason: "REQUEST_CONFLICT", run: runView(stored, new Date()) };
  }
  if (stored.status !== "IN_PROGRESS") {
    return { ok: false, reason: "FINISHED", run: runView(stored, new Date()) };
  }
  // El replay corre fuera de la transacción: la semilla y los movimientos ya no cambian.
  const replay = replayGame2048(stored.seed, moves);
  if (!replay) {
    return { ok: false, reason: "INVALID_MOVES" };
  }

  return runCommand(actor, async (ctx) => {
    // El reloj se lee al llegar, antes de los candados (decisión abierta 50).
    const now = new Date();
    const day = dayKeyFor(now);
    const open = await lockDailyGame(ctx, GUARD, {
      personId: actor.personId,
      termId: stored.termId,
    });
    const [row] = await ctx.tx
      .select()
      .from(game2048Run)
      .where(and(eq(game2048Run.id, runId), eq(game2048Run.personId, actor.personId)))
      .limit(1)
      .for("update");
    if (!row) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (row.finishRequestId === parsed.data.requestId) {
      return row.moves === moves
        ? { ok: true, run: runView(row, now) }
        : { ok: false, reason: "REQUEST_CONFLICT", run: runView(row, now) };
    }
    if (row.status !== "IN_PROGRESS") {
      return { ok: false, reason: "FINISHED", run: runView(row, now) };
    }
    const refusal = await refusalToContinue(ctx, GUARD, {
      personId: actor.personId,
      game: row,
      open,
      now,
    });
    if (refusal) {
      const expired = await expireRun(ctx, row, now);
      return { ok: false, reason: refusal, run: runView(expired, now) };
    }
    // Ya acreditada hoy: la partida se guarda igual, simplemente no acredita otra vez.
    const [creditedToday] = await ctx.tx
      .select({ id: game2048Run.id })
      .from(game2048Run)
      .where(
        and(
          eq(game2048Run.personId, actor.personId),
          eq(game2048Run.day, day),
          isNotNull(game2048Run.creditedAt),
        ),
      )
      .limit(1);
    const reward = game2048Reward(replay.score);
    const points = creditedToday ? 0 : reward;
    const [saved] = await ctx.tx
      .update(game2048Run)
      .set({
        status: "FINISHED",
        moves,
        moveCount: replay.moves,
        score: replay.score,
        maxTile: replay.maxTile,
        finishedAt: now,
        finishRequestId: parsed.data.requestId,
        ...(points > 0 ? { creditedAt: now, creditedPoints: points } : {}),
      })
      .where(eq(game2048Run.id, row.id))
      .returning();
    if (!saved) {
      throw new Error("No se pudo guardar la partida de 2048");
    }
    if (points > 0) {
      await creditGame(ctx, {
        game: "GAME2048",
        runId: row.id,
        personId: actor.personId,
        termId: row.termId,
        points,
        reason: t("T-2654", { fecha: row.day, puntaje: replay.score }),
      });
      await ctx.emit(
        eventOf(game2048Completed, {
          personId: actor.personId,
          termId: row.termId,
          runId: row.id,
          day: row.day,
          score: replay.score,
          maxTile: replay.maxTile,
          points,
        }),
      );
    }
    await ctx.audit({
      action: points > 0 ? "game2048.credited" : "game2048.finished",
      entityType: "game2048_run",
      entityId: row.id,
      // Ni la semilla ni la lista de movimientos entran a la auditoría.
      after: {
        personId: actor.personId,
        day: row.day,
        termId: row.termId,
        score: replay.score,
        maxTile: replay.maxTile,
        moves: replay.moves,
        points,
      },
    });
    return { ok: true, run: runView(saved, now) };
  });
}

/** Historial propio para Mis datos: sin semillas ni listas de movimientos. */
export async function listGame2048RunsFor(personId: string): Promise<Game2048RunView[]> {
  const now = new Date();
  const rows = await getDb()
    .select()
    .from(game2048Run)
    .where(eq(game2048Run.personId, personId))
    .orderBy(desc(game2048Run.day), desc(game2048Run.createdAt));
  return rows.map((row) => runView(row, now));
}
