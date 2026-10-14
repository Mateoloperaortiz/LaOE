import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isCheckViolation, isUniqueViolation } from "@/db/errors";
import { message } from "@/modules/comms/schema";
import { interaction } from "@/modules/crm/schema";
import { dayKeyFor } from "@/modules/participation/domain/gamification-pure";
import { balanceFor } from "@/modules/participation/domain/ledger";
import {
  abandonSudokuAs,
  finishSudokuAs,
  getTodaySudoku,
  listSudokuRunsFor,
  startSudokuAs,
} from "@/modules/participation/domain/sudoku";
import { countSolutions, logicSolve } from "@/modules/participation/domain/sudoku-generator";
import { pointEntry, sudokuRun } from "@/modules/participation/schema";
import {
  respectsGivens,
  SUDOKU_DIFFICULTIES,
  SUDOKU_RULES_VERSION,
  sudokuReward,
} from "@/modules/participation/sudoku-engine";
import type { SudokuDifficulty } from "@/modules/participation/sudoku-types";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { seedMember, seedMembership, seedPerson, seedTerm } from "../factories";
import { itemPattern } from "../helpers/copy";
import { heldThenSettled, holdTransaction } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

const db = () => getDb();

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */

interface Options {
  difficulty?: SudokuDifficulty;
  assisted?: boolean;
}

async function openRun(personId: string, { difficulty = "EASY", assisted = false }: Options = {}) {
  const result = await startSudokuAs(
    { personId, ip: null },
    { requestId: randomUUID(), difficulty, assisted },
  );
  if (!result.ok) throw new Error(result.reason);
  return result.run;
}

async function rowOf(runId: string) {
  const [row] = await db().select().from(sudokuRun).where(eq(sudokuRun.id, runId));
  if (!row) throw new Error("Partida de prueba ausente");
  return row;
}

/**
 * Una partida de punta a punta. La prueba lee la solución de la fila —lo único que la conoce—, así
 * que ningún crédito depende de la suerte ni de un solver propio de la prueba.
 */
async function solveAndFinish(personId: string, options: Options = {}) {
  const run = await openRun(personId, options);
  const { solution } = await rowOf(run.id);
  const requestId = randomUUID();
  const result = await finishSudokuAs(
    { personId, ip: null },
    { runId: run.id, grid: solution, requestId },
  );
  return { run, solution, result, requestId };
}

/** Una cuadrícula completa que no es la solución: cambia la primera casilla. */
function wrong(solution: string): string {
  return (solution[0] === "1" ? "2" : "1") + solution.slice(1);
}

