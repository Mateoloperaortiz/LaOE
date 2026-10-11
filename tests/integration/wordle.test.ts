import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { message } from "@/modules/comms/schema";
import { interaction } from "@/modules/crm/schema";
import { getTermStanding } from "@/modules/participation/domain/closing";
import { closeTermPointsAs } from "@/modules/participation/domain/commands";
import { dayKeyFor, nextDayAt } from "@/modules/participation/domain/gamification-pure";
import { balanceFor } from "@/modules/participation/domain/ledger";
import {
  getTodayWordle,
  listWordleGamesFor,
  startWordleAs,
  submitWordleGuessAs,
} from "@/modules/participation/domain/wordle";
import {
  WORDLE_ANSWERS,
  WORDLE_DICTIONARY_VERSION,
} from "@/modules/participation/domain/wordle-dictionary";
import { WORDLE_RULES_VERSION } from "@/modules/participation/domain/wordle-pure";
import { pointEntry, wordleAttempt, wordleGame } from "@/modules/participation/schema";
import type { WordleGameView } from "@/modules/participation/wordle-types";
import { membership } from "@/modules/people/schema";
import { setConfig } from "@/modules/system";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import {
  seedMember,
  seedMembership,
  seedPeople,
  seedPerson,
  seedTerm,
  seedWordleGames,
} from "../factories";
import { itemPattern } from "../helpers/copy";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

const db = () => getDb();

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */

async function started(personId: string): Promise<WordleGameView> {
  const result = await startWordleAs({ personId, ip: null });
  if (!result.ok) throw new Error(result.reason);
  return result.game;
}

async function answerFor(gameId: string): Promise<string> {
  const [row] = await db()
    .select({ answer: wordleGame.answer })
    .from(wordleGame)
    .where(eq(wordleGame.id, gameId));
  if (!row) throw new Error("Partida de prueba ausente");
  return row.answer;
}

function submit(
  personId: string,
  gameId: string,
  guess: string,
  expectedAttempt = 1,
  requestId = randomUUID(),
) {
  return submitWordleGuessAs({ personId, ip: null }, { gameId, guess, expectedAttempt, requestId });
}

