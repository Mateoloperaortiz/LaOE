import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, type Tx } from "@/db/tx";
import {
  abandonSudokuAs,
  finishGame2048As,
  finishSudokuAs,
  startGame2048As,
  startPanalAs,
  startSudokuAs,
  startWordleAs,
  submitPanalWordAs,
  submitWordleGuessAs,
} from "@/modules/participation";
import {
  type DailyGameRules,
  startDailyGame,
} from "@/modules/participation/domain/daily-game-guard";
import { dayKeyFor } from "@/modules/participation/domain/gamification-pure";
import { panalPuzzleForDay } from "@/modules/participation/domain/panal-dictionary";
import { WORDLE_ANSWERS } from "@/modules/participation/domain/wordle-dictionary";
import { applyGame2048Move, newGame2048 } from "@/modules/participation/game2048-engine";
import type { Game2048Move } from "@/modules/participation/game2048-types";
import {
  game2048Run,
  panalGame,
  pointEntry,
  sudokuRun,
  wordleGame,
} from "@/modules/participation/schema";
import { membership } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { holdTransaction, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";
import { seedMember, seedMembership, seedPerson, seedTerm } from "./factories";

// La guardia de la partida diaria (DT-009): lo que cada juego responde al empezar y al seguir según
// el día, el término, su cierre y la elegibilidad. La matriz fija la conducta de los cuatro juegos
// por sus comandos públicos; lo que no es igual entre ellos lleva su valor por juego y nombra la
// decisión abierta que lo espera.

const db = () => getDb();
const TODAY = new Date("2026-09-24T15:00:00Z");
const TOMORROW = new Date("2026-09-25T15:00:00Z");
const YESTERDAY_KEY = "2026-09-23";

type Reason = "NO_TERM" | "EXPIRED" | "NOT_ELIGIBLE" | "TERM_CLOSED";

/** Lo que una pantalla recibe, reducido a lo que la guardia decide. */
interface Answer {
  ok: boolean;
  reason: string | null;
  id: string | null;
  status: string | null;
}

interface Saved {
  id: string;
  day: string;
  termId: string;
  status: string | null;
}

interface Game {
  name: string;
  start: (personId: string) => Promise<Answer>;
  /** Una jugada que hoy se aceptaría: un intento, una palabra o el cierre de la partida. */
  move: (personId: string, id: string) => Promise<Answer>;
  saved: () => Promise<Saved[]>;
  expected: {
    /** El estado con que queda una jugada aceptada. */
    accepted: string | null;
    /** Empezar con el semestre cerrado y una partida de hoy guardada (decisión abierta 49). */
    startClosedWithSaved: Partial<Answer>;
    /** Empezar con el semestre cerrado y una partida abierta de ayer: cómo queda esa partida. */
    startClosedLeavesYesterday: string | null;
    /** Cómo queda la partida guardada después de cada rechazo al seguir. */
    refusalLeaves: Record<Exclude<Reason, "NO_TERM">, string | null>;
    /** Día vencido y semestre cerrado a la vez (decisión abierta 50). */
    expiredAndClosed: Exclude<Reason, "NO_TERM">;
    /** Hoy cae en otro término, o en ninguno, con los puntos abiertos (decisión abierta 50). */
    movedTerm: Exclude<Reason, "NO_TERM">;
    /** El día cambia mientras la jugada espera el término (decisión abierta 50). */
    acrossMidnight: Partial<Answer>;
    creditsAcrossMidnight: number;
  };
}

function answer(raw: unknown): Answer {
  const result = raw as {
    ok: boolean;
    reason?: string;
    game?: { id: string; status?: string };
    run?: { id: string; status?: string };
  };
  const view = result.game ?? result.run ?? null;
  return {
    ok: result.ok,
    reason: result.ok ? null : (result.reason ?? null),
    id: view?.id ?? null,
    status: view?.status ?? null,
  };
}

/** Una lista corta de movimientos válidos: se queda bajo el primer umbral y no acredita. */
function movesFor(seed: string): string {
  let state = newGame2048(seed);
  const moves: Game2048Move[] = [];
  while (moves.length < 12) {
    const next = (["L", "U", "R", "D"] as const)
      .map((move) => ({ move, state: applyGame2048Move(state, move) }))
      .find((option) => option.state);
    if (!next?.state) break;
    state = next.state;
    moves.push(next.move);
  }
  return moves.join("");
}

const wordle: Game = {
  name: "el Wordle",
  start: async (personId) => answer(await startWordleAs({ personId })),
  move: async (personId, id) => {
    const [row] = await db()
      .select({ answer: wordleGame.answer })
      .from(wordleGame)
      .where(eq(wordleGame.id, id));
    const guess = WORDLE_ANSWERS.find((word) => word !== row?.answer) ?? "";
    return answer(
      await submitWordleGuessAs(
        { personId },
        { gameId: id, guess, expectedAttempt: 1, requestId: randomUUID() },
      ),
    );
  },
  saved: () =>
    db()
      .select({
        id: wordleGame.id,
        day: wordleGame.day,
        termId: wordleGame.termId,
        status: wordleGame.status,
      })
      .from(wordleGame),
  expected: {
    accepted: "IN_PROGRESS",
    startClosedWithSaved: { ok: true, status: "EXPIRED" },
    startClosedLeavesYesterday: "IN_PROGRESS",
    refusalLeaves: { EXPIRED: "EXPIRED", TERM_CLOSED: "EXPIRED", NOT_ELIGIBLE: "IN_PROGRESS" },
    expiredAndClosed: "TERM_CLOSED",
    movedTerm: "EXPIRED",
    acrossMidnight: { ok: false, reason: "EXPIRED", status: "EXPIRED" },
    creditsAcrossMidnight: 0,
  },
};

const game2048: Game = {
  name: "el 2048",
  start: async (personId) =>
    answer(await startGame2048As({ personId }, { requestId: randomUUID() })),
  move: async (personId, id) => {
    const [row] = await db()
      .select({ seed: game2048Run.seed })
      .from(game2048Run)
      .where(eq(game2048Run.id, id));
    return answer(
      await finishGame2048As(
        { personId },
        { runId: id, moves: movesFor(row?.seed ?? ""), requestId: randomUUID() },
      ),
    );
  },
  saved: () =>
    db()
      .select({
        id: game2048Run.id,
        day: game2048Run.day,
        termId: game2048Run.termId,
        status: game2048Run.status,
      })
      .from(game2048Run),
  expected: {
    accepted: "FINISHED",
    startClosedWithSaved: { ok: true, status: "IN_PROGRESS" },
    startClosedLeavesYesterday: "EXPIRED",
    refusalLeaves: { EXPIRED: "EXPIRED", TERM_CLOSED: "EXPIRED", NOT_ELIGIBLE: "EXPIRED" },
    expiredAndClosed: "EXPIRED",
    movedTerm: "NOT_ELIGIBLE",
    acrossMidnight: { ok: true, status: "FINISHED" },
    creditsAcrossMidnight: 0,
  },
};

const sudoku: Game = {
  name: "el Sudoku",
  start: async (personId) =>
    answer(
      await startSudokuAs(
        { personId },
        { requestId: randomUUID(), difficulty: "EASY", assisted: false },
      ),
    ),
  move: async (personId, id) => {
    const [row] = await db()
      .select({ solution: sudokuRun.solution })
      .from(sudokuRun)
      .where(eq(sudokuRun.id, id));
    return answer(
      await finishSudokuAs(
        { personId },
        { runId: id, grid: row?.solution ?? "", requestId: randomUUID() },
      ),
    );
  },
  saved: () =>
    db()
      .select({
        id: sudokuRun.id,
        day: sudokuRun.day,
        termId: sudokuRun.termId,
        status: sudokuRun.status,
      })
      .from(sudokuRun),
  expected: {
    accepted: "SOLVED",
    startClosedWithSaved: { ok: true, status: "IN_PROGRESS" },
    startClosedLeavesYesterday: "EXPIRED",
    refusalLeaves: { EXPIRED: "EXPIRED", TERM_CLOSED: "EXPIRED", NOT_ELIGIBLE: "EXPIRED" },
    expiredAndClosed: "EXPIRED",
    movedTerm: "NOT_ELIGIBLE",
    acrossMidnight: { ok: true, status: "SOLVED" },
    creditsAcrossMidnight: 1,
  },
};

const panal: Game = {
  name: "el Panal",
  start: async (personId) => answer(await startPanalAs({ personId }, dayKeyFor(new Date()))),
  move: async (personId, id) => {
    const [row] = await db()
      .select({ day: panalGame.day })
      .from(panalGame)
      .where(eq(panalGame.id, id));
    const word = panalPuzzleForDay(row?.day ?? "").words[0] ?? "";
    return answer(await submitPanalWordAs({ personId }, { gameId: id, word }));
  },
  saved: async () =>
    (
      await db()
        .select({ id: panalGame.id, day: panalGame.day, termId: panalGame.termId })
        .from(panalGame)
    ).map((row) => ({ ...row, status: null })),
  expected: {
    accepted: null,
    startClosedWithSaved: { ok: false, reason: "TERM_CLOSED", id: null },
    startClosedLeavesYesterday: null,
    refusalLeaves: { EXPIRED: null, TERM_CLOSED: null, NOT_ELIGIBLE: null },
    expiredAndClosed: "EXPIRED",
    movedTerm: "TERM_CLOSED",
    acrossMidnight: { ok: false, reason: "EXPIRED" },
    creditsAcrossMidnight: 0,
  },
};

const refused = (reason: Reason): Answer => ({ ok: false, reason, id: null, status: null });
const closePoints = () => db().update(term).set({ pointsClosedAt: new Date() });

async function onLeave(email: string): Promise<string> {
  const personId = await seedPerson(email);
  await seedMembership(personId, await seedTerm(), "ON_LEAVE");
  return personId;
}

async function started(game: Game, personId: string): Promise<string> {
  const result = await game.start(personId);
  if (!result.ok || !result.id) throw new Error(`No empezó: ${result.reason}`);
  return result.id;
}

/**
 * Deja el comando esperando el término, cambia el día y lo suelta: el reloj que el comando lea antes
 * del candado y el que lea después caen en días distintos, sin esperar a ninguna medianoche.
 */
async function acrossMidnight(command: () => Promise<Answer>): Promise<Answer> {
  const held = await holdTransaction((tx) => tx.select().from(term).for("update"));
  const pending = command();
  void pending.catch(() => undefined);
  try {
    for (let tries = 0; (await waitingOn(held.pid)) < 1; tries += 1) {
      if (tries > 1000) throw new Error("El comando nunca llegó a esperar el término");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    vi.setSystemTime(TOMORROW);
  } finally {
    held.release();
    await held.done;
  }
  return pending;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

describe.each([wordle, game2048, sudoku, panal])("la guardia al empezar $name", (game) => {
  it("sin un término que contenga hoy responde NO_TERM, antes de mirar la elegibilidad", async () => {
    const personId = await seedPerson("guardia.sintermino@eafit.edu.co");
    expect(await game.start(personId)).toEqual(refused("NO_TERM"));
    expect(await game.saved()).toEqual([]);
  });

  it("si el día cambia mientras espera el término responde EXPIRED, antes de mirar la elegibilidad y el cierre", async () => {
    const personId = await onLeave("guardia.medianoche@eafit.edu.co");
    await closePoints();
    expect(await acrossMidnight(() => game.start(personId))).toEqual(refused("EXPIRED"));
    expect(await game.saved()).toEqual([]);
  });

  it("quien no es activo ni honorario recibe NOT_ELIGIBLE, también con el semestre cerrado, y un honorario sí empieza", async () => {
    const personId = await onLeave("guardia.licencia@eafit.edu.co");
    expect(await game.start(personId)).toEqual(refused("NOT_ELIGIBLE"));
    const honorary = await seedPerson("guardia.honoraria@eafit.edu.co");
    await seedMembership(honorary, await seedTerm(), "HONORARY");
    expect(await game.start(honorary)).toMatchObject({ ok: true });
    await closePoints();
    expect(await game.start(personId)).toEqual(refused("NOT_ELIGIBLE"));
    expect(await game.saved()).toHaveLength(1);
  });

  it("con el semestre cerrado y sin partida guardada responde TERM_CLOSED y no crea nada", async () => {
    const personId = await seedMember("guardia.cerrado@eafit.edu.co");
    await closePoints();
    expect(await game.start(personId)).toEqual(refused("TERM_CLOSED"));
    expect(await game.saved()).toEqual([]);
  });

  it("con el semestre cerrado y una partida de hoy guardada responde lo de cada juego (decisión abierta 49)", async () => {
    const personId = await seedMember("guardia.cerrado-guardada@eafit.edu.co");
    const id = await started(game, personId);
    const before = await game.saved();
    await closePoints();
    const again = await game.start(personId);
    expect(again).toMatchObject(game.expected.startClosedWithSaved);
    if (again.ok) expect(again.id).toBe(id);
    // Ningún juego escribe la partida al responder: el Wordle la muestra vencida sin vencerla.
    expect(await game.saved()).toEqual(before);
  });

  it("con el semestre cerrado responde TERM_CLOSED aunque quede abierta la partida de ayer, que queda como cada juego la deja", async () => {
    const personId = await seedMember("guardia.cerrado-ayer@eafit.edu.co");
    const id = await started(game, personId);
    vi.setSystemTime(TOMORROW);
    await closePoints();
    expect(await game.start(personId)).toEqual(refused("TERM_CLOSED"));
    expect(await game.saved()).toMatchObject([
      { id, status: game.expected.startClosedLeavesYesterday },
    ]);
  });

  it("con una partida de hoy devuelve esa misma y no crea otra", async () => {
    const personId = await seedMember("guardia.repetida@eafit.edu.co");
    const id = await started(game, personId);
    expect(await game.start(personId)).toMatchObject({ ok: true, id });
    expect(await game.saved()).toHaveLength(1);
  });
});

describe.each([wordle, game2048, sudoku, panal])("la guardia al seguir $name", (game) => {
  async function refusal(personId: string, id: string, reason: Exclude<Reason, "NO_TERM">) {
    const status = game.expected.refusalLeaves[reason];
    expect(await game.move(personId, id)).toEqual({ ok: false, reason, id, status });
    expect(await game.saved()).toMatchObject([{ id, status }]);
    expect(await db().select().from(pointEntry)).toHaveLength(0);
  }

  it("una jugada de hoy, con el semestre abierto y de alguien elegible, se acepta", async () => {
    const personId = await seedMember("guardia.acepta@eafit.edu.co");
    const id = await started(game, personId);
    expect(await game.move(personId, id)).toEqual({
      ok: true,
      reason: null,
      id,
      status: game.expected.accepted,
    });
  });

  it("con el día vencido responde EXPIRED", async () => {
    const personId = await seedMember("guardia.vencida@eafit.edu.co");
    const id = await started(game, personId);
    vi.setSystemTime(TOMORROW);
    await refusal(personId, id, "EXPIRED");
  });

  it("con el semestre cerrado responde TERM_CLOSED", async () => {
    const personId = await seedMember("guardia.sigue-cerrado@eafit.edu.co");
    const id = await started(game, personId);
    await closePoints();
    await refusal(personId, id, "TERM_CLOSED");
  });

  it("quien dejó de ser elegible recibe NOT_ELIGIBLE", async () => {
    const personId = await seedMember("guardia.sale@eafit.edu.co");
    const id = await started(game, personId);
    await db().update(membership).set({ status: "ON_LEAVE" });
    await refusal(personId, id, "NOT_ELIGIBLE");
  });

  it("con el día vencido y el semestre cerrado a la vez gana la razón de cada juego (decisión abierta 50)", async () => {
    const personId = await seedMember("guardia.vencida-cerrada@eafit.edu.co");
    const id = await started(game, personId);
    vi.setSystemTime(TOMORROW);
    await closePoints();
    await refusal(personId, id, game.expected.expiredAndClosed);
  });

  it("si hoy ya no cae en el término de la partida, con los puntos abiertos, responde la razón de cada juego (decisión abierta 50)", async () => {
    const personId = await seedMember("guardia.termino-corrido@eafit.edu.co");
    const id = await started(game, personId);
    await db().update(term).set({ endsOn: YESTERDAY_KEY });
    await refusal(personId, id, game.expected.movedTerm);
  });

  it("si el día cambia mientras la jugada espera el término, vale el reloj de cada juego (decisión abierta 50)", async () => {
    const personId = await seedMember("guardia.sigue-medianoche@eafit.edu.co");
    const id = await started(game, personId);
    expect(await acrossMidnight(() => game.move(personId, id))).toMatchObject({
      ...game.expected.acrossMidnight,
      id,
    });
    expect(await db().select().from(pointEntry)).toHaveLength(game.expected.creditsAcrossMidnight);
  });
});

describe("lo propio de un juego en la guardia", () => {
  it("abandonar un Sudoku no mira el semestre ni la elegibilidad", async () => {
    const personId = await seedMember("guardia.abandona@eafit.edu.co");
    const id = await started(sudoku, personId);
    await closePoints();
    await db().update(membership).set({ status: "ON_LEAVE" });
    expect(answer(await abandonSudokuAs({ personId }, { runId: id }))).toEqual({
      ok: true,
      reason: null,
      id,
      status: "ABANDONED",
    });
  });

  it("el Panal responde EXPIRED al día que la pantalla manda y no es hoy, después de NO_TERM y antes de la elegibilidad y el cierre", async () => {
    const stranger = await seedPerson("guardia.panal-sintermino@eafit.edu.co");
    expect(answer(await startPanalAs({ personId: stranger }, YESTERDAY_KEY))).toEqual(
      refused("NO_TERM"),
    );
    const personId = await onLeave("guardia.panal-ayer@eafit.edu.co");
    await closePoints();
    expect(answer(await startPanalAs({ personId }, YESTERDAY_KEY))).toEqual(refused("EXPIRED"));
    expect(await panal.saved()).toEqual([]);
  });

  it("el Panal no crea una partida de mañana con el término de hoy cuando el día cambia mientras espera (ADR-119 regla 7)", async () => {
    const personId = await seedMember("guardia.panal-termino@eafit.edu.co");
    // El término termina hoy: mañana ya no lo contiene.
    await db()
      .update(term)
      .set({ endsOn: dayKeyFor(TODAY) });
    const tomorrow = dayKeyFor(TOMORROW);
    expect(
      await acrossMidnight(async () => answer(await startPanalAs({ personId }, tomorrow))),
    ).toEqual(refused("EXPIRED"));
    expect(await panal.saved()).toEqual([]);
  });
});

/** Retiene lo que `take` tome, lanza el comando y, cuando ya hace cola, mira `during` antes de soltar. */
async function whileHeld(
  take: (tx: Tx) => Promise<unknown>,
  command: () => Promise<Answer>,
  during: () => Promise<boolean>,
): Promise<{ seen: boolean; result: Answer }> {
  const held = await holdTransaction(take);
  const pending = command();
  void pending.catch(() => undefined);
  try {
    for (let tries = 0; (await waitingOn(held.pid)) < 1; tries += 1) {
      if (tries > 1000) throw new Error("El comando nunca llegó a hacer cola");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const seen = await during();
    held.release();
    return { seen, result: await pending };
  } finally {
    held.release();
    await held.done;
  }
}

const termRow = (tx: Tx) => tx.select().from(term).for("update");
const advisory = (key: string) => sql`hashtextextended(${key}, 0)`;

/** ¿Alguien tiene tomado el término? Un `for update nowait` falla si otro lo comparte. */
const termIsTaken = () =>
  getDb()
    .transaction((tx) => tx.select({ id: term.id }).from(term).for("update", { noWait: true }))
    .then(
      () => false,
      () => true,
    );

/** ¿Está libre el candado propio? Lo toma y lo suelta en su propia transacción. */
const ownLockIsFree = (key: string) =>
  getDb().transaction(async (tx) => {
    const result = await tx.execute<{ free: boolean }>(
      sql`select pg_try_advisory_xact_lock(${advisory(key)}) as free`,
    );
    return result.rows[0]?.free === true;
  });

describe.each([
  { name: wordle.name, game: wordle, key: () => `wordle-day:${dayKeyFor(TODAY)}`, onMove: false },
  { name: game2048.name, game: game2048, key: (id: string) => `game2048:${id}`, onMove: true },
  { name: sudoku.name, game: sudoku, key: (id: string) => `sudoku:${id}`, onMove: true },
  { name: panal.name, game: panal, key: (id: string) => `panal:${id}`, onMove: true },
])("el orden de candados de $name", ({ game, key, onMove }) => {
  const ownLock = (personId: string) => (tx: Tx) =>
    tx.execute(sql`select pg_advisory_xact_lock(${advisory(key(personId))})`);

  it("al empezar toma el término y después su candado propio", async () => {
    const personId = await seedMember("guardia.orden@eafit.edu.co");
    // Mientras espera el término todavía no tiene el propio…
    expect(
      await whileHeld(
        termRow,
        () => game.start(personId),
        () => ownLockIsFree(key(personId)),
      ),
    ).toMatchObject({ seen: true, result: { ok: true } });
    // …y mientras espera el propio ya tiene el término.
    expect(
      await whileHeld(ownLock(personId), () => game.start(personId), termIsTaken),
    ).toMatchObject({ seen: true, result: { ok: true } });
  });

  // La variante que no le toca a un juego no se registra: la compuerta del CI no admite casos saltados.
  if (onMove) {
    it("al seguir toma el término y después su candado propio", async () => {
      const first = await seedMember("guardia.orden-sigue@eafit.edu.co");
      const firstId = await started(game, first);
      expect(
        await whileHeld(
          termRow,
          () => game.move(first, firstId),
          () => ownLockIsFree(key(first)),
        ),
      ).toMatchObject({ seen: true, result: { ok: true } });
      const second = await seedMember("guardia.orden-sigue-2@eafit.edu.co");
      const secondId = await started(game, second);
      expect(
        await whileHeld(ownLock(second), () => game.move(second, secondId), termIsTaken),
      ).toMatchObject({ seen: true, result: { ok: true } });
    });
  } else {
    it("al seguir toma el término y ningún candado propio: el del día solo reparte respuestas", async () => {
      const personId = await seedMember("guardia.orden-wordle@eafit.edu.co");
      const id = await started(game, personId);
      // Con el candado del día retenido por otro, la jugada no hace cola: si lo tomara, no volvería.
      const day = await holdTransaction(ownLock(personId));
      try {
        expect(await game.move(personId, id)).toMatchObject({ ok: true, id });
      } finally {
        day.release();
        await day.done;
      }
    });
  }
});

describe("la guardia con el reloj inyectado", () => {
  const RULES: DailyGameRules = {
    lock: { key: "panal", per: "PERSON" },
    startWhenClosed: "SAVED_FIRST",
    expiredAndClosed: "EXPIRED",
    movedTerm: "EXPIRED",
  };

  it("responde EXPIRED cuando el reloj cambia de día entre sus dos lecturas, sin retener ningún candado", async () => {
    const personId = await seedMember("guardia.reloj@eafit.edu.co");
    const ticks = [TODAY, TOMORROW];
    const result = await runCommand({ personId }, (ctx) =>
      startDailyGame(ctx, RULES, {
        personId,
        now: () => ticks.shift() ?? TOMORROW,
        expectedDay: null,
      }),
    );
    expect(result).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("con el semestre cerrado sigue con los puntos cerrados o responde TERM_CLOSED, según lo que el juego declare", async () => {
    const personId = await seedMember("guardia.reloj-cerrado@eafit.edu.co");
    await closePoints();
    const later = new Date(TODAY.getTime() + 1000);
    const ticks = [TODAY];
    const start = (startWhenClosed: DailyGameRules["startWhenClosed"]) =>
      runCommand({ personId }, (ctx) =>
        startDailyGame(
          ctx,
          { ...RULES, startWhenClosed },
          { personId, now: () => ticks.shift() ?? later, expectedDay: null },
        ),
      );
    // El instante que entrega es el que leyó con los candados tomados.
    expect(await start("SAVED_FIRST")).toMatchObject({
      ok: true,
      day: dayKeyFor(TODAY),
      open: false,
      now: later,
    });
    expect(await start("REFUSE")).toEqual({ ok: false, reason: "TERM_CLOSED" });
  });
});
