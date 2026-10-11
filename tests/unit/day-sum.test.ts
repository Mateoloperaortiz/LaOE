import { describe, expect, it } from "vitest";
import { providerDayEnd } from "@/modules/comms/domain/pure";
import { nextDayAt, weekKeyFor } from "@/modules/participation/domain/gamification-pure";
import { leaveWindow } from "@/modules/people/domain/leave-pure";
import { deriveDates, SUSPENSION_DAYS } from "@/modules/people/domain/sanction-pure";
import { evaluationWindow, noticesFor } from "@/modules/permanence/domain/permanence-pure";
import {
  APP_TIME_ZONE,
  addDays,
  atHourIn,
  dateKeyIn,
  midpointDay,
  startOfNextDayIn,
  startOfTodayIn,
} from "@/shared/lib/dates-pure";

// DT-270 (ADR-121 regla 6): «un día más n días» estaba escrito cuatro veces (permanencia, sanciones y
// dos veces en los juegos) y «empieza el día siguiente» dos (los juegos, por día; comunicaciones, por
// horas sumadas). Acá quedan esas fórmulas copiadas como estaban, y cada una se compara con la suma
// única (`addDays`, `startOfNextDayIn`), con un calendario contado a mano y con lo que responde hoy la
// función de cada módulo, en todos los días de dos años seguidos, uno de ellos bisiesto.

// Las fórmulas de antes, tal como estaban escritas.

