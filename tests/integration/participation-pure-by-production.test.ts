import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { adjustPointsAs, balanceFor, collectionFor } from "@/modules/participation";
import { seedCheckIn, seedMember, seedOccasion, seedTerm, seedVeteran } from "../factories";
import { truncateAll } from "./db";

// Lo que describían las pruebas de `balance`, `unlockedLevel` y `badgeProgress`, tres funciones puras
// que producción nunca llamó (DT-358): el saldo y el progreso de una familia de insignias los calcula
// la casa por otro camino, `balanceFor` en SQL y `collectionFor` en línea. Acá queda fijado por ese
// camino, con los mismos valores que traían las pruebas unitarias, antes de borrarlas.

describe("el saldo y el progreso de la colección, por el camino que usa la casa", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("el saldo del semestre es la suma de las entradas, con las negativas, y no cuenta las de otro semestre", async () => {
    const termId = await seedTerm();
    const otherTermId = await seedTerm("2031-1");
    const admin = await seedVeteran("admin.saldo@test.dev");
    const personId = await seedMember("miembro.saldo@test.dev");
    const give = (points: number, term = termId) =>
      adjustPointsAs(
        { personId: admin, ip: null },
        { personId, termId: term, points, reason: "ajuste de prueba" },
      );

    expect(await balanceFor(personId, termId)).toBe(0);
    await give(20);
    await give(-20);
    await give(15);
    await give(40, otherTermId);
    expect(await balanceFor(personId, termId)).toBe(15);
    expect(await balanceFor(personId, otherTermId)).toBe(40);
  });

  it("el progreso de una familia da el nivel y el próximo umbral sin hechos, entre dos umbrales, justo en cada uno y completa", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("miembro.progreso@test.dev");
    const attend = async (times: number) => {
      for (let index = 0; index < times; index += 1) {
        await seedCheckIn((await seedOccasion(termId)).id, personId);
      }
    };
    const progress = async () =>
      (await collectionFor(personId)).families.find((item) => item.family === "EN_PARCHE")
        ?.progress;

    // Los umbrales de «En parche» son los del catálogo de la migración: 1, 5 y 15 asistencias.
    expect(await progress()).toEqual({ current: 0, next: 1, level: 0 });
    await attend(1);
    expect(await progress()).toEqual({ current: 1, next: 5, level: 1 });
    await attend(3);
    expect(await progress()).toEqual({ current: 4, next: 5, level: 1 });
    await attend(1);
    expect(await progress()).toEqual({ current: 5, next: 15, level: 2 });
    await attend(10);
    expect(await progress()).toEqual({ current: 15, next: null, level: 3 });
    await attend(1);
    expect(await progress()).toEqual({ current: 16, next: null, level: 3 });
  });
});
