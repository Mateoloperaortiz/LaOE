import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  finishGame2048As,
  finishSudokuAs,
  startGame2048As,
  startPanalAs,
  startSudokuAs,
  startWordleAs,
  submitPanalWordAs,
  submitWordleGuessAs,
} from "@/modules/participation";
import { dayKeyFor } from "@/modules/participation/domain/gamification-pure";
import { panalPuzzleForDay } from "@/modules/participation/domain/panal-dictionary";
import { WORDLE_ANSWERS } from "@/modules/participation/domain/wordle-dictionary";
import {
  applyGame2048Move,
  GAME2048_MAX_MOVES,
  game2048Reward,
  newGame2048,
} from "@/modules/participation/game2048-engine";
import type { Game2048Move, Game2048State } from "@/modules/participation/game2048-types";
import {
  game2048Run,
  panalGame,
  pointEntry,
  sudokuRun,
  wordleGame,
} from "@/modules/participation/schema";
import { t, tList } from "@/shared/copy";
import { seedMember } from "../factories";
import { truncateAll } from "./db";

// El ledger de los juegos (DT-026): la fila exacta que cada juego deja al acreditar, entera,
// por sus comandos públicos. Lo demás de un crédito ya tiene su prueba en el archivo de cada juego
// (`wordle.test.ts`, `game2048.test.ts`, `sudoku.test.ts`, `panal.test.ts`): el evento, la
// auditoría, el saldo y que no se acredite dos veces.

const db = () => getDb();
const TODAY = new Date("2026-09-24T15:00:00Z");
/** Las 23:59:59 del 23 en Colombia: el último día del Panal de premio único. */
const BEFORE_CHECKPOINTS = new Date("2026-09-24T04:59:59Z");
/** La semilla con la que `playOut` pasa el primer umbral de premio (la de `game2048.test.ts`). */
const SEED_OVER_THRESHOLD = "36e7e815ffd7e027";

type Entry = typeof pointEntry.$inferSelect;
type Own = Pick<Entry, "personId" | "termId" | "kind" | "points" | "reason"> &
  Partial<Pick<Entry, "wordleGameId" | "game2048RunId" | "sudokuRunId" | "panalGameId">> & {
    panalCheckpoint?: number;
  };

/**
 * La fila entera: lo que el juego dice, quien juega como autor y, en nulo, cada columna que no es
 * suya (la asistencia, el premio, la reversión, las partidas de los otros juegos y la meta).
 */
function entry(own: Own): Entry {
  return {
    id: expect.any(String),
    createdAt: expect.any(Date),
    checkInId: null,
    wordleGameId: null,
    game2048RunId: null,
    sudokuRunId: null,
    colorRunId: null,
    panalGameId: null,
    panalCheckpoint: null,
    rewardId: null,
    presenceBonusId: null,
    reversalOfId: null,
    legacyType: null,
    legacyId: null,
    createdById: own.personId,
    ...own,
  };
}

const entries = () => db().select().from(pointEntry).orderBy(asc(pointEntry.panalCheckpoint));

/** Juega de verdad con la heurística de `game2048.test.ts`: la lista es siempre la misma. */
function playOut(seed: string): { state: Game2048State; moves: string } {
  let state = newGame2048(seed);
  const moves: Game2048Move[] = [];
  while (!state.over && moves.length < GAME2048_MAX_MOVES) {
    let best: { move: Game2048Move; next: Game2048State; value: number } | null = null;
    for (const move of ["L", "U", "R", "D"] as const) {
      const next = applyGame2048Move(state, move);
      if (!next) continue;
      const value = next.board.filter((cell) => cell === 0).length * 100 + next.score;
      if (!best || value > best.value) best = { move, next, value };
    }
    if (!best) break;
    state = best.next;
    moves.push(best.move);
  }
  return { state, moves: moves.join("") };
}

