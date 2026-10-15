import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { message } from "@/modules/comms/schema";
import { interaction } from "@/modules/crm/schema";
import { getGamerProfile } from "@/modules/participation";
import {
  finishGame2048As,
  getTodayGame2048,
  listGame2048RunsFor,
  startGame2048As,
} from "@/modules/participation/domain/game2048";
import { dayKeyFor } from "@/modules/participation/domain/gamification-pure";
import { balanceFor } from "@/modules/participation/domain/ledger";
import {
  applyGame2048Move,
  GAME2048_MAX_MOVES,
  game2048Reward,
  newGame2048,
} from "@/modules/participation/game2048-engine";
import type { Game2048Move, Game2048State } from "@/modules/participation/game2048-types";
import { game2048Run, pointEntry } from "@/modules/participation/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { seedMember, seedMembership, seedPerson, seedTerm } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

const db = () => getDb();
const ORDER: Game2048Move[] = ["L", "U", "R", "D"];
/**
 * Semilla con la que `playOut` pasa el primer umbral de premio. Con la semilla aleatoria del
 * servidor, la heurística se queda bajo 1.000 puntos en el 2,5 % de las partidas (50.000 semillas,
 * medido el 2026-09-18) y esa partida no acredita: las pruebas que necesitan un crédito usan esta.
 */
const SEED_OVER_THRESHOLD = "36e7e815ffd7e027";

