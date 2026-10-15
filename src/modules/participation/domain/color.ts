import { randomInt } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { findTermContaining } from "@/modules/terms";
import { t } from "@/shared/copy";
import {
  COLOR_ROUNDS,
  COLOR_RULES_VERSION,
  COLOR_WATCH_MS,
  colorAccuracy,
  colorReward,
} from "../color-engine";
import type { ColorDenial, ColorResult, ColorRunView, TodayColor } from "../color-types";
import { colorRun } from "../schema";
import {
  type DailyGameRules,
  isEligibleToPlay,
  lockDailyGame,
  refusalToContinue,
  startDailyGame,
} from "./daily-game-guard";
import { dayKeyFor, nextDayAt } from "./gamification-pure";
import { creditGame } from "./ledger";

type MemberActor = Actor & { personId: string };
type RunRow = typeof colorRun.$inferSelect;
const requestId = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/);
const startSchema = z.object({ requestId }).strict();
const nextSchema = startSchema.extend({ runId: z.string().min(1).max(80) });
const answerSchema = z
  .object({
    h: z.number().int().min(0).max(360),
    s: z.number().int().min(0).max(100),
    l: z.number().int().min(0).max(100),
  })
  .strict();
const submitSchema = nextSchema.extend({
  round: z.number().int().min(1).max(3),
  answer: answerSchema,
});
const DAILY_RULES = {
  lock: { key: "color", per: "PERSON" },
  startWhenClosed: "SAVED_FIRST",
  expiredAndClosed: "EXPIRED",
  movedTerm: "NOT_ELIGIBLE",
} as const satisfies DailyGameRules;

/** Solo el objetivo de la ronda vigente mientras se observa; nunca las siguientes ni requestIds. */
function runView(row: RunRow, now: Date): ColorRunView {
  const status =
    row.status === "IN_PROGRESS" && row.day !== dayKeyFor(now) ? "EXPIRED" : row.status;
  const answered = row.results.some((item) => item.round === row.round);
  const watchUntil =
    status === "IN_PROGRESS" && !answered
      ? new Date(row.watchStartedAt.getTime() + COLOR_WATCH_MS)
      : null;
  return {
    id: row.id,
    day: row.day,
    status,
    round: row.round,
    watchUntil: watchUntil?.toISOString() ?? null,
    target: watchUntil && now < watchUntil ? (row.targets[row.round - 1] ?? null) : null,
    results: row.results.map(({ round, target, answer, accuracy }) => ({
      round,
      target,
      answer,
      accuracy: Math.round(accuracy * 10) / 10,
    })),
    average: row.average,
    points: row.creditedPoints ?? 0,
  };
}

