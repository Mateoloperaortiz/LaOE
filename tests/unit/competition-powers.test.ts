import { describe, expect, it } from "vitest";
import {
  checkGrantLimits,
  finishedDays,
  grantState,
  isCompleteSplit,
  POWER_TYPES,
  type Power,
  type PowerUseInput,
  parseDay,
  parsePower,
  parsePowerSheet,
  powerNotices,
  resolvePowers,
} from "@/modules/competition/domain/powers-pure";
import { OUTCOMES, type Outcome, pointsFor } from "@/modules/competition/domain/scoring-pure";
import { competitionPower } from "@/modules/competition/schema";

// Los poderes de The Games (ADR-098): el resolvedor fija el resultado oficial y los puntos sin tocar
// el de la cancha; el reparto es de 5 tarjetas, 2/3 o 3/2; el lector de la hoja entra todo o nada.

const use = (side: "A" | "B", power: Power, id = `${side}-${power}`): PowerUseInput => ({
  id,
  side,
  power,
});

const resolve = (outcome: Outcome, ...uses: PowerUseInput[]) =>
  resolvePowers({ baseKind: "NORMAL", outcome, uses });

const effectOf = (result: ReturnType<typeof resolve>, id: string) =>
  result.detail.uses.find((item) => item.useId === id)?.effect;

