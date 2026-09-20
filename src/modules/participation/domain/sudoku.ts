import { randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { getMembershipRef } from "@/modules/people";
import { findTermContaining, getTerm, lockOpenTermPoints } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { startOfTodayIn } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { logger } from "@/shared/log";
import { pointEntry, sudokuRun } from "../schema";
import { SUDOKU_DIFFICULTIES, SUDOKU_RULES_VERSION, sudokuReward } from "../sudoku-engine";
import type {
  SudokuDifficulty,
  SudokuResult,
  SudokuRunView,
  SudokuStartedView,
  SudokuStartResult,
  SudokuStatus,
  TodaySudoku,
} from "../sudoku-types";
import { dayKeyFor, GAMIFICATION_TIMEZONE } from "./gamification-pure";
import { generateSudoku } from "./sudoku-generator";

// Sudoku (ADR-078). Aquí no hay replay: un Sudoku lo resuelve cualquier programa, así que una lista
// de jugadas no probaría nada. El servidor genera el tablero desde una semilla que nunca sale de él,
// guarda la solución y al cerrar compara la cuadrícula enviada. Se puede jugar sin límite; el único
// parcial sobre `creditedAt` es lo que garantiza un solo crédito por día civil de Colombia.

type RunRow = typeof sudokuRun.$inferSelect;
type MemberActor = Actor & { personId: string };

const SEEDS_PER_REQUEST = 3;

const requestId = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/);
const runId = z.string().min(1).max(80);
const startSchema = z.object({
  requestId,
  difficulty: z.enum(SUDOKU_DIFFICULTIES),
  assisted: z.boolean(),
});
const finishSchema = z.object({
  runId,
  grid: z.string().regex(/^[1-9]{81}$/),
  requestId,
});
const abandonSchema = z.object({ runId });

function nextDayAt(now: Date): string {
  return new Date(startOfTodayIn(GAMIFICATION_TIMEZONE, now).getTime() + 86_400_000).toISOString();
}

async function eligible(personId: string, exec: Executor): Promise<boolean> {
  const membership = await getMembershipRef(personId, exec);
  return membership?.status === "ACTIVE" || membership?.status === "HONORARY";
}

/** Proyección explícita: ni la semilla, ni las dadas, ni la solución salen por aquí. */
function runView(row: RunRow, now: Date): SudokuRunView {
  const status: SudokuStatus =
    row.status === "IN_PROGRESS" && row.day !== dayKeyFor(now) ? "EXPIRED" : row.status;
  return {
    id: row.id,
    day: row.day,
    status,
    difficulty: row.difficulty,
    assisted: row.assisted,
    points: row.creditedPoints ?? 0,
  };
}

/**
 * El único lugar por donde puede salir la solución: solo en modo con ayudas, solo con la partida
 * abierta y solo si es de hoy. La semilla no viaja nunca: con ella se reproduce la solución.
 */
function startedView(row: RunRow, now: Date): SudokuStartedView {
  const view = runView(row, now);
  return {
    ...view,
    givens: row.givens,
    solution: row.assisted && view.status === "IN_PROGRESS" ? row.solution : null,
    rulesVersion: row.rulesVersion,
  };
}

/** Mantiene el FOR SHARE aun cuando el semestre ya cerró, para poder reconocer reintentos. */
async function lockTerm(ctx: CommandContext, termId: string): Promise<boolean> {
  try {
    await lockOpenTermPoints(ctx.tx, termId);
    return true;
  } catch (error) {
    if (error instanceof DomainError && (await getTerm(termId, ctx.tx))?.pointsClosedAt) {
      return false;
    }
    throw error;
  }
}