/** Empieza el Panal de hoy, encuentra todas sus palabras y devuelve la partida guardada. */
async function completePanal(personId: string) {
  const started = await startPanalAs({ personId, ip: null }, dayKeyFor(new Date()));
  if (!started.ok) throw new Error(started.reason);
  for (const word of panalPuzzleForDay(started.game.day).words) {
    const result = await submitPanalWordAs(
      { personId, ip: null },
      { gameId: started.game.id, word },
    );
    expect(result).toMatchObject({ ok: true, added: true });
  }
  const [row] = await db().select().from(panalGame).where(eq(panalGame.id, started.game.id));
  if (!row) throw new Error("Partida de prueba ausente");
  return row;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

describe("lo que cada juego deja en el ledger", () => {
  it("el Wordle acertado al segundo intento deja una fila WORDLE ligada a su partida, con el premio de ese intento y el motivo T-1261", async () => {
    const personId = await seedMember("libro.wordle@eafit.edu.co");
    const started = await startWordleAs({ personId, ip: null });
    if (!started.ok) throw new Error(started.reason);
    const [game] = await db().select().from(wordleGame).where(eq(wordleGame.id, started.game.id));
    if (!game) throw new Error("Partida de prueba ausente");
    const wrong = WORDLE_ANSWERS.find((word) => word !== game.answer) ?? "";
    const submit = (guess: string, expectedAttempt: number) =>
      submitWordleGuessAs(
        { personId, ip: null },
        { gameId: game.id, guess, expectedAttempt, requestId: randomUUID() },
      );
    expect(await submit(wrong, 1)).toMatchObject({ ok: true, game: { status: "IN_PROGRESS" } });
    expect(await entries()).toEqual([]);
    expect(await submit(game.answer, 2)).toMatchObject({
      ok: true,
      game: { status: "WON", points: 5 },
    });

    expect(await entries()).toEqual([
      entry({
        personId,
        termId: game.termId,
        kind: "WORDLE",
        wordleGameId: game.id,
        points: 5,
        reason: t("T-1261", { fecha: game.day, intento: 2 }),
      }),
    ]);
  });

  it("el 2048 que pasa el umbral deja una fila GAME2048 ligada a su partida, con el premio del puntaje rejugado y el motivo T-2654", async () => {
    const personId = await seedMember("libro.g2048@eafit.edu.co");
    const started = await startGame2048As({ personId, ip: null }, { requestId: randomUUID() });
    if (!started.ok) throw new Error(started.reason);
    // El cierre rejuega con la semilla guardada: se le pone la fija para que acredite siempre.
    const [run] = await db()
      .update(game2048Run)
      .set({ seed: SEED_OVER_THRESHOLD })
      .where(eq(game2048Run.id, started.run.id))
      .returning();
    if (!run) throw new Error("Partida de prueba ausente");
    const { state, moves } = playOut(SEED_OVER_THRESHOLD);
    const points = game2048Reward(state.score);
    expect(points).toBeGreaterThan(0);
    expect(
      await finishGame2048As(
        { personId, ip: null },
        { runId: run.id, moves, requestId: randomUUID() },
      ),
    ).toMatchObject({ ok: true, run: { status: "FINISHED", score: state.score, points } });

    expect(await entries()).toEqual([
      entry({
        personId,
        termId: run.termId,
        kind: "GAME2048",
        game2048RunId: run.id,
        points,
        reason: t("T-2654", { fecha: run.day, puntaje: state.score }),
      }),
    ]);
  });

  it("el Sudoku difícil resuelto con ayudas deja una fila SUDOKU ligada a su partida, con la mitad del premio y la segunda mitad del motivo T-2712", async () => {
    const personId = await seedMember("libro.sudoku@eafit.edu.co");
    const started = await startSudokuAs(
      { personId, ip: null },
      { requestId: randomUUID(), difficulty: "HARD", assisted: true },
    );
    if (!started.ok) throw new Error(started.reason);
    const [run] = await db().select().from(sudokuRun).where(eq(sudokuRun.id, started.run.id));
    if (!run) throw new Error("Partida de prueba ausente");
    expect(
      await finishSudokuAs(
        { personId, ip: null },
        { runId: run.id, grid: run.solution, requestId: randomUUID() },
      ),
    ).toMatchObject({ ok: true, run: { status: "SOLVED", points: 3 } });

    // T-2712 trae los dos motivos separados por «·»: sin ayudas y con ayudas.
    const [, assisted = ""] = t("T-2712", {
      fecha: run.day,
      dificultad: tList("T-2681")[2],
    }).split("·");
    expect(await entries()).toEqual([
      entry({
        personId,
        termId: run.termId,
        kind: "SUDOKU",
        sudokuRunId: run.id,
        points: 3,
        reason: assisted.trim(),
      }),
    ]);
  });

  it("el Panal con metas deja una fila PANAL por meta, cada una con su número, sus puntos y el motivo T-3010 de esa meta", async () => {
    const personId = await seedMember("libro.panal@eafit.edu.co");
    const game = await completePanal(personId);

    const own = { personId, termId: game.termId, kind: "PANAL", panalGameId: game.id } as const;
    const reason = (meta: string) => t("T-3010", { fecha: game.day, meta });
    expect(await entries()).toEqual([
      entry({ ...own, panalCheckpoint: 1, points: 1, reason: reason(t("T-3002", { n: 5 })) }),
      entry({ ...own, panalCheckpoint: 2, points: 2, reason: reason(t("T-3002", { n: 10 })) }),
      entry({ ...own, panalCheckpoint: 3, points: 3, reason: reason(t("T-3003")) }),
    ]);
  });

  it("el Panal de antes de las metas deja una sola fila PANAL sin meta, con los seis puntos y el motivo T-2752", async () => {
    vi.setSystemTime(BEFORE_CHECKPOINTS);
    const personId = await seedMember("libro.panal.unico@eafit.edu.co");
    const game = await completePanal(personId);
    expect(game.day).toBe("2026-09-23");

    expect(await entries()).toEqual([
      entry({
        personId,
        termId: game.termId,
        kind: "PANAL",
        panalGameId: game.id,
        points: 6,
        reason: t("T-2752", { fecha: game.day }),
      }),
    ]);
  });
});
