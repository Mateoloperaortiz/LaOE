import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import {
  balanceFor,
  type ColorResult,
  closeTermPointsAs,
  getGamerProfile,
  getTermStanding,
  getTodayColor,
  listColorRunsFor,
  listEntriesFor,
  listEntriesForPerson,
  nextColorRoundAs,
  startColorAs,
  submitColorRoundAs,
} from "@/modules/participation";
import type { HslColor, SubmitColorRoundInput } from "@/modules/participation/color-types";
import { seedMembership, seedPerson, seedTerm } from "../factories";
import { truncateAll } from "./db";

// Aleatoriedad del sistema fijada: los tres objetivos son HSL(60,60,60).
// Los ejemplos de los cortes se calcularon aparte con colorsys y las matrices OKLab publicadas.
vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  randomInt: () => 60,
}));

async function completeColor(
  personId: string,
  prefix: string,
  answer?: HslColor,
  concurrentFinish = false,
) {
  const actor = { personId, ip: null };
  let result: ColorResult = await startColorAs(actor, { requestId: `${prefix}-start` });
  if (!result.ok) throw new Error("No empezó Color");
  for (let round = 1; round <= 3; round += 1) {
    const target = result.run.target;
    if (!target) throw new Error("Falta objetivo visible");
    vi.setSystemTime(new Date(Date.now() + 3_000));
    const input: SubmitColorRoundInput = {
      runId: result.run.id,
      round,
      answer: answer ?? target,
      requestId: `${prefix}-submit-${round}`,
    };
    if (concurrentFinish && round === 3) {
      const results: ColorResult[] = await Promise.all([
        submitColorRoundAs(actor, input),
        submitColorRoundAs(actor, input),
      ]);
      expect(results[0]).toEqual(results[1]);
      result = results[0] ?? result;
    } else result = await submitColorRoundAs(actor, input);
    if (!result.ok) throw new Error("No guardó la ronda");
    if (round < 3) {
      result = await nextColorRoundAs(actor, {
        runId: result.run.id,
        requestId: `${prefix}-next-${round}`,
      });
      if (!result.ok) throw new Error("No avanzó Color");
    }
  }
  return result.run;
}

