import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import {
  getTodayGame2048,
  getTodayPanal,
  getTodaySudoku,
  getTodayWordle,
  runWordleReminder,
  startWordleAs,
  submitWordleGuessAs,
} from "@/modules/participation";
import { seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

// DT-010: lo que cada juego le dice a su pantalla sobre el día y sobre cuándo empieza el siguiente,
// por su lectura pública y con el reloj puesto en los bordes de la medianoche de Colombia. Fija la
// conducta de los cuatro antes de dejarles un solo cálculo.

/** Instante (UTC), día civil de Colombia en ese instante y cuándo empieza el día siguiente. */
const MOMENTS = [
  // Un milisegundo antes de la medianoche del 31 de diciembre todavía es 30.
  ["2026-12-31T04:59:59.999Z", "2026-12-30", "2026-12-31T05:00:00.000Z"],
  ["2026-12-31T05:00:00.000Z", "2026-12-31", "2027-01-01T05:00:00.000Z"],
  // Cambio de año y de semestre.
  ["2027-01-01T04:59:59.999Z", "2026-12-31", "2027-01-01T05:00:00.000Z"],
  ["2027-01-01T05:00:00.000Z", "2027-01-01", "2027-01-02T05:00:00.000Z"],
  ["2027-01-01T05:00:00.001Z", "2027-01-01", "2027-01-02T05:00:00.000Z"],
  // Mediodía, y las 9:30 de la noche: en UTC ya es el día siguiente, en Colombia no.
  ["2027-06-15T17:00:00.000Z", "2027-06-15", "2027-06-16T05:00:00.000Z"],
  ["2027-06-16T02:30:00.000Z", "2027-06-15", "2027-06-16T05:00:00.000Z"],
  // Año bisiesto.
  ["2028-02-29T04:59:59.999Z", "2028-02-28", "2028-02-29T05:00:00.000Z"],
  ["2028-02-29T05:00:00.000Z", "2028-02-29", "2028-03-01T05:00:00.000Z"],
] as const;

describe("el día de los cuatro juegos", () => {
  beforeEach(truncateAll);
  afterEach(() => vi.useRealTimers());
  afterAll(() => closeDb());

  it.each(
    MOMENTS,
  )("a las %s el Wordle, el Panal, el 2048 y el Sudoku están en el día %s y el siguiente empieza a las %s", async (at, day, nextAvailableAt) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(at));
    const personId = await seedMember("juegos.dia@eafit.edu.co");

    const today = { day, nextAvailableAt };
    expect(await getTodayWordle(personId)).toMatchObject(today);
    expect(await getTodayPanal(personId)).toMatchObject(today);
    expect(await getTodayGame2048(personId)).toMatchObject(today);
    expect(await getTodaySudoku(personId)).toMatchObject(today);
  });

  it("una partida de Wordle que venció anuncia el día que siguió al suyo, no el que sigue a hoy", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:00:00Z"));
    const personId = await seedMember("juegos.vencida@eafit.edu.co");
    const started = await startWordleAs({ personId, ip: null });
    if (!started.ok) throw new Error(started.reason);
    expect(started.game).toMatchObject({
      day: "2026-12-31",
      nextAvailableAt: "2027-01-01T05:00:00.000Z",
    });

    // Dos días después la partida sigue diciendo cuándo empezó el día siguiente al suyo.
    vi.setSystemTime(new Date("2027-01-02T15:00:00Z"));
    await seedTerm();
    const late = await submitWordleGuessAs(
      { personId, ip: null },
      { gameId: started.game.id, guess: "CASAS", expectedAttempt: 1, requestId: randomUUID() },
    );
    expect(late).toMatchObject({
      ok: false,
      reason: "EXPIRED",
      game: { day: "2026-12-31", status: "EXPIRED", nextAvailableAt: "2027-01-01T05:00:00.000Z" },
    });
    expect(await getTodayWordle(personId)).toMatchObject({
      day: "2027-01-02",
      nextAvailableAt: "2027-01-03T05:00:00.000Z",
      game: null,
    });
  });

  it("el aviso diario del Wordle cuenta el día por la hora de su tick, con el mismo corte", async () => {
    // Sin término vigente no avisa a nadie, pero dice para qué día corrió.
    expect(await runWordleReminder(new Date("2027-01-01T04:59:59.999Z"))).toEqual({
      day: "2026-12-31",
      audience: 0,
      enqueued: 0,
    });
    expect(await runWordleReminder(new Date("2027-01-01T05:00:00.000Z"))).toEqual({
      day: "2027-01-01",
      audience: 0,
      enqueued: 0,
    });
  });
});