describe("resolvedor de poderes", () => {
  it("el catálogo del esquema es el mismo del dominio", () => {
    expect(competitionPower.enumValues).toEqual([...POWER_TYPES]);
  });

  it("x2 duplica solo lo de quien lo usa: 2000 al ganar, 1000 al empatar, nada al perder", () => {
    const win = resolve("A_WIN", use("A", "DOUBLE_POINTS"));
    expect(win.points).toEqual({ a: 2000, b: 0 });
    expect(win.detail.teams.A).toEqual({ base: 1000, bonus: 1000, total: 2000 });
    expect(effectOf(win, "A-DOUBLE_POINTS")).toBe("APPLIED");
    const draw = resolve("DRAW", use("A", "DOUBLE_POINTS"));
    expect(draw.points).toEqual({ a: 1000, b: 500 });
    const loss = resolve("B_WIN", use("A", "DOUBLE_POINTS"));
    expect(loss.points).toEqual({ a: 0, b: 1000 });
    expect(effectOf(loss, "A-DOUBLE_POINTS")).toBe("NO_EFFECT");
    expect(loss.official).toBe("B_WIN");
  });

  it("Cambio invierte todo el enfrentamiento y conserva el resultado de la cancha", () => {
    const lost = resolve("B_WIN", use("A", "RESULT_SWAP"));
    expect(lost.official).toBe("A_WIN");
    expect(lost.detail.sporting).toBe("B_WIN");
    expect(lost.points).toEqual({ a: 1000, b: 0 });
    const won = resolve("A_WIN", use("A", "RESULT_SWAP"));
    expect(won.official).toBe("B_WIN");
    expect(won.points).toEqual({ a: 0, b: 1000 });
  });

  it("con Cambio, un empate lo gana quien lo usó", () => {
    expect(resolve("DRAW", use("A", "RESULT_SWAP")).official).toBe("A_WIN");
    expect(resolve("DRAW", use("B", "RESULT_SWAP")).official).toBe("B_WIN");
  });

  it("dos Cambios se anulan y queda el resultado de la cancha", () => {
    const result = resolve("A_WIN", use("A", "RESULT_SWAP"), use("B", "RESULT_SWAP"));
    expect(result.official).toBe("A_WIN");
    expect(result.points).toEqual({ a: 1000, b: 0 });
    expect(result.detail.uses.map((item) => item.effect)).toEqual(["NEUTRALIZED", "NEUTRALIZED"]);
  });

  it("Cancelar anula el poder del rival; sin poder del rival se gasta sin efecto", () => {
    const cancelled = resolve("B_WIN", use("A", "CANCEL_POWER"), use("B", "DOUBLE_POINTS"));
    expect(cancelled.points).toEqual({ a: 0, b: 1000 });
    expect(effectOf(cancelled, "A-CANCEL_POWER")).toBe("APPLIED");
    expect(effectOf(cancelled, "B-DOUBLE_POINTS")).toBe("CANCELLED");
    const alone = resolve("A_WIN", use("A", "CANCEL_POWER"));
    expect(alone.points).toEqual({ a: 1000, b: 0 });
    expect(effectOf(alone, "A-CANCEL_POWER")).toBe("NO_EFFECT");
    const swapCancelled = resolve("B_WIN", use("A", "RESULT_SWAP"), use("B", "CANCEL_POWER"));
    expect(swapCancelled.official).toBe("B_WIN");
    expect(effectOf(swapCancelled, "A-RESULT_SWAP")).toBe("CANCELLED");
  });

  it("dos Cancelar se anulan entre sí", () => {
    const result = resolve("DRAW", use("A", "CANCEL_POWER"), use("B", "CANCEL_POWER"));
    expect(result.points).toEqual({ a: 500, b: 500 });
    expect(result.detail.uses.map((item) => item.effect)).toEqual(["NEUTRALIZED", "NEUTRALIZED"]);
  });

  it("regla 13: con Cambio de A y x2 de B, el x2 va sobre el resultado oficial", () => {
    const swapAndDouble = (outcome: Outcome) =>
      resolve(outcome, use("A", "RESULT_SWAP"), use("B", "DOUBLE_POINTS"));
    expect(swapAndDouble("B_WIN").points).toEqual({ a: 1000, b: 0 });
    expect(effectOf(swapAndDouble("B_WIN"), "B-DOUBLE_POINTS")).toBe("NO_EFFECT");
    expect(swapAndDouble("A_WIN").points).toEqual({ a: 0, b: 2000 });
    expect(swapAndDouble("DRAW").points).toEqual({ a: 1000, b: 0 });
  });

  it("1 min tarde y Un jugador menos no tocan los puntos", () => {
    for (const power of ["LATE_START", "ONE_PLAYER_DOWN"] as const) {
      for (const outcome of OUTCOMES) {
        const result = resolve(outcome, use("A", power));
        expect(result.points).toEqual(pointsFor("NORMAL", outcome));
        expect(result.official).toBe(outcome);
        expect(effectOf(result, `A-${power}`)).toBe("APPLIED");
      }
    }
  });

  it("en una base inflable ningún poder tiene efecto", () => {
    const result = resolvePowers({
      baseKind: "MACRO",
      outcome: "B_WIN",
      uses: [use("A", "RESULT_SWAP"), use("B", "DOUBLE_POINTS")],
    });
    expect(result.official).toBe("B_WIN");
    expect(result.points).toEqual({ a: 0, b: 2000 });
    expect(result.detail.uses.every((item) => item.effect === "NO_EFFECT")).toBe(true);
  });

  it("solo cuenta un poder por equipo", () => {
    const result = resolve(
      "B_WIN",
      use("A", "DOUBLE_POINTS", "primero"),
      use("A", "RESULT_SWAP", "segundo"),
    );
    expect(result.official).toBe("B_WIN");
    expect(effectOf(result, "segundo")).toBe("NO_EFFECT");
  });

  it("todas las combinaciones: simétricas, con puntos de la tabla y sin poderes igual a pointsFor", () => {
    const options: Array<Power | null> = [null, ...POWER_TYPES];
    const mirror: Record<Outcome, Outcome> = { A_WIN: "B_WIN", B_WIN: "A_WIN", DRAW: "DRAW" };
    for (const a of options) {
      for (const b of options) {
        for (const outcome of OUTCOMES) {
          const uses = [...(a ? [use("A", a)] : []), ...(b ? [use("B", b)] : [])];
          const result = resolve(outcome, ...uses);
          expect([0, 500, 1000, 2000]).toContain(result.points.a);
          expect([0, 500, 1000, 2000]).toContain(result.points.b);
          expect(result.detail.sporting).toBe(outcome);
          if (uses.length === 0) expect(result.points).toEqual(pointsFor("NORMAL", outcome));
          const flipped = resolve(
            mirror[outcome],
            ...uses.map((item) => ({
              ...item,
              side: item.side === "A" ? ("B" as const) : ("A" as const),
            })),
          );
          expect(flipped.points).toEqual({ a: result.points.b, b: result.points.a });
          expect(flipped.official).toBe(mirror[result.official]);
        }
      }
    }
  });

  it("antes del resultado, el líder ve qué poderes van a contar", () => {
    const notices = powerNotices("NORMAL", [use("A", "LATE_START"), use("B", "CANCEL_POWER")]);
    expect(notices.map((item) => item.state)).toEqual(["CANCELLED", "ACTIVE"]);
    expect(powerNotices("NORMAL", [use("A", "CANCEL_POWER")])[0]?.state).toBe("NO_EFFECT");
    expect(powerNotices("MACRO", [use("A", "LATE_START")])[0]?.state).toBe("NO_EFFECT");
  });
});