describe("Sudoku con la solución en el servidor", () => {
  beforeEach(truncateAll);
  afterEach(() => vi.useRealTimers());
  afterAll(() => closeDb());

  it("leer no crea partidas y el tablero repartido es coherente con lo que guarda la base", async () => {
    const personId = await seedMember("sudoku.lectura@eafit.edu.co");
    expect(await getTodaySudoku(personId)).toMatchObject({
      availability: "AVAILABLE",
      open: null,
      credited: null,
      solved: { EASY: 0, MEDIUM: 0, HARD: 0 },
      day: dayKeyFor(new Date()),
    });
    expect(await db().select().from(sudokuRun)).toHaveLength(0);

    const run = await openRun(personId, { difficulty: "HARD" });
    const fila = await rowOf(run.id);
    expect(run).toMatchObject({
      status: "IN_PROGRESS",
      difficulty: "HARD",
      assisted: false,
      points: 0,
      givens: fila.givens,
      rulesVersion: SUDOKU_RULES_VERSION,
    });
    expect(fila.seed).toMatch(/^[0-9a-f]{16}$/);
    // La base no verifica que las dadas salgan de la solución: lo comprueba esta prueba.
    expect(respectsGivens(fila.solution, fila.givens)).toBe(true);
    expect(countSolutions(fila.givens, 2)).toBe(1);
    expect(logicSolve(fila.givens, 3)).toMatchObject({ solved: true, maxTierUsed: 3 });
    expect((await getTodaySudoku(personId)).open?.id).toBe(run.id);
  });

  it("sin ayudas la solución no viaja en ninguna respuesta, y la semilla nunca", async () => {
    const personId = await seedMember("sudoku.privada@eafit.edu.co");
    const requestId = randomUUID();
    const inicio = await startSudokuAs(
      { personId, ip: null },
      { requestId, difficulty: "MEDIUM", assisted: false },
    );
    if (!inicio.ok) throw new Error(inicio.reason);
    const fila = await rowOf(inicio.run.id);
    const repetido = await startSudokuAs(
      { personId, ip: null },
      { requestId, difficulty: "MEDIUM", assisted: false },
    );
    const lectura = await getTodaySudoku(personId);
    const fallido = await finishSudokuAs(
      { personId, ip: null },
      { runId: inicio.run.id, grid: wrong(fila.solution), requestId: randomUUID() },
    );
    const cierre = await finishSudokuAs(
      { personId, ip: null },
      { runId: inicio.run.id, grid: fila.solution, requestId: randomUUID() },
    );
    expect(cierre.ok).toBe(true);
    const respuestas = JSON.stringify([
      inicio,
      repetido,
      lectura,
      fallido,
      cierre,
      await getTodaySudoku(personId),
      await listSudokuRunsFor(personId),
    ]);
    expect(inicio.run.solution).toBeNull();
    expect(respuestas).not.toContain(fila.solution);
    expect(respuestas).not.toContain(fila.seed);
  });

  it("con ayudas la solución viaja solo a su dueño y solo con la partida abierta", async () => {
    const personId = await seedMember("sudoku.ayudas@eafit.edu.co");
    const run = await openRun(personId, { assisted: true });
    const fila = await rowOf(run.id);
    expect(run.solution).toBe(fila.solution);
    expect((await getTodaySudoku(personId)).open?.solution).toBe(fila.solution);
    expect(JSON.stringify(run)).not.toContain(fila.seed);

    const cierre = await finishSudokuAs(
      { personId, ip: null },
      { runId: run.id, grid: fila.solution, requestId: randomUUID() },
    );
    // Cerrada la partida, ninguna lectura vuelve a traer la solución ni las dadas.
    const despues = JSON.stringify([
      cierre,
      await getTodaySudoku(personId),
      await listSudokuRunsFor(personId),
    ]);
    expect(despues).not.toContain(fila.solution);
    expect(despues).not.toContain(fila.givens);
    expect(despues).not.toContain(fila.seed);
  });

  it("ni la semilla ni la solución entran a la auditoría ni a los eventos", async () => {
    const personId = await seedMember("sudoku.auditoria@eafit.edu.co");
    const { run, result } = await solveAndFinish(personId, { assisted: true });
    expect(result.ok).toBe(true);
    const fila = await rowOf(run.id);
    const rastro = JSON.stringify([
      await db().select().from(auditLog),
      await db().select().from(outbox),
    ]);
    expect(rastro).not.toContain(fila.seed);
    expect(rastro).not.toContain(fila.solution);
    expect(rastro).not.toContain(fila.givens);
    const acciones = (await db().select().from(auditLog)).map((row) => row.action);
    expect(acciones).toEqual(expect.arrayContaining(["sudoku.started", "sudoku.credited"]));
  });

  it.each(
    SUDOKU_DIFFICULTIES.flatMap((difficulty) => [
      { difficulty, assisted: false },
      { difficulty, assisted: true },
    ]),
  )("acredita el premio de $difficulty con ayudas=$assisted", async ({ difficulty, assisted }) => {
    const personId = await seedMember(
      `sudoku.${difficulty}.${assisted}@eafit.edu.co`.toLowerCase(),
    );
    const { run, result } = await solveAndFinish(personId, { difficulty, assisted });
    if (!result.ok) throw new Error(result.reason);
    const esperado = sudokuReward(difficulty, assisted);
    expect(result.run).toMatchObject({ status: "SOLVED", difficulty, assisted, points: esperado });

    const entries = await db().select().from(pointEntry);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "SUDOKU", sudokuRunId: run.id, points: esperado });
    expect(entries[0]?.reason).toMatch(itemPattern(tList("T-2712")[assisted ? 1 : 0]));
    expect(entries[0]?.reason).not.toMatch(itemPattern(tList("T-2712")[assisted ? 0 : 1]));
    expect(entries[0]?.reason).not.toContain("·");
    expect(await balanceFor(personId, entries[0]?.termId ?? "")).toBe(esperado);

    const fila = await rowOf(run.id);
    expect(fila.creditedPoints).toBe(esperado);
    expect(fila.finishedAt).not.toBeNull();
    const eventos = (await db().select().from(outbox)).filter(
      (row) => row.eventType === "sudoku.completed",
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.payload).toMatchObject({
      runId: run.id,
      difficulty,
      assisted,
      points: esperado,
    });
    expect((await getTodaySudoku(personId)).solved[difficulty]).toBe(1);
  });

  it("una cuadrícula que no es la solución deja la partida abierta y no escribe nada", async () => {
    const personId = await seedMember("sudoku.no-resuelto@eafit.edu.co");
    const run = await openRun(personId);
    const fila = await rowOf(run.id);
    const auditoriaAntes = (await db().select().from(auditLog)).length;
    const fallido = await finishSudokuAs(
      { personId, ip: null },
      { runId: run.id, grid: wrong(fila.solution), requestId: randomUUID() },
    );
    expect(fallido).toMatchObject({ ok: false, reason: "NOT_SOLVED" });
    expect((await rowOf(run.id)).status).toBe("IN_PROGRESS");
    expect(await db().select().from(pointEntry)).toHaveLength(0);
    expect(await db().select().from(auditLog)).toHaveLength(auditoriaAntes);

    // Una cuadrícula válida de otro tablero tampoco sirve: se compara con la solución de este.
    const otra = await solveAndFinish(await seedMember("sudoku.otro-tablero@eafit.edu.co"));
    const ajena = await finishSudokuAs(
      { personId, ip: null },
      { runId: run.id, grid: otra.solution, requestId: randomUUID() },
    );
    expect(ajena).toMatchObject({ ok: false, reason: "NOT_SOLVED" });

    // El crédito sigue libre: la solución de verdad acredita después.
    const bueno = await finishSudokuAs(
      { personId, ip: null },
      { runId: run.id, grid: fila.solution, requestId: randomUUID() },
    );
    expect(bueno).toMatchObject({ ok: true, run: { points: 2 } });
  });

  it("rechaza entradas mal formadas sin tocar la base", async () => {
    const personId = await seedMember("sudoku.invalida@eafit.edu.co");
    const base = { requestId: randomUUID(), difficulty: "EASY", assisted: false };
    for (const input of [
      { ...base, difficulty: "EXPERT" },
      { ...base, assisted: "si" },
      { ...base, requestId: "corto" },
      {},
    ]) {
      expect(await startSudokuAs({ personId, ip: null }, input)).toEqual({
        ok: false,
        reason: "INVALID_INPUT",
      });
    }
    expect(await db().select().from(sudokuRun)).toHaveLength(0);

    const run = await openRun(personId);
    const { solution } = await rowOf(run.id);
    for (const grid of [
      solution.slice(1),
      `${solution}1`,
      `0${solution.slice(1)}`,
      "x".repeat(81),
    ]) {
      expect(
        await finishSudokuAs(
          { personId, ip: null },
          { runId: run.id, grid, requestId: randomUUID() },
        ),
      ).toEqual({ ok: false, reason: "INVALID_INPUT" });
    }
    expect((await rowOf(run.id)).status).toBe("IN_PROGRESS");
  });

  it("repetir el inicio devuelve la misma partida, y otra dificultad se rechaza", async () => {
    const personId = await seedMember("sudoku.inicio@eafit.edu.co");
    const requestId = randomUUID();
    const pedido = { difficulty: "MEDIUM", assisted: false } as const;
    const uno = await startSudokuAs({ personId, ip: null }, { requestId, ...pedido });
    const dos = await startSudokuAs({ personId, ip: null }, { requestId, ...pedido });
    const tres = await startSudokuAs(
      { personId, ip: null },
      { requestId: randomUUID(), ...pedido },
    );
    if (!uno.ok || !dos.ok || !tres.ok) throw new Error("inicio denegado");
    expect(dos.run).toEqual(uno.run);
    expect(tres.run.id).toBe(uno.run.id);

    // Devolver en silencio un Medio a quien pidió Difícil confunde: se rechaza.
    expect(
      await startSudokuAs(
        { personId, ip: null },
        { requestId: randomUUID(), difficulty: "HARD", assisted: false },
      ),
    ).toEqual({ ok: false, reason: "OPEN_RUN" });
    expect(
      await startSudokuAs(
        { personId, ip: null },
        { requestId: randomUUID(), difficulty: "MEDIUM", assisted: true },
      ),
    ).toEqual({ ok: false, reason: "OPEN_RUN" });
    expect(await db().select().from(sudokuRun)).toHaveLength(1);
  });

  it("veinte inicios concurrentes dejan una sola partida", async () => {
    const personId = await seedMember("sudoku.concurrencia-inicio@eafit.edu.co");
    await warmPool(10);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        startSudokuAs(
          { personId, ip: null },
          { requestId: randomUUID(), difficulty: "MEDIUM", assisted: false },
        ),
      ),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(new Set(results.map((result) => (result.ok ? result.run.id : ""))).size).toBe(1);
    expect(await db().select().from(sudokuRun)).toHaveLength(1);
  });

  it("abandonar libera la partida abierta, es idempotente y no cuesta nada", async () => {
    const personId = await seedMember("sudoku.abandono@eafit.edu.co");
    const run = await openRun(personId, { difficulty: "HARD" });
    const uno = await abandonSudokuAs({ personId, ip: null }, { runId: run.id });
    const dos = await abandonSudokuAs({ personId, ip: null }, { runId: run.id });
    expect(uno).toMatchObject({ ok: true, run: { status: "ABANDONED", points: 0 } });
    expect(dos).toEqual(uno);
    const fila = await rowOf(run.id);
    expect(fila.finishedAt).not.toBeNull();
    expect(fila.finishRequestId).toBeNull();
    expect(
      (await db().select().from(auditLog)).filter((row) => row.action === "sudoku.abandoned"),
    ).toHaveLength(1);

    // Ya se puede empezar otra, con otra dificultad, y el crédito del día sigue libre.
    const otra = await solveAndFinish(personId, { difficulty: "EASY" });
    expect(otra.result).toMatchObject({ ok: true, run: { points: 2 } });
    // Una partida abandonada no se puede cerrar después, ni con la solución.
    expect(
      await finishSudokuAs(
        { personId, ip: null },
        { runId: run.id, grid: fila.solution, requestId: randomUUID() },
      ),
    ).toMatchObject({ ok: false, reason: "FINISHED" });
    // Y una resuelta no se abandona.
    expect(await abandonSudokuAs({ personId, ip: null }, { runId: otra.run.id })).toMatchObject({
      ok: false,
      reason: "FINISHED",
    });
  });

  it("el requestId de inicio de una partida cerrada responde terminada, no un error", async () => {
    const personId = await seedMember("sudoku.inicio-viejo@eafit.edu.co");
    const requestId = randomUUID();
    const pedido = { requestId, difficulty: "EASY", assisted: false } as const;
    const inicio = await startSudokuAs({ personId, ip: null }, pedido);
    if (!inicio.ok) throw new Error(inicio.reason);
    await abandonSudokuAs({ personId, ip: null }, { runId: inicio.run.id });
    expect(await startSudokuAs({ personId, ip: null }, pedido)).toEqual({
      ok: false,
      reason: "FINISHED",
    });
    expect(await db().select().from(sudokuRun)).toHaveLength(1);
  });

  it("reenviar el mismo cierre no acredita dos veces, y con otro contenido se rechaza", async () => {
    const personId = await seedMember("sudoku.reenvio@eafit.edu.co");
    const { run, solution, result, requestId } = await solveAndFinish(personId);
    if (!result.ok) throw new Error(result.reason);
    const otraVez = await finishSudokuAs(
      { personId, ip: null },
      { runId: run.id, grid: solution, requestId },
    );
    expect(otraVez).toEqual(result);
    const distinto = await finishSudokuAs(
      { personId, ip: null },
      { runId: run.id, grid: wrong(solution), requestId },
    );
    expect(distinto).toMatchObject({ ok: false, reason: "REQUEST_CONFLICT" });
    // Otro requestId sobre una partida ya resuelta: terminada.
    expect(
      await finishSudokuAs(
        { personId, ip: null },
        { runId: run.id, grid: solution, requestId: randomUUID() },
      ),
    ).toMatchObject({ ok: false, reason: "FINISHED" });
    expect(await db().select().from(pointEntry)).toHaveLength(1);
  });

  it("un requestId de cierre no sirve para otra partida", async () => {
    const personId = await seedMember("sudoku.cierre-reusado@eafit.edu.co");
    const primera = await solveAndFinish(personId);
    const segunda = await openRun(personId);
    const { solution } = await rowOf(segunda.id);
    const reusado = await finishSudokuAs(
      { personId, ip: null },
      { runId: segunda.id, grid: solution, requestId: primera.requestId },
    );
    expect(reusado).toMatchObject({ ok: false, reason: "REQUEST_CONFLICT" });
    expect((await rowOf(segunda.id)).status).toBe("IN_PROGRESS");
  });

  it("dos cierres concurrentes de la misma partida dejan un solo premio", async () => {
    const personId = await seedMember("sudoku.concurrencia-cierre@eafit.edu.co");
    const run = await openRun(personId, { difficulty: "MEDIUM" });
    const { solution } = await rowOf(run.id);
    await warmPool(6);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        finishSudokuAs(
          { personId, ip: null },
          { runId: run.id, grid: solution, requestId: randomUUID() },
        ),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results
        .filter((result) => !result.ok)
        .every((result) => !result.ok && result.reason === "FINISHED"),
    ).toBe(true);
    expect(await db().select().from(pointEntry)).toHaveLength(1);
  });

  it("un cierre que encuentra la partida tomada por otro escritor la espera y la vuelve a leer: ya terminó, no la premia", async () => {
    const personId = await seedMember("sudoku.espera-cierre@eafit.edu.co");
    const run = await openRun(personId, { difficulty: "MEDIUM" });
    const { solution } = await rowOf(run.id);
    // El otro escritor es sintético: da la partida por vencida sin tomar el consultivo de la persona,
    // que hoy toman todos los comandos del Sudoku y por eso cubre a la prueba de arriba. Así lo único
    // que hace esperar al cierre es el `for update` de la partida (DT-335).
    const held = await holdTransaction((tx) =>
      tx
        .update(sudokuRun)
        .set({ status: "EXPIRED", finishedAt: new Date() })
        .where(eq(sudokuRun.id, run.id)),
    );
    const { during, after } = await heldThenSettled(held, () =>
      finishSudokuAs(
        { personId, ip: null },
        { runId: run.id, grid: solution, requestId: randomUUID() },
      ),
    );

    // Sin la partida bajo candado el cierre la lee en curso, espera recién en su escritura y premia
    // encima una partida vencida.
    expect(during).toBe("hizo cola");
    expect(after).toMatchObject({ status: "fulfilled", value: { ok: false, reason: "FINISHED" } });
    expect((await rowOf(run.id)).status).toBe("EXPIRED");
    expect(await db().select().from(pointEntry)).toHaveLength(0);
  });

  it("el primer tablero resuelto es el del día: un Fácil con ayudas primero, y el Difícil da 0", async () => {
    const personId = await seedMember("sudoku.uno-por-dia@eafit.edu.co");
    const primera = await solveAndFinish(personId, { difficulty: "EASY", assisted: true });
    expect(primera.result).toMatchObject({ ok: true, run: { points: 1 } });

    const segunda = await solveAndFinish(personId, { difficulty: "HARD", assisted: false });
    expect(segunda.result).toMatchObject({ ok: true, run: { status: "SOLVED", points: 0 } });

    expect(await db().select().from(pointEntry)).toHaveLength(1);
    const hoy = await getTodaySudoku(personId);
    expect(hoy.credited?.id).toBe(primera.run.id);
    expect(hoy.solved).toEqual({ EASY: 1, MEDIUM: 0, HARD: 1 });
    expect(
      (await db().select().from(auditLog)).filter((row) => row.action === "sudoku.solved"),
    ).toHaveLength(1);
  });

  it("la base rechaza un segundo crédito del mismo día aunque se fuerce", async () => {
    const personId = await seedMember("sudoku.unico@eafit.edu.co");
    const { run, result } = await solveAndFinish(personId);
    if (!result.ok) throw new Error(result.reason);
    const fila = await rowOf(run.id);
    // Sin una fila acreditada ese día el índice no tiene contra qué chocar y el INSERT pasaría.
    expect(fila.creditedAt).not.toBeNull();
    await expect(
      db().insert(sudokuRun).values({
        personId,
        termId: fila.termId,
        day: fila.day,
        seed: "0123456789abcdef",
        rulesVersion: fila.rulesVersion,
        difficulty: "EASY",
        assisted: false,
        givens: fila.givens,
        solution: fila.solution,
        status: "SOLVED",
        startRequestId: randomUUID(),
        finishRequestId: randomUUID(),
        finishedAt: new Date(),
        creditedAt: new Date(),
        creditedPoints: 2,
      }),
    ).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "sudoku_run_person_day_credited_unique"),
    );
  });

  it("la base impide que una partida con ayudas acredite más de la mitad", async () => {
    const personId = await seedMember("sudoku.tope-ayudas@eafit.edu.co");
    const run = await openRun(personId, { difficulty: "HARD", assisted: true });
    const forzar = (creditedPoints: number) =>
      db()
        .update(sudokuRun)
        .set({
          status: "SOLVED",
          finishedAt: new Date(),
          finishRequestId: randomUUID(),
          creditedAt: new Date(),
          creditedPoints,
        })
        .where(eq(sudokuRun.id, run.id));
    await expect(forzar(6)).rejects.toSatisfy((error) =>
      isCheckViolation(error, "sudoku_run_credit_assisted_cap"),
    );
    await expect(forzar(3)).resolves.toBeDefined();
  });

  it("cruzar la medianoche vence la partida y no acredita", async () => {
    const personId = await seedMember("sudoku.medianoche@eafit.edu.co");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:00:00Z"));
    const run = await openRun(personId);
    const { solution } = await rowOf(run.id);
    // 05:00 UTC es la medianoche de Colombia: ya es otro día del juego.
    vi.setSystemTime(new Date("2027-01-01T06:00:00Z"));
    expect((await getTodaySudoku(personId)).open).toBeNull();
    const result = await finishSudokuAs(
      { personId, ip: null },
      { runId: run.id, grid: solution, requestId: randomUUID() },
    );
    expect(result).toMatchObject({ ok: false, reason: "EXPIRED", run: { status: "EXPIRED" } });
    expect(await db().select().from(pointEntry)).toHaveLength(0);
    expect((await rowOf(run.id)).creditedAt).toBeNull();
  });

  it("empezar al día siguiente vence la partida vieja y reparte un tablero nuevo", async () => {
    const personId = await seedMember("sudoku.dia-nuevo@eafit.edu.co");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T15:00:00Z"));
    const vieja = await openRun(personId, { difficulty: "HARD" });
    vi.setSystemTime(new Date("2026-10-06T15:00:00Z"));
    const nueva = await openRun(personId, { difficulty: "EASY" });
    expect(nueva.id).not.toBe(vieja.id);
    expect((await rowOf(vieja.id)).status).toBe("EXPIRED");
    expect(
      await db()
        .select()
        .from(sudokuRun)
        .where(and(eq(sudokuRun.personId, personId), eq(sudokuRun.status, "IN_PROGRESS"))),
    ).toHaveLength(1);
  });

  it("con los puntos del semestre cerrados la partida vence sin acreditar", async () => {
    const personId = await seedMember("sudoku.cerrado@eafit.edu.co");
    const run = await openRun(personId);
    const fila = await rowOf(run.id);
    await db().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, fila.termId));
    const result = await finishSudokuAs(
      { personId, ip: null },
      { runId: run.id, grid: fila.solution, requestId: randomUUID() },
    );
    expect(result).toMatchObject({ ok: false, reason: "TERM_CLOSED" });
    expect(await db().select().from(pointEntry)).toHaveLength(0);
    expect((await getTodaySudoku(personId)).availability).toBe("TERM_CLOSED");
    expect(
      await startSudokuAs(
        { personId, ip: null },
        { requestId: randomUUID(), difficulty: "EASY", assisted: false },
      ),
    ).toEqual({ ok: false, reason: "TERM_CLOSED" });
  });

  it("quien no es activo ni honorario no puede jugar", async () => {
    const termId = await seedTerm();
    const personId = await seedPerson("sudoku.licencia@eafit.edu.co");
    await seedMembership(personId, termId, "ON_LEAVE");
    expect((await getTodaySudoku(personId)).availability).toBe("NOT_ELIGIBLE");
    const result = await startSudokuAs(
      { personId, ip: null },
      { requestId: randomUUID(), difficulty: "EASY", assisted: false },
    );
    expect(result).toEqual({ ok: false, reason: "NOT_ELIGIBLE" });
    expect(await db().select().from(sudokuRun)).toHaveLength(0);
  });

  it("una partida ajena responde como inexistente", async () => {
    const mia = await seedMember("sudoku.duena@eafit.edu.co");
    const ajena = await seedMember("sudoku.ajena@eafit.edu.co");
    const run = await openRun(mia);
    const { solution } = await rowOf(run.id);
    expect(
      await finishSudokuAs(
        { personId: ajena, ip: null },
        { runId: run.id, grid: solution, requestId: randomUUID() },
      ),
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await abandonSudokuAs({ personId: ajena, ip: null }, { runId: run.id })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    expect((await rowOf(run.id)).status).toBe("IN_PROGRESS");
    expect(await db().select().from(pointEntry)).toHaveLength(0);
  });

  it("acreditar produce una sola interacción CRM al reentregar el evento y no manda push", async () => {
    const personId = await seedMember("sudoku.crm@eafit.edu.co");
    const { result } = await solveAndFinish(personId, { difficulty: "HARD" });
    if (!result.ok) throw new Error(result.reason);
    await drainOutbox();

    const [event] = await db()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "sudoku.completed"));
    if (!event) throw new Error("Evento de prueba ausente");
    await db()
      .update(outbox)
      .set({ processedAt: null, nextAttemptAt: new Date() })
      .where(eq(outbox.id, event.id));
    await drainOutbox();

    const timeline = await db()
      .select()
      .from(interaction)
      .where(eq(interaction.personId, personId));
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.kind).toBe("PARTICIPATION");
    expect(timeline[0]?.summary).toMatch(itemPattern(tList("T-667")[13]));
    expect(timeline[0]?.summary).toMatch(itemPattern(fillCopy(tList("T-667")[13], { n: 6 })));
    // El juego no manda push: el único aviso diario de la casa es el del Wordle (ADR-074).
    expect(await db().select().from(message)).toHaveLength(0);
  });
});
