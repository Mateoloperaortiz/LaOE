import { describe, expect, it } from "vitest";
import { dayKeyFor, nextDayAt } from "@/modules/participation/domain/gamification-pure";

// DT-010: los juegos traían dos cálculos del día civil y dos de «cuándo empieza el siguiente». Esta
// propiedad los compara sobre un año de instantes y en cada medianoche de Colombia: es la que permitió
// dejar uno solo, y la que avisa si la zona de la app deja de ser UTC−5 todo el año.
//
// Desde el ciclo 7 (ADR-119 regla 6) el código solo tiene el cálculo por zona. La resta fija que traían
// Wordle y Panal quedó acá, copiada tal cual de `wordleDay` y `nextWordleAt`, como referencia.

/** El día por la resta fija de cinco horas (la referencia) y el día por la zona (el del código). */
const dayByFixedOffset = (at: Date): string =>
  new Date(at.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const dayByZone = (at: Date): string => dayKeyFor(at);

/** «Empieza el siguiente»: el día más uno a las 05:00Z (la referencia) y el del código. */
const nextByFixedOffset = (at: Date): string =>
  new Date(new Date(`${dayByFixedOffset(at)}T05:00:00.000Z`).getTime() + 86_400_000).toISOString();
const nextByZone = (at: Date): string => nextDayAt(dayKeyFor(at));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Del 1 de marzo de 2027 al 1 de marzo de 2028: cruza el año, el semestre y un 29 de febrero. */
const YEAR_START = Date.UTC(2027, 2, 1);
const YEAR_DAYS = 366;
const YEAR_END = YEAR_START + YEAR_DAYS * DAY;

/** Un año de instantes cada 17 minutos: el paso no divide la hora, así que recorre todos los minutos. */
function yearOfInstants(): Date[] {
  const instants: Date[] = [];
  for (let at = YEAR_START; at < YEAR_END; at += 17 * MINUTE) {
    instants.push(new Date(at));
  }
  return instants;
}

/** Cada día del año con su medianoche de Colombia, contada sobre el calendario y no sobre el código. */
function colombianMidnights(): { day: string; previousDay: string; at: number }[] {
  return Array.from({ length: YEAR_DAYS }, (_, index) => {
    const calendarDay = YEAR_START + index * DAY;
    return {
      day: new Date(calendarDay).toISOString().slice(0, 10),
      previousDay: new Date(calendarDay - DAY).toISOString().slice(0, 10),
      at: calendarDay + 5 * HOUR,
    };
  });
}

describe("el día civil de los juegos", () => {
  it("la resta fija y la zona dan el mismo día en un año de instantes cada 17 minutos", () => {
    const instants = yearOfInstants();
    const different = instants
      .filter((at) => dayByFixedOffset(at) !== dayByZone(at))
      .map((at) => at.toISOString());
    expect(instants.length).toBeGreaterThan(31_000);
    expect(different).toEqual([]);
  });

  it("«empieza el siguiente» da lo mismo por las dos fórmulas, y siempre cae en las 24 horas que vienen", () => {
    const different: string[] = [];
    const outOfRange: string[] = [];
    for (const at of yearOfInstants()) {
      const next = nextByFixedOffset(at);
      if (next !== nextByZone(at)) different.push(at.toISOString());
      const wait = Date.parse(next) - at.getTime();
      if (wait <= 0 || wait > DAY) outOfRange.push(at.toISOString());
    }
    expect(different).toEqual([]);
    expect(outOfRange).toEqual([]);
  });

  it("en cada medianoche de Colombia, con un milisegundo a cada lado, los dos cálculos cambian de día a la vez", () => {
    const wrong: string[] = [];
    const check = (at: number, day: string, next: number) => {
      const instant = new Date(at);
      const expected = { day, next: new Date(next).toISOString() };
      for (const [name, got] of [
        ["resta fija", { day: dayByFixedOffset(instant), next: nextByFixedOffset(instant) }],
        ["zona", { day: dayByZone(instant), next: nextByZone(instant) }],
      ] as const) {
        if (got.day !== expected.day || got.next !== expected.next) {
          wrong.push(`${instant.toISOString()} por ${name}: ${got.day} y ${got.next}`);
        }
      }
    };
    const midnights = colombianMidnights();
    for (const { day, previousDay, at } of midnights) {
      // Un milisegundo antes todavía es el día anterior, y el siguiente empieza en esta medianoche.
      check(at - 1, previousDay, at);
      // En la medianoche exacta y un milisegundo después ya es el día nuevo.
      check(at, day, at + DAY);
      check(at + 1, day, at + DAY);
    }
    expect(midnights).toHaveLength(YEAR_DAYS);
    expect(midnights.map(({ day }) => day)).toContain("2028-02-29");
    expect(wrong).toEqual([]);
  });
});