describe("Wordle diario persistido", () => {
  beforeEach(truncateAll);
  afterEach(() => vi.useRealTimers());
  afterAll(() => closeDb());

  it("leer no crea una partida, y las lecturas y exportaciones ocultan su respuesta activa", async () => {
    const personId = await seedMember("wordle.lectura@eafit.edu.co");
    expect(await getTodayWordle(personId)).toMatchObject({ availability: "AVAILABLE", game: null });
    expect(await db().select().from(wordleGame)).toHaveLength(0);
    const game = await started(personId);
    expect(game.answer).toBeNull();
    expect(game.status).toBe("IN_PROGRESS");
    expect(game.nextAvailableAt).toBe(nextDayAt(dayKeyFor(new Date())));
    expect((await getTodayWordle(personId)).game).toEqual(game);
    expect(await listWordleGamesFor(personId)).toEqual([game]);
    const audit = await db().select().from(auditLog);
    expect(JSON.stringify(audit)).not.toContain(await answerFor(game.id));
  });

  it("veinte inicios concurrentes del mismo miembro devuelven la misma partida", async () => {
    const personId = await seedMember("wordle.inicio@eafit.edu.co");
    await warmPool(10);
    const games = await Promise.all(Array.from({ length: 20 }, () => started(personId)));
    expect(new Set(games.map((game) => game.id)).size).toBe(1);
    expect(await db().select().from(wordleGame)).toHaveLength(1);
    expect(
      await db().select().from(auditLog).where(eq(auditLog.action, "wordle.started")),
    ).toHaveLength(1);
  });

  it("asigna respuestas distintas al iniciar miembros simultáneamente", async () => {
    const people = await Promise.all(
      Array.from({ length: 20 }, (_, i) => seedPerson(`wordle.distinta.${i}@eafit.edu.co`)),
    );
    const termId = await seedTerm();
    await Promise.all(people.map((personId) => seedMembership(personId, termId)));
    // Al catálogo le quedan justo tantas respuestas como miembros: si dos leyeran a la vez las
    // disponibles, elegirían al azar entre las mismas y se repetirían casi siempre.
    const spent = WORDLE_ANSWERS.slice(people.length);
    const others = await seedPeople(
      spent.map((_, i) => ({
        email: `wordle.gastada.${i}@eafit.edu.co`,
        stage: "PROSPECT" as const,
      })),
    );
    await seedWordleGames(
      termId,
      spent.map((answer, i) => ({
        personId: others[i] ?? "",
        day: dayKeyFor(new Date()),
        answer,
        dictionaryVersion: WORDLE_DICTIONARY_VERSION,
        rulesVersion: WORDLE_RULES_VERSION,
      })),
    );
    await warmPool(10);
    await Promise.all(people.map(started));
    const games = (await db().select().from(wordleGame)).filter((game) =>
      people.includes(game.personId),
    );
    expect(games).toHaveLength(people.length);
    expect(new Set(games.map((game) => game.answer)).size).toBe(people.length);
  });

  it.each([
    1, 2, 3, 4, 5, 6,
  ])("acertar en el intento %i acredita su premio una sola vez", async (winningAttempt) => {
    const personId = await seedMember("wordle.premio@eafit.edu.co");
    const game = await started(personId);
    const answer = await answerFor(game.id);
    const wrong = WORDLE_ANSWERS.find((word) => word !== answer) ?? "CASAS";
    for (let i = 1; i < winningAttempt; i += 1) {
      expect((await submit(personId, game.id, wrong, i)).ok).toBe(true);
    }
    const requestId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => submit(personId, game.id, answer, winningAttempt, requestId)),
    );
    for (const result of results) {
      expect(result).toMatchObject({
        ok: true,
        game: { status: "WON", answer, points: 7 - winningAttempt },
      });
    }
    expect(await balanceFor(personId, game.termId)).toBe(7 - winningAttempt);
    expect(await db().select().from(pointEntry)).toHaveLength(1);
    expect(await db().select().from(wordleAttempt)).toHaveLength(winningAttempt);
    expect(
      await db().select().from(outbox).where(eq(outbox.eventType, "wordle.completed")),
    ).toHaveLength(1);
    expect(
      await db().select().from(auditLog).where(eq(auditLog.action, "wordle.completed")),
    ).toHaveLength(1);
    expect(JSON.stringify(await db().select().from(outbox))).not.toContain(answer);
    expect(JSON.stringify(await db().select().from(auditLog))).not.toContain(answer);
  });

  it("guarda seis intentos fallidos, muestra la respuesta y no entrega puntos", async () => {
    const personId = await seedMember("wordle.derrota@eafit.edu.co");
    const game = await started(personId);
    const answer = await answerFor(game.id);
    const wrong = WORDLE_ANSWERS.find((word) => word !== answer) ?? "CASAS";
    for (let i = 1; i <= 6; i += 1) await submit(personId, game.id, wrong, i);
    expect((await getTodayWordle(personId)).game).toMatchObject({
      status: "LOST",
      answer,
      points: 0,
    });
    expect(await db().select().from(pointEntry)).toHaveLength(0);
    expect(await submit(personId, game.id, answer)).toMatchObject({
      ok: false,
      reason: "FINISHED",
    });
  });

  it("la victoria produce una sola interacción CRM al reentregar el evento y no manda push", async () => {
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "gamification.enabled", true));
    const personId = await seedMember("wordle.crm@eafit.edu.co");
    const game = await started(personId);
    const answer = await answerFor(game.id);
    await submit(personId, game.id, answer);
    await drainOutbox();
    const [event] = await db()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "wordle.completed"));
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
    // La victoria escribe su interacción y, desde G-T5, la de la insignia Palabra a palabra 1
    // que el mismo evento desbloquea; reentregar el evento no duplica ninguna.
    expect(timeline).toHaveLength(2);
    const wordleEntry = timeline.find((item) => itemPattern(tList("T-667")[6]).test(item.summary));
    expect(wordleEntry).toMatchObject({
      kind: "PARTICIPATION",
      metadata: { gameId: game.id, points: 6, attempts: 1 },
    });
    const badgeEntry = timeline.find((item) => itemPattern(tList("T-667")[9]).test(item.summary));
    expect(badgeEntry?.summary).toContain("Palabra a palabra");
    expect(JSON.stringify(timeline)).not.toContain(answer);
    expect(await db().select().from(message)).toHaveLength(0);
    expect(
      await db().select().from(outbox).where(eq(outbox.eventType, "notification.requested")),
    ).toHaveLength(0);
  });

  it("un rechazo no consume intento y otra pestaña recupera los intentos aceptados", async () => {
    const personId = await seedMember("wordle.pestanas@eafit.edu.co");
    const game = await started(personId);
    const answer = await answerFor(game.id);
    const wrong = WORDLE_ANSWERS.find((word) => word !== answer) ?? "CASAS";
    expect(await submit(personId, game.id, "ZZZZZ")).toMatchObject({
      ok: false,
      reason: "UNKNOWN_WORD",
    });
    expect(await submit(personId, game.id, "a-bcd")).toMatchObject({
      ok: false,
      reason: "INVALID_INPUT",
    });
    expect(await db().select().from(wordleAttempt)).toHaveLength(0);
    const results = await Promise.all([
      submit(personId, game.id, wrong),
      submit(personId, game.id, wrong),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({
      reason: "STALE_ATTEMPT",
      game: { attempts: [{ ordinal: 1, guess: wrong }] },
    });
    expect((await getTodayWordle(personId)).game?.attempts).toHaveLength(1);
    expect((await started(personId)).attempts).toHaveLength(1);
  });

  it("un requestId aceptado no puede reutilizarse con otro contenido", async () => {
    const personId = await seedMember("wordle.request@eafit.edu.co");
    const game = await started(personId);
    const requestId = randomUUID();
    const answer = await answerFor(game.id);
    const wrong = WORDLE_ANSWERS.find((word) => word !== answer) ?? "CASAS";
    await submit(personId, game.id, wrong, 1, requestId);
    expect(await submit(personId, game.id, answer, 1, requestId)).toMatchObject({
      ok: false,
      reason: "REQUEST_CONFLICT",
    });
    expect(await db().select().from(wordleAttempt)).toHaveLength(1);
  });

  it("relee elegibilidad en cada envío y admite honorarios sin confiar en el actor", async () => {
    const termId = await seedTerm();
    for (const status of ["ON_LEAVE", "INACTIVE", "HONORARY"] as const) {
      const personId = await seedPerson(`wordle.${status.toLowerCase()}@eafit.edu.co`);
      await seedMembership(personId, termId, status);
      const result = await startWordleAs({ personId, ip: null });
      expect(result.ok).toBe(status === "HONORARY");
    }
    const personId = await seedMember("wordle.estado@eafit.edu.co");
    const game = await started(personId);
    await db()
      .update(membership)
      .set({ status: "ON_LEAVE" })
      .where(eq(membership.personId, personId));
    expect(await startWordleAs({ personId, ip: null })).toEqual({
      ok: false,
      reason: "NOT_ELIGIBLE",
    });
    expect(await submit(personId, game.id, await answerFor(game.id))).toMatchObject({
      ok: false,
      reason: "NOT_ELIGIBLE",
    });
  });

  it("normaliza tildes y Ñ descompuesta antes de validar y conserva esa Ñ al puntuar", async () => {
    const personId = await seedMember("wordle.normalizar@eafit.edu.co");
    const game = await started(personId);
    await db().update(wordleGame).set({ answer: "NIÑOS" }).where(eq(wordleGame.id, game.id));
    const result = await submit(personId, game.id, "  nin\u0303os  ");
    expect(result).toMatchObject({
      ok: true,
      game: {
        status: "WON",
        answer: "NIÑOS",
        attempts: [{ guess: "NIÑOS", feedback: Array(5).fill("correct") }],
      },
    });
  });

  it("un miembro no puede consultar por envío ni modificar la partida de otro", async () => {
    const owner = await seedMember("wordle.duena@eafit.edu.co");
    const stranger = await seedMember("wordle.ajena@eafit.edu.co");
    const game = await started(owner);
    expect(await submit(stranger, game.id, await answerFor(game.id))).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    expect(await listWordleGamesFor(stranger)).toEqual([]);
  });

  it("vence a medianoche, permite otra partida y recupera reintentos aceptados del día anterior", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:00:00Z"));
    const personId = await seedMember("wordle.medianoche@eafit.edu.co");
    const game = await started(personId);
    const answer = await answerFor(game.id);
    const wrong = WORDLE_ANSWERS.find((word) => word !== answer) ?? "CASAS";
    const requestId = randomUUID();
    await submit(personId, game.id, wrong, 1, requestId);
    vi.setSystemTime(new Date("2027-01-01T05:00:00Z"));
    await seedTerm();
    expect(await submit(personId, game.id, wrong, 1, requestId)).toMatchObject({
      ok: true,
      game: { status: "EXPIRED", points: 0 },
    });
    expect(await submit(personId, game.id, answer, 2)).toMatchObject({
      ok: false,
      reason: "EXPIRED",
    });
    const next = await started(personId);
    expect(next.id).not.toBe(game.id);
    expect(next.day).toBe("2027-01-01");
    expect(next.termId).not.toBe(game.termId);
    expect(await db().select().from(pointEntry)).toHaveLength(0);
  });

  it("semestre cerrado rechaza nuevas partidas e intentos, pero recupera una victoria ya acreditada", async () => {
    const personId = await seedMember("wordle.cierre@eafit.edu.co");
    const winner = await seedMember("wordle.ganadora@eafit.edu.co");
    const game = await started(personId);
    const won = await started(winner);
    const requestId = randomUUID();
    const answer = await answerFor(won.id);
    await submit(winner, won.id, answer, 1, requestId);
    await db().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, game.termId));
    expect(await submit(personId, game.id, await answerFor(game.id))).toMatchObject({
      ok: false,
      reason: "TERM_CLOSED",
    });
    expect(await submit(winner, won.id, answer, 1, requestId)).toMatchObject({
      ok: true,
      game: { status: "WON", points: 6 },
    });
    const newcomer = await seedPerson("wordle.cerrado@eafit.edu.co");
    await seedMembership(newcomer, game.termId);
    expect(await startWordleAs({ personId: newcomer, ip: null })).toMatchObject({
      ok: false,
      reason: "TERM_CLOSED",
    });
    expect(await getTodayWordle(newcomer)).toMatchObject({ availability: "TERM_CLOSED" });
  });

  it("sin semestre actual no comienza el reto y un diccionario desconocido no consume intentos", async () => {
    const personId = await seedPerson("wordle.sinsemestre@eafit.edu.co");
    expect(await startWordleAs({ personId, ip: null })).toEqual({ ok: false, reason: "NO_TERM" });
    const termId = await seedTerm();
    await seedMembership(personId, termId);
    const game = await started(personId);
    await db()
      .update(wordleGame)
      .set({ dictionaryVersion: "inexistente" })
      .where(eq(wordleGame.id, game.id));
    expect(await submit(personId, game.id, await answerFor(game.id))).toMatchObject({
      ok: false,
      reason: "DICTIONARY_UNAVAILABLE",
    });
    expect(await db().select().from(wordleAttempt)).toHaveLength(0);
  });

  it("la victoria queda en el snapshot del semestre y el reintento posterior al cierre no duplica", async () => {
    const personId = await seedMember("wordle.snapshot@eafit.edu.co");
    const game = await started(personId);
    const answer = await answerFor(game.id);
    const requestId = randomUUID();
    await submit(personId, game.id, answer, 1, requestId);
    await closeTermPointsAs({ personId, ip: null }, game.termId);
    const standing = await getTermStanding(game.termId);
    expect(standing?.stats.pointsAwarded).toBe(6);
    expect(standing?.topNew).toMatchObject([{ personId, total: 6 }]);
    expect(standing?.topCommittees).toEqual([]);
    expect(await submit(personId, game.id, answer, 1, requestId)).toMatchObject({
      ok: true,
      game: { points: 6 },
    });
    expect(await balanceFor(personId, game.termId)).toBe(6);
  });

  it("victoria simultánea con cierre queda completa en el snapshot o se rechaza sin acreditar", async () => {
    const personId = await seedMember("wordle.carrera@eafit.edu.co");
    const game = await started(personId);
    const answer = await answerFor(game.id);
    await warmPool();
    const [result] = await Promise.all([
      submit(personId, game.id, answer),
      closeTermPointsAs({ personId, ip: null }, game.termId),
    ]);
    const standing = await getTermStanding(game.termId);
    const [stored] = await db().select().from(wordleGame).where(eq(wordleGame.id, game.id));
    if (result.ok) {
      expect(result.game.status).toBe("WON");
      expect(stored?.status).toBe("WON");
      expect(standing?.stats.pointsAwarded).toBe(6);
      expect(standing?.topNew).toMatchObject([{ personId, total: 6 }]);
    } else {
      expect(result.reason).toBe("TERM_CLOSED");
      expect(stored?.status).toBe("EXPIRED");
      expect(standing?.stats.pointsAwarded).toBe(0);
      expect(await db().select().from(wordleAttempt)).toHaveLength(0);
      expect(await db().select().from(pointEntry)).toHaveLength(0);
    }
    expect(await balanceFor(personId, game.termId)).toBe(standing?.stats.pointsAwarded);
  });

  it("agotamiento del catálogo no repite una respuesta", async () => {
    const personId = await seedMember("wordle.agotado@eafit.edu.co");
    const termId = await seedTerm();
    const people = await seedPeople(
      WORDLE_ANSWERS.map((_, i) => ({
        email: `wordle.catalogo.${i}@eafit.edu.co`,
        stage: "PROSPECT" as const,
      })),
    );
    await seedWordleGames(
      termId,
      WORDLE_ANSWERS.map((answer, i) => ({
        personId: people[i] ?? personId,
        day: dayKeyFor(new Date()),
        answer,
        dictionaryVersion: WORDLE_DICTIONARY_VERSION,
        rulesVersion: WORDLE_RULES_VERSION,
      })),
    );
    expect(await startWordleAs({ personId, ip: null })).toEqual({ ok: false, reason: "EXHAUSTED" });
    const [rows] = await db()
      .select({ n: count() })
      .from(wordleGame)
      .where(and(eq(wordleGame.day, dayKeyFor(new Date())), eq(wordleGame.personId, personId)));
    expect(rows?.n).toBe(0);
  });
});
