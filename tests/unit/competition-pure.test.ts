import { describe, expect, it } from "vitest";
import {
  balanceOf,
  marketState,
  poolByOption,
  settleParimutuel,
} from "@/modules/competition/domain/betting-pure";
import {
  formatTeamCode,
  generateTeamCode,
  hashTeamCode,
  lockAfterFailure,
  normalizeTeamCode,
  TEAM_CODE_LOCK_MS,
  teamCodeMatches,
} from "@/modules/competition/domain/codes-pure";
import { extraDelta, isOutcome, pointsFor } from "@/modules/competition/domain/scoring-pure";
import { computeStandings } from "@/modules/competition/domain/standings-pure";

// Reglas de The Games sin I/O (ADR-089, ADR-091): puntos, posiciones, bolsa y códigos.

describe("puntos por enfrentamiento", () => {
  it("normal 1000/500/0 y macro (inflables) 2000/1000/0", () => {
    expect(pointsFor("NORMAL", "A_WIN")).toEqual({ a: 1000, b: 0 });
    expect(pointsFor("NORMAL", "B_WIN")).toEqual({ a: 0, b: 1000 });
    expect(pointsFor("NORMAL", "DRAW")).toEqual({ a: 500, b: 500 });
    expect(pointsFor("MACRO", "A_WIN")).toEqual({ a: 2000, b: 0 });
    expect(pointsFor("MACRO", "DRAW")).toEqual({ a: 1000, b: 1000 });
  });

  it("solo acepta los tres desenlaces y la competencia extra inserta la diferencia", () => {
    expect(isOutcome("DRAW")).toBe(true);
    expect(isOutcome("draw")).toBe(false);
    expect(extraDelta(300, 500)).toBe(200);
    expect(extraDelta(500, 500)).toBe(0);
    expect(extraDelta(500, 200)).toBe(-300);
  });
});

describe("posiciones", () => {
  const teams = [
    { id: "a", number: 1, name: "Uno", color: null, active: true },
    { id: "b", number: 2, name: "Dos", color: "#aa0000", active: true },
    { id: "c", number: 3, name: "Tres", color: null, active: true },
    { id: "d", number: 4, name: "Cuatro", color: null, active: false },
  ];
  const points = [
    { teamId: "a", day: 1 as const, points: 1000 },
    { teamId: "b", day: 1 as const, points: 500 },
    { teamId: "c", day: 1 as const, points: 500 },
    { teamId: "c", day: 2 as const, points: 1000 },
    { teamId: "d", day: 1 as const, points: 9000 },
  ];
  const results = [
    { day: 1 as const, teamAId: "a", teamBId: "d", outcome: "A_WIN" as const },
    { day: 1 as const, teamAId: "b", teamBId: "c", outcome: "DRAW" as const },
    { day: 2 as const, teamAId: "c", teamBId: "a", outcome: "A_WIN" as const },
  ];

  it("sin desempate: el puesto se comparte y el orden visual sigue el número", () => {
    const day1 = computeStandings(teams, points, results, 1);
    expect(day1.map((row) => [row.rank, row.teamId, row.points])).toEqual([
      [1, "a", 1000],
      [2, "b", 500],
      [2, "c", 500],
    ]);
  });

  it("la general suma las dos jornadas y cuenta victorias, empates y derrotas", () => {
    const overall = computeStandings(teams, points, results, "overall");
    expect(overall.map((row) => [row.rank, row.teamId, row.points])).toEqual([
      [1, "c", 1500],
      [2, "a", 1000],
      [3, "b", 500],
    ]);
    expect(overall.find((row) => row.teamId === "a")).toMatchObject({
      played: 2,
      wins: 1,
      losses: 1,
      draws: 0,
    });
    expect(overall.some((row) => row.teamId === "d")).toBe(false);
  });
});