/** Juega de verdad con una heurística simple: las listas de prueba son siempre reproducibles. */
function playOut(seed: string): { state: Game2048State; moves: string } {
  let state = newGame2048(seed);
  const moves: Game2048Move[] = [];
  while (!state.over && moves.length < GAME2048_MAX_MOVES) {
    let best: { move: Game2048Move; next: Game2048State; value: number } | null = null;
    for (const move of ORDER) {
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

/** Prefijo de una lista válida: sigue siendo válido, y sirve para quedarse bajo un puntaje. */
function prefixUnder(seed: string, limit: number): { moves: string; score: number } {
  const full = playOut(seed).moves;
  let state = newGame2048(seed);
  const kept: string[] = [];
  for (const move of full) {
    const next = applyGame2048Move(state, move as Game2048Move);
    if (!next || next.score >= limit) break;
    state = next;
    kept.push(move);
  }
  return { moves: kept.join(""), score: state.score };
}

/**
 * Abre la partida del día. Con `overThreshold` le pone la semilla fija —el cierre rejuega con la
 * guardada— después de comprobar que `playOut` la lleva sobre el primer umbral: si un cambio del
 * motor o de la heurística la deja debajo, la prueba falla aquí y no con un síntoma más adelante.
 */
async function openRun(personId: string, { overThreshold = false } = {}) {
  const result = await startGame2048As({ personId, ip: null }, { requestId: randomUUID() });
  if (!result.ok) throw new Error(result.reason);
  if (!overThreshold) return result.run;
  if (game2048Reward(playOut(SEED_OVER_THRESHOLD).state.score) === 0) {
    throw new Error("La semilla fija ya no pasa el primer umbral");
  }
  await db()
    .update(game2048Run)
    .set({ seed: SEED_OVER_THRESHOLD })
    .where(eq(game2048Run.id, result.run.id));
  return { ...result.run, seed: SEED_OVER_THRESHOLD };
}

async function seedOf(runId: string): Promise<string> {
  const [row] = await db()
    .select({ seed: game2048Run.seed })
    .from(game2048Run)
    .where(eq(game2048Run.id, runId));
  if (!row) throw new Error("Partida de prueba ausente");
  return row.seed;
}

/** Una partida completa de punta a punta; devuelve la partida guardada y lo que el motor calculó. */
async function playAndFinish(personId: string, options: { overThreshold?: boolean } = {}) {
  const run = await openRun(personId, options);
  const { state, moves } = playOut(run.seed);
  const requestId = randomUUID();
  const result = await finishGame2048As(
    { personId, ip: null },
    { runId: run.id, moves, requestId },
  );
  return { run, state, moves, result, requestId };
}

describe("2048 con replay verificado", () => {
  beforeEach(truncateAll);
  afterEach(() => vi.useRealTimers());
  afterAll(() => closeDb());

  it("leer no crea partidas y la semilla no sale del historial", async () => {
    const personId = await seedMember("g2048.lectura@eafit.edu.co");
    const antes = await getTodayGame2048(personId);
    expect(antes).toMatchObject({ availability: "AVAILABLE", open: null, credited: null, best: 0 });
    expect(await db().select().from(game2048Run)).toHaveLength(0);

    const run = await openRun(personId);
    expect(run.seed).toMatch(/^[0-9a-f]{16}$/);
    // La partida abierta sí lleva la semilla a su dueño: sin ella no puede retomar el tablero.
    expect((await getTodayGame2048(personId)).open?.seed).toBe(run.seed);
    // El historial, en cambio, nunca la incluye: es lo que exporta `Mis datos`.
    const historial = await listGame2048RunsFor(personId);
    expect(historial).toHaveLength(1);
    expect(JSON.stringify(historial)).not.toContain(run.seed);
    expect(Object.keys(historial[0] ?? {})).not.toContain("moves");
  });

  it("ni la semilla ni la lista de movimientos entran a la auditoría", async () => {
    const personId = await seedMember("g2048.auditoria@eafit.edu.co");
    const { run, moves, result } = await playAndFinish(personId);
    expect(result.ok).toBe(true);
    const auditoria = JSON.stringify(await db().select().from(auditLog));
    expect(auditoria).not.toContain(await seedOf(run.id));
    expect(auditoria).not.toContain(moves);
  });

  it("repetir el inicio devuelve la misma partida y la misma semilla", async () => {
    const personId = await seedMember("g2048.inicio@eafit.edu.co");
    const requestId = randomUUID();
    const uno = await startGame2048As({ personId, ip: null }, { requestId });
    const dos = await startGame2048As({ personId, ip: null }, { requestId });
    const tres = await startGame2048As({ personId, ip: null }, { requestId: randomUUID() });
    if (!uno.ok || !dos.ok || !tres.ok) throw new Error("inicio denegado");
    expect(dos.run.id).toBe(uno.run.id);
    expect(dos.run.seed).toBe(uno.run.seed);
    // Con una partida abierta de hoy, pedir otra devuelve la abierta: nunca hay dos a la vez.
    expect(tres.run.id).toBe(uno.run.id);
    expect(await db().select().from(game2048Run)).toHaveLength(1);
  });

  it("veinte inicios concurrentes dejan una sola partida", async () => {
    const personId = await seedMember("g2048.concurrencia-inicio@eafit.edu.co");
    await warmPool(10);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        startGame2048As({ personId, ip: null }, { requestId: randomUUID() }),
      ),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await db().select().from(game2048Run)).toHaveLength(1);
  });

  it("acredita el puntaje que calcula el servidor, no el que manda el cliente", async () => {
    const personId = await seedMember("g2048.credito@eafit.edu.co");
    const { run, state, result } = await playAndFinish(personId, { overThreshold: true });
    if (!result.ok) throw new Error(result.reason);
    const esperado = game2048Reward(state.score);
    expect(esperado).toBeGreaterThan(0);
    expect(result.run.score).toBe(state.score);
    expect(result.run.maxTile).toBe(state.maxTile);
    expect(result.run.points).toBe(esperado);
    expect(result.run.status).toBe("FINISHED");

    const entries = await db().select().from(pointEntry);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "GAME2048", game2048RunId: run.id, points: esperado });
    expect(await balanceFor(personId, entries[0]?.termId ?? "")).toBe(0);
    expect(await getGamerProfile(personId, entries[0]?.termId ?? "")).toMatchObject({
      points: esperado,
      participations: 1,
      activeDays: 1,
      rankingMetric: "POINTS",
    });

    const [fila] = await db().select().from(game2048Run).where(eq(game2048Run.id, run.id));
    expect(fila?.creditedAt).not.toBeNull();
    expect(fila?.creditedPoints).toBe(esperado);
    expect(fila?.moveCount).toBe(state.moves);

    const eventos = await db().select().from(outbox);
    expect(eventos.filter((row) => row.eventType === "game2048.completed")).toHaveLength(1);
  });

  it("una lista de movimientos forjada no acredita nada", async () => {
    const personId = await seedMember("g2048.forjada@eafit.edu.co");
    const run = await openRun(personId);
    const { moves } = playOut(run.seed);
    // Un movimiento de más al final de una partida terminada es inerte: la lista deja de ser reproducible.
    const forjada = await finishGame2048As(
      { personId, ip: null },
      { runId: run.id, moves: `${moves}L`, requestId: randomUUID() },
    );
    expect(forjada).toEqual({ ok: false, reason: "INVALID_MOVES" });
    expect(await db().select().from(pointEntry)).toHaveLength(0);
    const [fila] = await db().select().from(game2048Run).where(eq(game2048Run.id, run.id));
    expect(fila?.status).toBe("IN_PROGRESS");
    expect(fila?.moves).toBeNull();
  });

  it("rechaza caracteres ajenos y listas más largas que el tope", async () => {
    const personId = await seedMember("g2048.formato@eafit.edu.co");
    const run = await openRun(personId);
    for (const moves of ["LULX", "L".repeat(GAME2048_MAX_MOVES + 1)]) {
      expect(
        await finishGame2048As(
          { personId, ip: null },
          { runId: run.id, moves, requestId: randomUUID() },
        ),
      ).toEqual({ ok: false, reason: "INVALID_INPUT" });
    }
  });

  it("reenviar el mismo cierre devuelve lo guardado y no acredita dos veces", async () => {
    const personId = await seedMember("g2048.replay@eafit.edu.co");
    const { run, moves, result, requestId } = await playAndFinish(personId, {
      overThreshold: true,
    });
    if (!result.ok) throw new Error(result.reason);
    const otra = await finishGame2048As(
      { personId, ip: null },
      { runId: run.id, moves, requestId },
    );
    expect(otra).toEqual(result);
    expect(await db().select().from(pointEntry)).toHaveLength(1);

    // El mismo requestId con otro contenido se rechaza.
    const conflicto = await finishGame2048As(
      { personId, ip: null },
      { runId: run.id, moves: moves.slice(0, 4), requestId },
    );
    expect(conflicto.ok).toBe(false);
    expect(conflicto.ok === false && conflicto.reason).toBe("REQUEST_CONFLICT");
    expect(await db().select().from(pointEntry)).toHaveLength(1);
  });

  it("cerrar dos veces la misma partida con envíos distintos no duplica el premio", async () => {
    const personId = await seedMember("g2048.doble-cierre@eafit.edu.co");
    const run = await openRun(personId, { overThreshold: true });
    const { moves } = playOut(run.seed);
    const [uno, dos] = await Promise.all([
      finishGame2048As({ personId, ip: null }, { runId: run.id, moves, requestId: randomUUID() }),
      finishGame2048As({ personId, ip: null }, { runId: run.id, moves, requestId: randomUUID() }),
    ]);
    expect([uno.ok, dos.ok].filter(Boolean)).toHaveLength(1);
    const rechazado = uno.ok ? dos : uno;
    expect(rechazado.ok === false && rechazado.reason).toBe("FINISHED");
    expect(await db().select().from(pointEntry)).toHaveLength(1);
  });

  it("la segunda partida del día se guarda pero no acredita", async () => {
    const personId = await seedMember("g2048.una-por-dia@eafit.edu.co");
    const primera = await playAndFinish(personId, { overThreshold: true });
    if (!primera.result.ok) throw new Error(primera.result.reason);
    expect(primera.result.run.points).toBeGreaterThan(0);

    // La segunda también pasa el umbral: si no acredita, es por el crédito del día.
    const segunda = await playAndFinish(personId, { overThreshold: true });
    if (!segunda.result.ok) throw new Error(segunda.result.reason);
    expect(segunda.result.run.status).toBe("FINISHED");
    expect(game2048Reward(segunda.result.run.score)).toBeGreaterThan(0);
    expect(segunda.result.run.points).toBe(0);
    expect(await getGamerProfile(personId, await seedTerm())).toMatchObject({
      points: primera.result.run.points,
      participations: 1,
      activeDays: 1,
    });

    expect(await db().select().from(pointEntry)).toHaveLength(1);
    const acreditadas = (await db().select().from(game2048Run)).filter(
      (row) => row.creditedAt !== null,
    );
    expect(acreditadas).toHaveLength(1);
    expect((await getTodayGame2048(personId)).credited?.id).toBe(primera.run.id);
  });

  it("la base rechaza un segundo crédito del mismo día aunque se fuerce", async () => {
    const personId = await seedMember("g2048.unico@eafit.edu.co");
    const { run, result } = await playAndFinish(personId, { overThreshold: true });
    if (!result.ok) throw new Error(result.reason);
    const [fila] = await db().select().from(game2048Run).where(eq(game2048Run.id, run.id));
    if (!fila) throw new Error("partida ausente");
    // Sin una fila acreditada ese día el índice no tiene contra qué chocar y el INSERT pasaría.
    expect(fila.creditedAt).not.toBeNull();
    await expect(
      db().insert(game2048Run).values({
        personId,
        termId: fila.termId,
        day: fila.day,
        seed: "0123456789abcdef",
        rulesVersion: fila.rulesVersion,
        status: "FINISHED",
        startRequestId: randomUUID(),
        finishedAt: new Date(),
        creditedAt: new Date(),
        creditedPoints: 3,
      }),
    ).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "game2048_run_person_day_credited_unique"),
    );
  });

  it("una partida bajo el primer umbral no consume el crédito del día", async () => {
    const personId = await seedMember("g2048.sin-umbral@eafit.edu.co");
    const run = await openRun(personId);
    const corta = prefixUnder(run.seed, 1_000);
    expect(corta.score).toBeLessThan(1_000);
    const flojo = await finishGame2048As(
      { personId, ip: null },
      { runId: run.id, moves: corta.moves, requestId: randomUUID() },
    );
    if (!flojo.ok) throw new Error(flojo.reason);
    expect(flojo.run.points).toBe(0);
    expect(await db().select().from(pointEntry)).toHaveLength(0);

    // El crédito del día sigue libre: la siguiente partida sí acredita.
    const buena = await playAndFinish(personId, { overThreshold: true });
    if (!buena.result.ok) throw new Error(buena.result.reason);
    expect(buena.result.run.points).toBeGreaterThan(0);
    expect(await db().select().from(pointEntry)).toHaveLength(1);
  });

  it("cruzar la medianoche vence la partida y no acredita", async () => {
    const personId = await seedMember("g2048.medianoche@eafit.edu.co");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:00:00Z"));
    const run = await openRun(personId);
    const { moves } = playOut(run.seed);
    // 05:00 UTC es la medianoche de Colombia: ya es otro día del juego.
    vi.setSystemTime(new Date("2027-01-01T06:00:00Z"));
    const result = await finishGame2048As(
      { personId, ip: null },
      { runId: run.id, moves, requestId: randomUUID() },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("EXPIRED");
    expect(await db().select().from(pointEntry)).toHaveLength(0);
    const [fila] = await db().select().from(game2048Run).where(eq(game2048Run.id, run.id));
    expect(fila?.status).toBe("EXPIRED");
    expect(fila?.creditedAt).toBeNull();
  });

  it("con los puntos del semestre cerrados la partida vence sin acreditar", async () => {
    const personId = await seedMember("g2048.cerrado@eafit.edu.co");
    const run = await openRun(personId);
    const { moves } = playOut(run.seed);
    const [fila] = await db().select().from(game2048Run).where(eq(game2048Run.id, run.id));
    await db()
      .update(term)
      .set({ pointsClosedAt: new Date() })
      .where(eq(term.id, fila?.termId ?? ""));
    const result = await finishGame2048As(
      { personId, ip: null },
      { runId: run.id, moves, requestId: randomUUID() },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("TERM_CLOSED");
    expect(await db().select().from(pointEntry)).toHaveLength(0);
    expect((await getTodayGame2048(personId)).availability).toBe("TERM_CLOSED");
  });

  it("quien no es activo ni honorario no puede jugar", async () => {
    const termId = await seedTerm();
    const personId = await seedPerson("g2048.licencia@eafit.edu.co");
    await seedMembership(personId, termId, "ON_LEAVE");
    expect((await getTodayGame2048(personId)).availability).toBe("NOT_ELIGIBLE");
    const result = await startGame2048As({ personId, ip: null }, { requestId: randomUUID() });
    expect(result).toEqual({ ok: false, reason: "NOT_ELIGIBLE" });
    expect(await db().select().from(game2048Run)).toHaveLength(0);
  });

  it("una partida ajena responde como inexistente", async () => {
    const mia = await seedMember("g2048.duena@eafit.edu.co");
    const ajena = await seedMember("g2048.ajena@eafit.edu.co");
    const run = await openRun(mia);
    const { moves } = playOut(run.seed);
    const result = await finishGame2048As(
      { personId: ajena, ip: null },
      { runId: run.id, moves, requestId: randomUUID() },
    );
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await db().select().from(pointEntry)).toHaveLength(0);
  });

  it("acreditar produce una sola interacción CRM al reentregar el evento y no manda push", async () => {
    const personId = await seedMember("g2048.crm@eafit.edu.co");
    const { result } = await playAndFinish(personId, { overThreshold: true });
    if (!result.ok) throw new Error(result.reason);
    await drainOutbox();

    const [event] = await db()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "game2048.completed"));
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
    expect(timeline[0]?.summary).toContain("2048");
    // El juego no manda push: el único aviso diario de la casa es el del Wordle (ADR-074).
    expect(await db().select().from(message)).toHaveLength(0);
  });

  it("el mejor puntaje del semestre acompaña la lectura del día", async () => {
    const personId = await seedMember("g2048.mejor@eafit.edu.co");
    const { state } = await playAndFinish(personId);
    const hoy = await getTodayGame2048(personId);
    expect(hoy.best).toBe(state.score);
    expect(hoy.day).toBe(dayKeyFor(new Date()));
    expect(
      await db()
        .select()
        .from(game2048Run)
        .where(and(eq(game2048Run.personId, personId), eq(game2048Run.status, "IN_PROGRESS"))),
    ).toHaveLength(0);
  });
});