export async function getTodayColor(personId: string): Promise<TodayColor> {
  const now = new Date();
  const day = dayKeyFor(now);
  return getDb().transaction(
    async (tx): Promise<TodayColor> => {
      const current = await findTermContaining(day, tx);
      const allowed = await isEligibleToPlay(personId, tx);
      const mine = await tx
        .select()
        .from(colorRun)
        .where(eq(colorRun.personId, personId))
        .orderBy(desc(colorRun.createdAt));
      const open = mine.find((row) => row.status === "IN_PROGRESS" && row.day === day);
      const credited = mine.find((row) => row.day === day && row.creditedAt !== null);
      return {
        serverNow: now.toISOString(),
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
        open: open ? runView(open, now) : null,
        credited: credited ? runView(credited, now) : null,
        best: mine
          .filter((row) => row.termId === current?.id)
          .reduce((best, row) => Math.max(best, row.average ?? 0), 0),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function startColorAs(actor: MemberActor, input: unknown): Promise<ColorResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID_INPUT" };
  return runCommand(actor, async (ctx): Promise<ColorResult> => {
    const start = await startDailyGame(ctx, DAILY_RULES, {
      personId: actor.personId,
      now: () => new Date(),
      expectedDay: null,
    });
    if (!start.ok) return { ok: false, reason: start.reason };
    const { day, term, now, open } = start;
    const [repeated] = await ctx.tx
      .select()
      .from(colorRun)
      .where(
        and(
          eq(colorRun.personId, actor.personId),
          eq(colorRun.startRequestId, parsed.data.requestId),
        ),
      )
      .limit(1);
    if (repeated) return { ok: true, serverNow: now.toISOString(), run: runView(repeated, now) };
    const [existing] = await ctx.tx
      .select()
      .from(colorRun)
      .where(and(eq(colorRun.personId, actor.personId), eq(colorRun.status, "IN_PROGRESS")))
      .limit(1)
      .for("update");
    if (existing?.day === day)
      return { ok: true, serverNow: now.toISOString(), run: runView(existing, now) };
    if (existing)
      await ctx.tx
        .update(colorRun)
        .set({ status: "EXPIRED", finishedAt: now })
        .where(eq(colorRun.id, existing.id));
    if (!open) return { ok: false, reason: "TERM_CLOSED" };
    const [created] = await ctx.tx
      .insert(colorRun)
      .values({
        personId: actor.personId,
        termId: term.id,
        day,
        rulesVersion: COLOR_RULES_VERSION,
        startRequestId: parsed.data.requestId,
        targets: Array.from({ length: COLOR_ROUNDS }, () => ({
          h: randomInt(360),
          s: randomInt(45, 91),
          l: randomInt(35, 76),
        })),
        watchStartedAt: now,
      })
      .returning();
    if (!created) throw new Error("No se pudo iniciar Color");
    await ctx.audit({
      action: "color.started",
      entityType: "color_run",
      entityId: created.id,
      after: { personId: actor.personId, termId: term.id, day },
    });
    return { ok: true, serverNow: now.toISOString(), run: runView(created, now) };
  });
}

/** Término→persona→partida. El reloj de esta partida se lee después de los candados. */
async function mutateRun(
  actor: MemberActor,
  runId: string,
  action: (ctx: CommandContext, row: RunRow, open: boolean, now: Date) => Promise<ColorResult>,
): Promise<ColorResult> {
  const [stored] = await getDb()
    .select({ termId: colorRun.termId })
    .from(colorRun)
    .where(and(eq(colorRun.id, runId), eq(colorRun.personId, actor.personId)))
    .limit(1);
  if (!stored) return { ok: false, reason: "NOT_FOUND" };
  return runCommand(actor, async (ctx) => {
    const open = await lockDailyGame(ctx, DAILY_RULES, {
      personId: actor.personId,
      termId: stored.termId,
    });
    const [row] = await ctx.tx
      .select()
      .from(colorRun)
      .where(and(eq(colorRun.id, runId), eq(colorRun.personId, actor.personId)))
      .limit(1)
      .for("update");
    if (!row) return { ok: false, reason: "NOT_FOUND" };
    return action(ctx, row, open, new Date());
  });
}

async function refusal(
  ctx: CommandContext,
  row: RunRow,
  open: boolean,
  now: Date,
): Promise<ColorDenial | null> {
  if (row.status !== "IN_PROGRESS") return row.status === "EXPIRED" ? "EXPIRED" : "FINISHED";
  const reason =
    row.rulesVersion !== COLOR_RULES_VERSION
      ? "EXPIRED"
      : await refusalToContinue(ctx, DAILY_RULES, {
          personId: row.personId,
          game: row,
          open,
          now,
        });
  if (reason)
    await ctx.tx
      .update(colorRun)
      .set({ status: "EXPIRED", finishedAt: now })
      .where(eq(colorRun.id, row.id));
  return reason;
}

export async function nextColorRoundAs(actor: MemberActor, input: unknown): Promise<ColorResult> {
  const parsed = nextSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID_INPUT" };
  return mutateRun(actor, parsed.data.runId, async (ctx, row, open, now) => {
    if (row.nextRoundRequests.includes(parsed.data.requestId))
      return { ok: true, serverNow: now.toISOString(), run: runView(row, now) };
    const reason = await refusal(ctx, row, open, now);
    if (reason) return { ok: false, reason };
    if (row.results.length !== row.round || row.round >= COLOR_ROUNDS)
      return { ok: false, reason: "ROUND_NOT_READY" };
    const [saved] = await ctx.tx
      .update(colorRun)
      .set({
        round: row.round + 1,
        watchStartedAt: now,
        nextRoundRequests: [...row.nextRoundRequests, parsed.data.requestId],
      })
      .where(eq(colorRun.id, row.id))
      .returning();
    if (!saved) throw new Error("No se pudo empezar la siguiente ronda de Color");
    await ctx.audit({
      action: "color.round-started",
      entityType: "color_run",
      entityId: row.id,
      after: { personId: row.personId, day: row.day, round: saved.round },
    });
    return { ok: true, serverNow: now.toISOString(), run: runView(saved, now) };
  });
}

export async function submitColorRoundAs(actor: MemberActor, input: unknown): Promise<ColorResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "INVALID_INPUT" };
  const { runId, round, answer, requestId } = parsed.data;
  return mutateRun(actor, runId, async (ctx, row, open, now) => {
    const previous = row.results.find((item) => item.requestId === requestId);
    if (previous) {
      if (
        previous.round !== round ||
        previous.answer.h !== answer.h ||
        previous.answer.s !== answer.s ||
        previous.answer.l !== answer.l
      )
        return { ok: false, reason: "REQUEST_CONFLICT" };
      return { ok: true, serverNow: now.toISOString(), run: runView(row, now) };
    }
    const reason = await refusal(ctx, row, open, now);
    if (reason) return { ok: false, reason };
    if (round !== row.round || row.results.length !== round - 1)
      return { ok: false, reason: "ROUND_NOT_READY" };
    if (now.getTime() - row.watchStartedAt.getTime() < COLOR_WATCH_MS)
      return { ok: false, reason: "TOO_EARLY" };
    const target = row.targets[round - 1];
    if (!target) throw new Error("Falta el objetivo de Color");
    const results = [
      ...row.results,
      { round, target, answer, requestId, accuracy: colorAccuracy(target, answer) },
    ];
    const finished = results.length === COLOR_ROUNDS;
    const average = finished
      ? Math.round((results.reduce((sum, item) => sum + item.accuracy, 0) / COLOR_ROUNDS) * 10) / 10
      : null;
    let points = 0;
    if (finished && average !== null) {
      const [credited] = await ctx.tx
        .select({ id: colorRun.id })
        .from(colorRun)
        .where(
          and(
            eq(colorRun.personId, actor.personId),
            eq(colorRun.day, row.day),
            isNotNull(colorRun.creditedAt),
          ),
        )
        .limit(1);
      points = credited ? 0 : colorReward(average);
    }
    const [saved] = await ctx.tx
      .update(colorRun)
      .set({
        results,
        ...(finished ? { status: "FINISHED", average, finishedAt: now } : {}),
        ...(points > 0 ? { creditedAt: now, creditedPoints: points } : {}),
      })
      .where(eq(colorRun.id, row.id))
      .returning();
    if (!saved) throw new Error("No se pudo guardar la respuesta de Color");
    if (points > 0)
      await creditGame(ctx, {
        game: "COLOR",
        runId: row.id,
        personId: actor.personId,
        termId: row.termId,
        points,
        reason: t("T-3540", { fecha: row.day, promedio: average?.toFixed(1) ?? "" }),
      });
    await ctx.audit({
      action: finished ? (points > 0 ? "color.credited" : "color.finished") : "color.answered",
      entityType: "color_run",
      entityId: row.id,
      after: { personId: row.personId, day: row.day, round, average, points },
    });
    return { ok: true, serverNow: now.toISOString(), run: runView(saved, now) };
  });
}

/** Exportación propia: sin objetivos futuros ni claves internas de idempotencia. */
export async function listColorRunsFor(personId: string): Promise<ColorRunView[]> {
  const rows = await getDb()
    .select()
    .from(colorRun)
    .where(eq(colorRun.personId, personId))
    .orderBy(desc(colorRun.day), desc(colorRun.createdAt));
  const now = new Date();
  return rows.map((row) => ({ ...runView(row, now), target: null, watchUntil: null }));
}