/** Serializa por persona: el crédito del día y la partida abierta se deciden de a uno. */
async function lockPerson(ctx: CommandContext, personId: string): Promise<void> {
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`sudoku:${personId}`}, 0))`,
  );
}

/** Hasta tres semillas por pedido. Medido (ADR-078): ninguna de 60.000 agotó sus 200 intentos. */
function newBoard(difficulty: SudokuDifficulty) {
  for (let round = 0; round < SEEDS_PER_REQUEST; round += 1) {
    const seed = randomBytes(8).toString("hex");
    const board = generateSudoku(seed, difficulty);
    if (board) {
      return { seed, givens: board.givens, solution: board.solution };
    }
  }
  logger.error({ difficulty, seeds: SEEDS_PER_REQUEST }, "sudoku.generator-exhausted");
  throw new Error("No se pudo generar un tablero de Sudoku");
}

/** Lectura sin crear partidas; el personId siempre lo resuelve el servidor desde la sesión. */
export async function getTodaySudoku(personId: string): Promise<TodaySudoku> {
  const now = new Date();
  const day = dayKeyFor(now);
  return getDb().transaction(
    async (db): Promise<TodaySudoku> => {
      const current = await findTermContaining(day, db);
      const allowed = await eligible(personId, db);
      const mine = await db
        .select()
        .from(sudokuRun)
        .where(eq(sudokuRun.personId, personId))
        .orderBy(desc(sudokuRun.createdAt));
      const open = mine.find((row) => row.status === "IN_PROGRESS" && row.day === day) ?? null;
      const credited = mine.find((row) => row.day === day && row.creditedAt !== null) ?? null;
      const solved: Record<SudokuDifficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
      for (const row of mine) {
        if (row.status === "SOLVED" && row.termId === current?.id) {
          solved[row.difficulty] += 1;
        }
      }
      return {
        day,
        nextAvailableAt: nextDayAt(now),
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
        solved,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function closeRun(
  ctx: CommandContext,
  row: RunRow,
  status: "EXPIRED" | "ABANDONED",
  now: Date,
): Promise<RunRow> {
  if (row.status !== "IN_PROGRESS") {
    return row;
  }
  await ctx.tx.update(sudokuRun).set({ status, finishedAt: now }).where(eq(sudokuRun.id, row.id));
  await ctx.audit({
    action: status === "EXPIRED" ? "sudoku.expired" : "sudoku.abandoned",
    entityType: "sudoku_run",
    entityId: row.id,
    after: { day: row.day, termId: row.termId, difficulty: row.difficulty, assisted: row.assisted },
  });
  return { ...row, status, finishedAt: now };
}

/**
 * Empieza un tablero con la dificultad y el modo pedidos. Con una partida abierta hoy devuelve esa
 * misma si coincide, y si no coincide la rechaza: devolver en silencio un Fácil a quien pidió Difícil
 * confunde. Un GET nunca reparte un tablero.
 */
export async function startSudokuAs(
  actor: MemberActor,
  input: unknown,
): Promise<SudokuStartResult> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  const { difficulty, assisted } = parsed.data;
  // Generar no toca la base, así que corre antes de tomar ningún lock. Con una partida abierta de
  // hoy no hace falta tablero: el comando devuelve esa o la rechaza.
  const [pending] = await getDb()
    .select({ day: sudokuRun.day })
    .from(sudokuRun)
    .where(and(eq(sudokuRun.personId, actor.personId), eq(sudokuRun.status, "IN_PROGRESS")))
    .limit(1);
  const generated = pending?.day === dayKeyFor(new Date()) ? null : newBoard(difficulty);

  return runCommand(actor, async (ctx) => {
    const day = dayKeyFor(new Date());
    const current = await findTermContaining(day, ctx.tx);
    if (!current) {
      return { ok: false, reason: "NO_TERM" };
    }
    const open = await lockTerm(ctx, current.id);
    await lockPerson(ctx, actor.personId);
    const now = new Date();
    if (dayKeyFor(now) !== day) {
      return { ok: false, reason: "EXPIRED" };
    }
    if (!(await eligible(actor.personId, ctx.tx))) {
      return { ok: false, reason: "NOT_ELIGIBLE" };
    }
    const [existing] = await ctx.tx
      .select()
      .from(sudokuRun)
      .where(and(eq(sudokuRun.personId, actor.personId), eq(sudokuRun.status, "IN_PROGRESS")))
      .limit(1)
      .for("update");
    if (existing?.day === day) {
      return existing.difficulty === difficulty && existing.assisted === assisted
        ? { ok: true, run: startedView(existing, now) }
        : { ok: false, reason: "OPEN_RUN" };
    }
    if (existing) {
      await closeRun(ctx, existing, "EXPIRED", now);
    }
    // Un `requestId` que ya abrió una partida cerrada no abre otra: chocaría con su único.
    const [replayed] = await ctx.tx
      .select({ id: sudokuRun.id })
      .from(sudokuRun)
      .where(
        and(
          eq(sudokuRun.personId, actor.personId),
          eq(sudokuRun.startRequestId, parsed.data.requestId),
        ),
      )
      .limit(1);
    if (replayed) {
      return { ok: false, reason: existing?.id === replayed.id ? "EXPIRED" : "FINISHED" };
    }
    if (!open) {
      return { ok: false, reason: "TERM_CLOSED" };
    }
    // La abierta que vio la lectura previa desapareció antes del lock: caso raro, se genera aquí.
    const board = generated ?? newBoard(difficulty);
    const [created] = await ctx.tx
      .insert(sudokuRun)
      .values({
        personId: actor.personId,
        termId: current.id,
        day,
        seed: board.seed,
        rulesVersion: SUDOKU_RULES_VERSION,
        difficulty,
        assisted,
        givens: board.givens,
        solution: board.solution,
        startRequestId: parsed.data.requestId,
      })
      .returning();
    if (!created) {
      throw new Error("No se pudo crear la partida de Sudoku");
    }
    await ctx.audit({
      action: "sudoku.started",
      entityType: "sudoku_run",
      entityId: created.id,
      // Ni la semilla ni la solución entran a la auditoría.
      after: { personId: actor.personId, day, termId: current.id, difficulty, assisted },
    });
    return { ok: true, run: startedView(created, now) };
  });
}

function creditReason(row: RunRow): string {
  const difficulty = tList("T-2681")[SUDOKU_DIFFICULTIES.indexOf(row.difficulty)] ?? "";
  const reasons = t("T-2712", { fecha: row.day, dificultad: difficulty }).split("·");
  return (reasons[row.assisted ? 1 : 0] ?? "").trim();
}

/**
 * Cierra la partida con la cuadrícula completa. El servidor la compara con la solución que guarda:
 * si no coincide, la partida sigue abierta y no se escribe nada. Acredita si la persona todavía no
 * acreditó hoy; resolver siempre alcanza el premio, así que el primer tablero resuelto es el del día.
 */
export async function finishSudokuAs(actor: MemberActor, input: unknown): Promise<SudokuResult> {
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  const { grid } = parsed.data;
  const db = getDb();
  const [stored] = await db
    .select()
    .from(sudokuRun)
    .where(and(eq(sudokuRun.id, parsed.data.runId), eq(sudokuRun.personId, actor.personId)))
    .limit(1);
  if (!stored) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  // La cuadrícula no se guarda porque es la solución: el mismo envío es el que la repite.
  if (stored.finishRequestId === parsed.data.requestId) {
    return grid === stored.solution
      ? { ok: true, run: runView(stored, new Date()) }
      : { ok: false, reason: "REQUEST_CONFLICT", run: runView(stored, new Date()) };
  }
  if (stored.status !== "IN_PROGRESS") {
    return { ok: false, reason: "FINISHED", run: runView(stored, new Date()) };
  }
  // Fuera de la transacción: la solución no cambia. Sin auditoría, y la partida sigue abierta.
  if (grid !== stored.solution) {
    return { ok: false, reason: "NOT_SOLVED", run: runView(stored, new Date()) };
  }

  return runCommand(actor, async (ctx) => {
    const now = new Date();
    const day = dayKeyFor(now);
    const open = await lockTerm(ctx, stored.termId);
    await lockPerson(ctx, actor.personId);
    const [row] = await ctx.tx
      .select()
      .from(sudokuRun)
      .where(and(eq(sudokuRun.id, stored.id), eq(sudokuRun.personId, actor.personId)))
      .limit(1)
      .for("update");
    if (!row) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (row.finishRequestId === parsed.data.requestId) {
      return { ok: true, run: runView(row, now) };
    }
    if (row.status !== "IN_PROGRESS") {
      return { ok: false, reason: "FINISHED", run: runView(row, now) };
    }
    // El mismo `requestId` ya cerró otra partida: chocaría con su único parcial.
    const [reused] = await ctx.tx
      .select({ id: sudokuRun.id })
      .from(sudokuRun)
      .where(
        and(
          eq(sudokuRun.personId, actor.personId),
          eq(sudokuRun.finishRequestId, parsed.data.requestId),
          ne(sudokuRun.id, row.id),
        ),
      )
      .limit(1);
    if (reused) {
      return { ok: false, reason: "REQUEST_CONFLICT", run: runView(row, now) };
    }
    const current = await findTermContaining(day, ctx.tx);
    const vigente =
      open && row.day === day && current?.id === row.termId && !current?.pointsClosedAt;
    if (!vigente || !(await eligible(actor.personId, ctx.tx))) {
      const expired = await closeRun(ctx, row, "EXPIRED", now);
      return {
        ok: false,
        reason: row.day === day ? (open ? "NOT_ELIGIBLE" : "TERM_CLOSED") : "EXPIRED",
        run: runView(expired, now),
      };
    }
    // Ya acreditada hoy: la partida se guarda resuelta igual, simplemente no acredita otra vez.
    const [creditedToday] = await ctx.tx
      .select({ id: sudokuRun.id })
      .from(sudokuRun)
      .where(
        and(
          eq(sudokuRun.personId, actor.personId),
          eq(sudokuRun.day, day),
          isNotNull(sudokuRun.creditedAt),
        ),
      )
      .limit(1);
    const points = creditedToday ? 0 : sudokuReward(row.difficulty, row.assisted);
    const [saved] = await ctx.tx
      .update(sudokuRun)
      .set({
        status: "SOLVED",
        finishedAt: now,
        finishRequestId: parsed.data.requestId,
        ...(points > 0 ? { creditedAt: now, creditedPoints: points } : {}),
      })
      .where(eq(sudokuRun.id, row.id))
      .returning();
    if (!saved) {
      throw new Error("No se pudo guardar la partida de Sudoku");
    }
    if (points > 0) {
      await ctx.tx.insert(pointEntry).values({
        personId: actor.personId,
        termId: row.termId,
        sudokuRunId: row.id,
        kind: "SUDOKU",
        points,
        reason: creditReason(row),
        createdById: actor.personId,
      });
      await ctx.emit({
        type: "sudoku.completed",
        payload: {
          personId: actor.personId,
          termId: row.termId,
          runId: row.id,
          day: row.day,
          difficulty: row.difficulty,
          assisted: row.assisted,
          points,
        },
      });
    }
    await ctx.audit({
      action: points > 0 ? "sudoku.credited" : "sudoku.solved",
      entityType: "sudoku_run",
      entityId: row.id,
      // Ni la semilla ni la solución entran a la auditoría.
      after: {
        personId: actor.personId,
        day: row.day,
        termId: row.termId,
        difficulty: row.difficulty,
        assisted: row.assisted,
        points,
      },
    });
    return { ok: true, run: runView(saved, now) };
  });
}

/**
 * Abandona la partida abierta. Hace falta un comando propio porque cerrar exige la solución: sin él,
 * con una sola abierta por persona, quien eligió Difícil quedaría atrapado hasta la medianoche. Es
 * idempotente por naturaleza, así que no lleva `requestId`.
 */
export async function abandonSudokuAs(actor: MemberActor, input: unknown): Promise<SudokuResult> {
  const parsed = abandonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  return runCommand(actor, async (ctx) => {
    await lockPerson(ctx, actor.personId);
    const now = new Date();
    const [row] = await ctx.tx
      .select()
      .from(sudokuRun)
      .where(and(eq(sudokuRun.id, parsed.data.runId), eq(sudokuRun.personId, actor.personId)))
      .limit(1)
      .for("update");
    if (!row) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (row.status === "SOLVED") {
      return { ok: false, reason: "FINISHED", run: runView(row, now) };
    }
    const closed = await closeRun(
      ctx,
      row,
      row.day === dayKeyFor(now) ? "ABANDONED" : "EXPIRED",
      now,
    );
    return { ok: true, run: runView(closed, now) };
  });
}

/** Historial propio para Mis datos: sin semillas, dadas ni soluciones. */
export async function listSudokuRunsFor(personId: string): Promise<SudokuRunView[]> {
  const now = new Date();
  const rows = await getDb()
    .select()
    .from(sudokuRun)
    .where(eq(sudokuRun.personId, personId))
    .orderBy(desc(sudokuRun.day), desc(sudokuRun.createdAt));
  return rows.map((row) => runView(row, now));
}