describe("reparto de poderes", () => {
  const five = (day1: number) => [
    ...Array.from({ length: day1 }, () => ({ teamId: "t1", day: 1 })),
    ...Array.from({ length: 5 - day1 }, () => ({ teamId: "t1", day: 2 })),
  ];

  it("2/3 y 3/2 son válidos y completos", () => {
    expect(checkGrantLimits([], five(2))).toEqual([]);
    expect(checkGrantLimits([], five(3))).toEqual([]);
    expect(isCompleteSplit(2, 3)).toBe(true);
    expect(isCompleteSplit(3, 2)).toBe(true);
    expect(isCompleteSplit(2, 2)).toBe(false);
    expect(isCompleteSplit(1, 4)).toBe(false);
  });

  it("rechaza una sexta tarjeta y una cuarta en la misma jornada", () => {
    expect(checkGrantLimits(five(2), [{ teamId: "t1", day: 1 }])).toEqual([
      { kind: "TEAM_TOTAL", teamId: "t1" },
    ]);
    expect(checkGrantLimits(five(3).slice(0, 3), [{ teamId: "t1", day: 1 }])).toEqual([
      { kind: "TEAM_DAY", teamId: "t1", day: 1 },
    ]);
  });

  it("el estado de una tarjeta: sin entregar, disponible, usada, vencida o anulada", () => {
    const none = new Set<number>();
    expect(grantState({ status: "ASSIGNED", day: 1 }, false, none)).toBe("ASSIGNED");
    expect(grantState({ status: "DELIVERED", day: 1 }, false, none)).toBe("DELIVERED");
    expect(grantState({ status: "DELIVERED", day: 1 }, true, new Set([1]))).toBe("USED");
    expect(grantState({ status: "DELIVERED", day: 1 }, false, new Set([1]))).toBe("EXPIRED");
    expect(grantState({ status: "VOIDED", day: 1 }, false, none)).toBe("VOIDED");
  });

  it("una jornada termina por sus rotaciones, no por el reloj", () => {
    const pending = [
      { day: 1, status: "CLOSED" as const },
      { day: 1, status: "ACTIVE" as const },
      { day: 2, status: "PENDING" as const },
    ];
    expect([...finishedDays("LIVE", pending)]).toEqual([]);
    expect([
      ...finishedDays("LIVE", [
        { day: 1, status: "CLOSED" },
        { day: 2, status: "ACTIVE" },
      ]),
    ]).toEqual([1]);
    expect([...finishedDays("FINISHED", pending)].sort()).toEqual([1, 2]);
  });
});

describe("hoja de reparto", () => {
  const teams = [
    { id: "t1", number: 1, name: "Herederos del Rayo" },
    { id: "t2", number: 2, name: "Caja de Pandora" },
  ];

  it("lee el poder por su nombre o uno corto, y la jornada por día o número", () => {
    expect(parsePower("Multiplicador x2")).toBe("DOUBLE_POINTS");
    expect(parsePower("x2")).toBe("DOUBLE_POINTS");
    expect(parsePower("El adversario empieza 1 min. tarde")).toBe("LATE_START");
    expect(parsePower("CAMBIO DE RESULTADOS")).toBe("RESULT_SWAP");
    expect(parsePower("un-jugador-menos")).toBe("ONE_PLAYER_DOWN");
    expect(parsePower("Súper poder")).toBeUndefined();
    expect(parseDay("Jueves")).toBe(1);
    expect(parseDay("Día 2")).toBe(2);
    expect(parseDay("sábado")).toBeUndefined();
  });

  it("entra con encabezado, por número o nombre de equipo", () => {
    const text = [
      "Equipo\tPoder\tJornada",
      "1\tMultiplicador x2\tjueves",
      "Equipo 1\tCancelar poder\tJueves",
      "Caja de pandora\tCambio de resultados\tviernes",
    ].join("\n");
    expect(parsePowerSheet(text, teams)).toEqual({
      grants: [
        { teamId: "t1", power: "DOUBLE_POINTS", day: 1 },
        { teamId: "t1", power: "CANCEL_POWER", day: 1 },
        { teamId: "t2", power: "RESULT_SWAP", day: 2 },
      ],
      problems: [],
    });
  });

  it("todo o nada: devuelve cada problema con su línea", () => {
    const text = [
      "1\tx2",
      "1\tx2\tjueves\textra",
      "9\tx2\tjueves",
      "2\tpoderoso\tjueves",
      "2\tx2\tsábado",
    ].join("\n");
    expect(parsePowerSheet(text, teams)).toEqual({
      grants: null,
      problems: [
        { kind: "COLUMNS", line: 1 },
        { kind: "EXTRA_COLUMNS", line: 2 },
        { kind: "TEAM", line: 3, team: "9" },
        { kind: "POWER", line: 4, power: "poderoso" },
        { kind: "DAY", line: 5, day: "sábado" },
      ],
    });
    expect(parsePowerSheet("\n  \n", teams).problems).toEqual([{ kind: "EMPTY" }]);
  });

  it("cuenta las tarjetas que ya tiene cada equipo", () => {
    const existing = [
      { teamId: "t1", day: 1 },
      { teamId: "t1", day: 1 },
      { teamId: "t1", day: 1 },
    ];
    expect(parsePowerSheet("1\tx2\tjueves", teams, existing).problems).toEqual([
      { kind: "TEAM_DAY", team: "1 Herederos del Rayo", day: 1 },
    ]);
  });
});