/** `addDays` de `permanence-pure.ts`. */
const permanenceSum = (dayKeyValue: string, days: number): string => {
  const base = new Date(`${dayKeyValue}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

/** `addDays` de `sanction-pure.ts`, con su `fromKey` y su `dayKeyOf`. */
const sanctionSum = (key: string, days: number): string => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** `nextDayAt` de `gamification-pure.ts`. */
const gameNextDay = (day: string, timeZone: string): string => {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return atHourIn(timeZone, next.toISOString().slice(0, 10), 0).toISOString();
};

/** `weekKeyFor` de `gamification-pure.ts`. */
const gameWeek = (at: Date, timeZone: string): string => {
  const day = new Date(`${dateKeyIn(timeZone, at)}T00:00:00Z`);
  const back = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
};

/** `startOfNextDayIn` de `comms/domain/pure.ts`: 36 horas desde la medianoche de hoy, y su medianoche. */
const commsNextDay = (timeZone: string, at: Date): Date => {
  const noonTomorrow = new Date(startOfTodayIn(timeZone, at).getTime() + 36 * 3_600_000);
  return startOfTodayIn(timeZone, noonTomorrow);
};

// El calendario contado a mano, sin `Date`: de a un día, con los meses y los bisiestos escritos.

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const monthLength = (year: number, month: number): number =>
  [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
const two = (value: number): string => String(value).padStart(2, "0");

function walk(key: string, days: number): string {
  let [year = 0, month = 1, day = 1] = key.split("-").map(Number);
  for (let step = 0; step < Math.abs(days); step += 1) {
    if (days > 0) {
      day += 1;
      if (day > monthLength(year, month)) {
        day = 1;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    } else {
      day -= 1;
      if (day < 1) {
        month -= 1;
        if (month < 1) {
          month = 12;
          year -= 1;
        }
        day = monthLength(year, month);
      }
    }
  }
  return `${year}-${two(month)}-${two(day)}`;
}

// Todos los días de 2027 y de 2028, que es bisiesto: 731.
const FIRST_DAY = "2027-01-01";
/** El 1 de enero de 2027 es viernes: cuatro días después de su lunes. */
const FIRST_DAY_FROM_MONDAY = 4;
const DAYS: string[] = [];
for (let day = FIRST_DAY; day < "2029-01-01"; day = walk(day, 1)) {
  DAYS.push(day);
}

/** Saltos que cruzan semanas, meses de cada largo, el 29 de febrero y años enteros, hacia los dos lados. */
const JUMPS = [
  -731, -366, -365, -60, -31, -30, -29, -28, -14, -7, -3, -1, 0, 1, 2, 3, 6, 7, 28, 29, 30, 31, 60,
  365, 366, 731,
];

const ZONES = [APP_TIME_ZONE, "UTC"];
const DAY_MS = 86_400_000;

/** La medianoche con que empieza ese día en la zona, su mediodía y su último milisegundo. */
function instantsOf(day: string, timeZone: string): Date[] {
  const start = atHourIn(timeZone, day, 0).getTime();
  return [new Date(start), new Date(start + DAY_MS / 2), new Date(start + DAY_MS - 1)];
}

describe("un día más n días", () => {
  it("los días de la prueba son los dos años enteros, con su 29 de febrero", () => {
    expect(DAYS).toHaveLength(731);
    expect(DAYS).toContain("2028-02-29");
    expect([DAYS[0], DAYS.at(-1)]).toEqual(["2027-01-01", "2028-12-31"]);
  });

  it("la suma única da lo mismo que la de permanencia, la de sanciones y el calendario contado a mano, en cada día y con cada salto", () => {
    const different: string[] = [];
    for (const day of DAYS) {
      for (const jump of JUMPS) {
        const expected = walk(day, jump);
        const got = [addDays(day, jump), permanenceSum(day, jump), sanctionSum(day, jump)];
        if (got.some((value) => value !== expected)) {
          different.push(`${day} ${jump}: ${got.join(" ")} y a mano ${expected}`);
        }
      }
    }
    expect(different).toEqual([]);
  });

  it("la ventana de evaluación de permanencia abre los mismos días antes del fin del término", () => {
    const now = new Date("2027-06-01T12:00:00.000Z");
    const different: string[] = [];
    for (const endsOn of DAYS) {
      for (const evaluationWindowDays of [0, 1, 14, 30, 45]) {
        const { opensOn } = evaluationWindow(
          { endsOn, permanenceClosedAt: null },
          { evaluationWindowDays },
          now,
        );
        if (opensOn !== walk(endsOn, -evaluationWindowDays)) {
          different.push(`${endsOn} menos ${evaluationWindowDays}: ${opensOn}`);
        }
      }
    }
    expect(different).toEqual([]);
  });

  it("la suspensión de una falta termina a los mismos días de ocurrida, y el regreso de una licencia empieza al otro día", () => {
    const different: string[] = [];
    const kinds = ["WARNING", "MINOR"] as const;
    for (const day of DAYS) {
      for (const kind of kinds) {
        const days = SUSPENSION_DAYS[kind];
        if (days === undefined) throw new Error(`${kind} ya no suspende por días`);
        const dates = deriveDates(kind, day, null);
        const until = "error" in dates ? dates.error : dates.suspendedUntil;
        if (until !== walk(day, days)) {
          different.push(`${kind} del ${day}: ${until}`);
        }
      }
      if (leaveWindow(day).min !== walk(day, 1)) {
        different.push(`licencia desde el ${day}: ${leaveWindow(day).min}`);
      }
    }
    expect(different).toEqual([]);
  });
});

describe("la semana y el día siguiente", () => {
  it("el lunes de la semana es el mismo por la fórmula de antes, por la suma única y contando a mano, a cualquier hora del día", () => {
    const different: string[] = [];
    for (const timeZone of ZONES) {
      DAYS.forEach((day, index) => {
        const monday = walk(day, -((FIRST_DAY_FROM_MONDAY + index) % 7));
        for (const at of instantsOf(day, timeZone)) {
          const got = [weekKeyFor(at, timeZone), gameWeek(at, timeZone)];
          if (got.some((value) => value !== monday)) {
            different.push(`${timeZone} ${at.toISOString()}: ${got.join(" ")} y a mano ${monday}`);
          }
        }
      });
    }
    expect(different).toEqual([]);
  });

  it("«empieza el día siguiente» de los juegos es el mismo instante por la fórmula de antes y por la suma única", () => {
    const different: string[] = [];
    for (const timeZone of ZONES) {
      for (const day of DAYS) {
        const expected = atHourIn(timeZone, walk(day, 1), 0).toISOString();
        const got = [
          nextDayAt(day, timeZone),
          gameNextDay(day, timeZone),
          atHourIn(timeZone, addDays(day, 1), 0).toISOString(),
        ];
        if (got.some((value) => value !== expected)) {
          different.push(`${timeZone} ${day}: ${got.join(" ")} y a mano ${expected}`);
        }
      }
    }
    expect(different).toEqual([]);
  });

  it("la medianoche siguiente a un instante es la misma por las horas sumadas de comunicaciones, por el día de los juegos y por la función única", () => {
    const different: string[] = [];
    for (const timeZone of ZONES) {
      for (const day of DAYS) {
        const expected = atHourIn(timeZone, walk(day, 1), 0).toISOString();
        for (const at of instantsOf(day, timeZone)) {
          const got = [
            startOfNextDayIn(timeZone, at).toISOString(),
            commsNextDay(timeZone, at).toISOString(),
            nextDayAt(dateKeyIn(timeZone, at), timeZone),
          ];
          if (got.some((value) => value !== expected)) {
            different.push(
              `${timeZone} ${at.toISOString()}: ${got.join(" ")} y a mano ${expected}`,
            );
          }
        }
      }
    }
    expect(different).toEqual([]);
  });

  it("el día del proveedor del correo termina en esa misma medianoche, la de UTC", () => {
    const different: string[] = [];
    for (const day of DAYS) {
      const expected = `${walk(day, 1)}T00:00:00.000Z`;
      for (const at of instantsOf(day, "UTC")) {
        if (providerDayEnd(at).toISOString() !== expected) {
          different.push(`${at.toISOString()}: ${providerDayEnd(at).toISOString()}`);
        }
      }
    }
    expect(different).toEqual([]);
  });
});

// DT-321: «la mitad del término» estaba escrita dos veces. La de la viabilidad de un comité sumaba
// los días con su propio `setUTCDate`; la de los avisos de permanencia, ya con `addDays` y su propia
// resta. Acá quedan las dos como estaban, y se comparan entre sí, con el calendario contado a mano y
// con lo que responde cada módulo, en términos de cada largo.

/** `termMidpointKey` de `committee-viability-pure.ts`, con su `daysBetween`. */
const viabilityMidpoint = (startsOn: string, endsOn: string): string => {
  const days = Math.round(
    (new Date(`${endsOn}T00:00:00Z`).getTime() - new Date(`${startsOn}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  const midpoint = new Date(`${startsOn}T00:00:00Z`);
  midpoint.setUTCDate(midpoint.getUTCDate() + Math.floor(days / 2));
  return midpoint.toISOString().slice(0, 10);
};

/** La mitad de `noticesFor` de `permanence-pure.ts`. */
const noticesMidpoint = (startsOn: string, endsOn: string): string =>
  addDays(
    startsOn,
    Math.floor(
      (new Date(`${endsOn}T00:00:00Z`).getTime() - new Date(`${startsOn}T00:00:00Z`).getTime()) /
        86_400_000 /
        2,
    ),
  );

/**
 * Días del primero al último de un término: un día, semanas, meses de cada largo, semestres de 180 a
 * 184 días y años, con largos pares e impares. Los negativos son un fin anterior al inicio: ningún
 * término los tiene, pero las dos fórmulas respondían lo mismo y eso también se conserva.
 */
const TERM_LENGTHS = [
  -31, -3, -1, 0, 1, 2, 3, 28, 29, 30, 31, 59, 89, 90, 119, 120, 150, 179, 180, 181, 182, 183, 184,
  364, 365, 366,
];

describe("la mitad del término", () => {
  it("es el mismo día por la fórmula de la viabilidad, por la de los avisos, contando a mano y por la función, con el medio día que sobra sin contar", () => {
    const different: string[] = [];
    for (const startsOn of DAYS) {
      for (const length of TERM_LENGTHS) {
        const endsOn = walk(startsOn, length);
        const byHand = walk(startsOn, Math.floor(length / 2));
        const answers = [
          viabilityMidpoint(startsOn, endsOn),
          noticesMidpoint(startsOn, endsOn),
          midpointDay(startsOn, endsOn),
        ];
        if (answers.some((answer) => answer !== byHand)) {
          different.push(`${startsOn} a ${endsOn}: ${answers.join(", ")} y a mano ${byHand}`);
        }
      }
    }
    expect(different).toEqual([]);
  });

  it("el aviso de mitad de término de permanencia sale desde ese día y no el anterior", () => {
    // Lo mínimo que mira `noticesFor` para ese aviso: un comité que va por encima de su umbral.
    const result = {
      evaluated: false,
      results: [{ state: "EN_CAMINO", total: 100, threshold: 60, remaining: 0, committeeId: "c" }],
      mandatory: { upcoming: [] },
    } as unknown as Parameters<typeof noticesFor>[1];
    const config = { warningDays: 21, evaluationWindowDays: 14 } as unknown as Parameters<
      typeof noticesFor
    >[2];
    const midTermOn = (startsOn: string, endsOn: string, day: string): boolean =>
      noticesFor(
        { code: "2027-1", startsOn, endsOn, permanenceClosedAt: null } as unknown as Parameters<
          typeof noticesFor
        >[0],
        result,
        config,
        atHourIn(APP_TIME_ZONE, day, 12),
      ).some((notice) => notice.kind === "MID_TERM");
    const different: string[] = [];
    for (const startsOn of DAYS.filter((_, index) => index % 7 === 0)) {
      for (const length of TERM_LENGTHS.filter((days) => days >= 0)) {
        const endsOn = walk(startsOn, length);
        const byHand = walk(startsOn, Math.floor(length / 2));
        if (!midTermOn(startsOn, endsOn, byHand) || midTermOn(startsOn, endsOn, walk(byHand, -1))) {
          different.push(`${startsOn} a ${endsOn}: la mitad a mano es ${byHand}`);
        }
      }
    }
    expect(different).toEqual([]);
  });
});