describe("Color de Juegos", () => {
  beforeEach(async () => {
    await truncateAll();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T18:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  afterAll(closeDb);

  it("espera el gesto para observar y retoma una sola partida sin consumir el premio", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await seedPerson("color@example.test");
    await seedMembership(personId, termId, "ACTIVE");
    expect(await getTodayColor(personId)).toMatchObject({
      availability: "AVAILABLE",
      open: null,
      credited: null,
    });
    const result = await startColorAs({ personId, ip: null }, { requestId: "color-start-0001" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("No empezó Color");
    expect(result.run).toMatchObject({
      day: "2026-10-15",
      status: "IN_PROGRESS",
      round: 1,
      watchUntil: "2026-10-15T18:00:03.000Z",
      results: [],
      average: null,
      points: 0,
      target: { h: expect.any(Number), s: expect.any(Number), l: expect.any(Number) },
    });
    expect(await startColorAs({ personId, ip: null }, { requestId: "color-start-0002" })).toEqual(
      result,
    );
    expect((await getTodayColor(personId)).open).toEqual(result.run);
    expect((await getTodayColor(personId)).credited).toBeNull();
  });

  it("completa tres recuerdos perfectos y acredita seis puntos con una sola participación", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await seedPerson("color-perfecto@example.test");
    await seedMembership(personId, termId, "ACTIVE");
    const actor = { personId, ip: null };
    let result = await startColorAs(actor, { requestId: "color-perfect-start" });
    if (!result.ok) throw new Error("No empezó Color");
    for (let round = 1; round <= 3; round += 1) {
      const target = result.run.target;
      if (!target) throw new Error("Falta el color que se está observando");
      vi.setSystemTime(new Date(Date.now() + 3_000));
      result = await submitColorRoundAs(actor, {
        runId: result.run.id,
        round,
        answer: target,
        requestId: `color-perfect-submit-${round}`,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("No se guardó la respuesta");
      expect(result.run.results.at(-1)).toMatchObject({ round, accuracy: 100 });
      expect(result.run.target).toBeNull();
      if (round < 3) {
        expect(result.run.points).toBe(0);
        result = await nextColorRoundAs(actor, {
          runId: result.run.id,
          requestId: `color-perfect-next-${round}`,
        });
        if (!result.ok) throw new Error("No empezó la siguiente ronda");
      }
    }
    expect(result.run).toMatchObject({ status: "FINISHED", average: 100, points: 6 });
    expect((await getTodayColor(personId)).credited).toEqual(result.run);
    expect(await getGamerProfile(personId, termId)).toMatchObject({
      points: 6,
      participations: 1,
      activeDays: 1,
      todayGames: ["COLOR"],
    });
    expect(await balanceFor(personId, termId)).toBe(0);
    await closeTermPointsAs(actor, termId);
    expect((await getTermStanding(termId))?.topGamer).toMatchObject([
      { personId, points: 6, participations: 1, activeDays: 1 },
    ]);
    const lastRound = result.run.results.at(-1);
    if (!lastRound) throw new Error("Falta el resultado final");
    expect(
      await submitColorRoundAs(actor, {
        runId: result.run.id,
        round: 3,
        answer: lastRound.answer,
        requestId: "color-perfect-submit-3",
      }),
    ).toMatchObject({ ok: true, run: { average: 100, points: 6 } });
  });

  it("paga uno por la primera completa aunque sea imprecisa y la práctica perfecta no mejora ese premio", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await seedPerson("color-practica@example.test");
    await seedMembership(personId, termId, "ACTIVE");
    const first = await completeColor(personId, "color-first-low", { h: 0, s: 0, l: 0 }, true);
    expect(first).toMatchObject({ status: "FINISHED", average: 0, points: 1 });
    const practice = await completeColor(personId, "color-practice-perfect");
    expect(practice).toMatchObject({ average: 100, points: 0 });
    expect((await getTodayColor(personId)).credited?.id).toBe(first.id);
    expect((await getTodayColor(personId)).best).toBe(100);
    expect(await getGamerProfile(personId, termId)).toMatchObject({ points: 1, participations: 1 });
    expect(await balanceFor(personId, termId)).toBe(0);
  });

  it.each([
    { answer: { h: 2, s: 8, l: 65 }, average: 49.9, points: 1 },
    { answer: { h: 0, s: 1, l: 64 }, average: 50, points: 2 },
    { answer: { h: 28, s: 70, l: 65 }, average: 64.9, points: 2 },
    { answer: { h: 28, s: 71, l: 65 }, average: 65, points: 3 },
    { answer: { h: 38, s: 82, l: 65 }, average: 79.9, points: 3 },
    { answer: { h: 38, s: 83, l: 65 }, average: 80, points: 4 },
    { answer: { h: 47, s: 73, l: 65 }, average: 89.9, points: 4 },
    { answer: { h: 47, s: 74, l: 64 }, average: 90, points: 5 },
    { answer: { h: 53, s: 67, l: 62 }, average: 94.9, points: 5 },
    { answer: { h: 53, s: 68, l: 63 }, average: 95, points: 6 },
  ])("aplica la banda $points a la media normativa $average", async ({
    answer,
    average,
    points,
  }) => {
    const termId = await seedTerm("2026-2");
    const personId = await seedPerson("color-corte@example.test");
    await seedMembership(personId, termId, "ACTIVE");
    expect(await completeColor(personId, "color-cutoff-run", answer)).toMatchObject({
      average,
      points,
    });
  });

  it("no deja saltar la observación, puntuar por cliente ni obtener los objetivos de otra persona", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await seedPerson("color-guard@example.test");
    await seedMembership(personId, termId, "ACTIVE");
    const actor = { personId, ip: null };
    const start = await startColorAs(actor, { requestId: "color-guard-start" });
    if (!start.ok || !start.run.target) throw new Error("No empezó Color");
    const input = {
      runId: start.run.id,
      round: 1,
      answer: start.run.target,
      requestId: "color-guard-submit",
    };
    expect(await submitColorRoundAs(actor, input)).toEqual({ ok: false, reason: "TOO_EARLY" });
    expect(
      await nextColorRoundAs(actor, { runId: start.run.id, requestId: "color-guard-next" }),
    ).toEqual({ ok: false, reason: "ROUND_NOT_READY" });
    expect(await submitColorRoundAs(actor, { ...input, score: 100, points: 6 })).toEqual({
      ok: false,
      reason: "INVALID_INPUT",
    });
    expect(
      await submitColorRoundAs(
        { personId: await seedPerson("color-other@example.test"), ip: null },
        input,
      ),
    ).toEqual({ ok: false, reason: "NOT_FOUND" });
    vi.setSystemTime(new Date(Date.now() + 3_000));
    expect((await getTodayColor(personId)).open?.target).toBeNull();
    expect((await listColorRunsFor(personId))[0]).toMatchObject({
      target: null,
      watchUntil: null,
      results: [],
    });
    const result = await submitColorRoundAs(actor, input);
    expect(result.ok).toBe(true);
    expect(await submitColorRoundAs(actor, { ...input, answer: { h: 0, s: 0, l: 0 } })).toEqual({
      ok: false,
      reason: "REQUEST_CONFLICT",
    });
  });

  it("promedia la precisión sin redondear las rondas antes de resolver el último corte", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await seedPerson("color-promedio@example.test");
    await seedMembership(personId, termId, "ACTIVE");
    const actor = { personId, ip: null };
    let result = await startColorAs(actor, { requestId: "color-average-start" });
    if (!result.ok) throw new Error("No empezó Color");
    const answers = [
      { h: 55, s: 72, l: 62 },
      { h: 55, s: 72, l: 62 },
      { h: 54, s: 64, l: 62 },
    ];
    for (const [index, answer] of answers.entries()) {
      vi.setSystemTime(new Date(Date.now() + 3_000));
      result = await submitColorRoundAs(actor, {
        runId: result.run.id,
        round: index + 1,
        answer,
        requestId: `color-average-submit-${index}`,
      });
      if (!result.ok) throw new Error("No guardó la ronda");
      if (index < 2) {
        result = await nextColorRoundAs(actor, {
          runId: result.run.id,
          requestId: `color-average-next-${index}`,
        });
        if (!result.ok) throw new Error("No avanzó la ronda");
      }
    }
    // El promedio de 94.93536878, 94.93536878 y 94.99296314 redondea a 95.0.
    // Promediar primero los valores mostrados (94.9,94.9,95.0) daría 94.9 y otro premio.
    expect(result.run.results.map((item) => item.accuracy)).toEqual([94.9, 94.9, 95]);
    expect(result.run).toMatchObject({ average: 95, points: 6 });
  });

  it("Color nativo nunca entra a GH aunque el término conserve el criterio histórico de otros juegos", async () => {
    const termId = await seedTerm("2026-1", { startsOn: "2026-07-01", endsOn: "2026-12-31" });
    const personId = await seedPerson("color-historico@example.test");
    await seedMembership(personId, termId, "ACTIVE");
    expect(await completeColor(personId, "color-historical-term")).toMatchObject({ points: 6 });
    expect(await getGamerProfile(personId, termId)).toMatchObject({ points: 6, participations: 1 });
    expect(await balanceFor(personId, termId)).toBe(0);
    expect(await listEntriesFor(personId, termId)).toEqual([]);
    expect(await listEntriesForPerson(personId)).toMatchObject([
      { kind: "COLOR", points: 6, account: "GAMER" },
    ]);
  });

  it("no acredita al cruzar medianoche ni después del cierre del semestre", async () => {
    const termId = await seedTerm("2026-2");
    const personId = await seedPerson("color-expired@example.test");
    await seedMembership(personId, termId, "ACTIVE");
    const actor = { personId, ip: null };
    vi.setSystemTime(new Date("2026-10-16T04:59:59Z"));
    const old = await startColorAs(actor, { requestId: "color-yesterday-start" });
    if (!old.ok || !old.run.target) throw new Error("No empezó Color");
    vi.setSystemTime(new Date("2026-10-16T05:00:02Z"));
    expect(
      await submitColorRoundAs(actor, {
        runId: old.run.id,
        round: 1,
        answer: old.run.target,
        requestId: "color-yesterday-submit",
      }),
    ).toEqual({ ok: false, reason: "EXPIRED" });
    const current = await startColorAs(actor, { requestId: "color-today-start" });
    if (!current.ok || !current.run.target) throw new Error("No empezó Color hoy");
    await closeTermPointsAs(actor, termId);
    vi.setSystemTime(new Date(Date.now() + 3_000));
    expect(
      await submitColorRoundAs(actor, {
        runId: current.run.id,
        round: 1,
        answer: current.run.target,
        requestId: "color-after-close-submit",
      }),
    ).toEqual({ ok: false, reason: "TERM_CLOSED" });
    expect(await balanceFor(personId, termId)).toBe(0);
    expect((await getTodayColor(personId)).credited).toBeNull();
  });
});