describe("apuestas", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 2, 12, minute));

  it("una apuesta abierta cuyo cierre pasó se lee cerrada", () => {
    expect(marketState({ status: "OPEN", closesAt: at(10) }, at(9))).toBe("OPEN");
    expect(marketState({ status: "OPEN", closesAt: at(10) }, at(10))).toBe("CLOSED");
    expect(marketState({ status: "OPEN", closesAt: null }, at(59))).toBe("OPEN");
    expect(marketState({ status: "DRAFT", closesAt: at(0) }, at(59))).toBe("DRAFT");
  });

  it("reparte la bolsa entre los acertantes y conserva el total", () => {
    const bets = [
      { id: "1", teamId: "a", pickTeamId: "x", stake: 100, createdAt: at(1) },
      { id: "2", teamId: "b", pickTeamId: "x", stake: 300, createdAt: at(2) },
      { id: "3", teamId: "c", pickTeamId: "y", stake: 200, createdAt: at(3) },
    ];
    const settlement = settleParimutuel(bets, "x");
    expect(settlement).toEqual([
      { betId: "1", teamId: "a", kind: "PAYOUT", amount: 150 },
      { betId: "2", teamId: "b", kind: "PAYOUT", amount: 450 },
    ]);
    expect(settlement.reduce((sum, row) => sum + row.amount, 0)).toBe(600);
  });

  it("si nadie acierta o se cancela, devuelve todo", () => {
    const bets = [
      { id: "1", teamId: "a", pickTeamId: "x", stake: 100, createdAt: at(1) },
      { id: "2", teamId: "b", pickTeamId: "y", stake: 50, createdAt: at(2) },
    ];
    expect(settleParimutuel(bets, "z").map((row) => [row.kind, row.amount])).toEqual([
      ["REFUND", 100],
      ["REFUND", 50],
    ]);
    expect(settleParimutuel(bets, null).every((row) => row.kind === "REFUND")).toBe(true);
    expect(settleParimutuel([], "x")).toEqual([]);
  });

  it("el sobrante del redondeo va por mayor resto y la bolsa siempre cuadra", () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let trial = 0; trial < 200; trial++) {
      const options = ["x", "y", "z"];
      const bets = Array.from({ length: 2 + (next() % 20) }, (_, i) => ({
        id: `b${i}`,
        teamId: `t${i}`,
        pickTeamId: options[next() % 3] as string,
        stake: 1 + (next() % 997),
        createdAt: at(i % 60),
      }));
      const pool = bets.reduce((sum, bet) => sum + bet.stake, 0);
      const paid = settleParimutuel(bets, "x").reduce((sum, row) => sum + row.amount, 0);
      expect(paid).toBe(pool);
    }
    const tie = [
      { id: "1", teamId: "a", pickTeamId: "x", stake: 1, createdAt: at(1) },
      { id: "2", teamId: "b", pickTeamId: "x", stake: 1, createdAt: at(2) },
      { id: "3", teamId: "c", pickTeamId: "y", stake: 1, createdAt: at(3) },
    ];
    expect(settleParimutuel(tie, "x").map((row) => row.amount)).toEqual([2, 1]);
  });

  it("rechaza valores inválidos y suma saldos y bolsas", () => {
    expect(() =>
      settleParimutuel(
        [{ id: "1", teamId: "a", pickTeamId: "x", stake: 0, createdAt: at(1) }],
        "x",
      ),
    ).toThrow(RangeError);
    expect(balanceOf([{ amount: 1000 }, { amount: -200 }, { amount: 350 }])).toBe(1150);
    expect(
      poolByOption([
        { pickTeamId: "x", stake: 10 },
        { pickTeamId: "x", stake: 5 },
      ]).get("x"),
    ).toBe(15);
  });
});

describe("código de equipo", () => {
  it("genera ocho caracteres Crockford y los normaliza al leerlos", () => {
    const code = generateTeamCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(normalizeTeamCode(formatTeamCode(code).toLowerCase())).toBe(code);
    expect(normalizeTeamCode("abcd-efoi")).toBe("ABCDEF01");
    expect(normalizeTeamCode("ABCD-EFGU")).toBeNull();
    expect(normalizeTeamCode("ABC")).toBeNull();
  });

  it("compara con el hash y bloquea tras cinco fallos", () => {
    const hash = hashTeamCode("secreto", "team-1", "ABCDEF01");
    expect(teamCodeMatches(hash, "secreto", "team-1", "abcd-efoi")).toBe(true);
    expect(teamCodeMatches(hash, "secreto", "team-2", "ABCDEF01")).toBe(false);
    expect(teamCodeMatches(hash, "otro", "team-1", "ABCDEF01")).toBe(false);
    expect(teamCodeMatches(hash, "secreto", "team-1", "no")).toBe(false);
    const now = new Date(Date.UTC(2026, 9, 1));
    expect(lockAfterFailure(4, now)).toBeNull();
    expect(lockAfterFailure(5, now)?.getTime()).toBe(now.getTime() + TEAM_CODE_LOCK_MS);
  });
});
