import { describe, expect, it } from "vitest";
import {
  buildSeedSchedule,
  type Day,
  dayOneRounds,
  dayTwoRounds,
  findStarterAdders,
  pairCountKey,
  pairCounts,
  type ScheduleRotation,
  type SeedPairing,
  STARTER_ADDERS_15,
  validateSchedule,
} from "@/modules/competition/domain/schedule-pure";

// Calendario de The Games (ADR-089 regla 8): 30 equipos, 15 bases y hasta 15 rotaciones por
// jornada; cada equipo pasa una vez por cada base y se repite a lo sumo un rival.

function assertDay(rounds: SeedPairing[][], n: number): void {
  const visited = new Map<number, Set<number>>();
  for (const round of rounds) {
    const playing = new Set<number>();
    const bases = new Set<number>();
    expect(round).toHaveLength(n);
    for (const { base, a, b } of round) {
      expect(a).not.toBe(b);
      expect(base).toBeGreaterThanOrEqual(0);
      expect(base).toBeLessThan(n);
      expect(bases.has(base)).toBe(false);
      bases.add(base);
      for (const team of [a, b]) {
        expect(team).toBeGreaterThanOrEqual(1);
        expect(team).toBeLessThanOrEqual(2 * n);
        expect(playing.has(team)).toBe(false);
        playing.add(team);
        const seen = visited.get(team) ?? new Set<number>();
        expect(seen.has(base)).toBe(false);
        seen.add(base);
        visited.set(team, seen);
      }
    }
    expect(playing.size).toBe(2 * n);
  }
}

function rematchesPerTeam(rounds: SeedPairing[][]): Map<number, number> {
  const pairs = new Map<string, number>();
  for (const { a, b } of rounds.flat()) {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  const perTeam = new Map<number, number>();
  for (const [key, times] of pairs) {
    if (times < 2) continue;
    for (const team of key.split("-").map(Number)) {
      perTeam.set(team, (perTeam.get(team) ?? 0) + times - 1);
    }
  }
  return perTeam;
}

describe("jornada 1", () => {
  it("la primera rotación es 1–30, 2–29 … 15–16", () => {
    const [first] = dayOneRounds(15);
    const pairs = (first ?? []).map(({ a, b }) => [Math.min(a, b), Math.max(a, b)]);
    expect(pairs.sort((x, y) => (x[0] ?? 0) - (y[0] ?? 0))).toEqual(
      Array.from({ length: 15 }, (_, i) => [i + 1, 30 - i]),
    );
  });

  it("15 rotaciones: todos juegan, cada base una vez por rotación y por equipo, sin revanchas", () => {
    const rounds = dayOneRounds(15);
    expect(rounds).toHaveLength(15);
    assertDay(rounds, 15);
    expect(rematchesPerTeam(rounds).size).toBe(0);
  });

  it("cualquier número de rotaciones conserva las restricciones", () => {
    for (let r = 1; r <= 15; r++) assertDay(dayOneRounds(15, r), 15);
  });
});

describe("jornada 2 y las dos jornadas juntas", () => {
  it("la construcción de 15 bases cumple todo", () => {
    for (let r1 = 1; r1 <= 15; r1++) {
      const rounds = dayTwoRounds(15, r1);
      assertDay(rounds, 15);
    }
  });

  it("con 15 rotaciones el jueves, cada equipo tiene exactamente una revancha (la inevitable)", () => {
    const schedule = buildSeedSchedule(15, { day1: 15, day2: 15 });
    const all = [...schedule[1], ...schedule[2]];
    const perTeam = rematchesPerTeam(all);
    expect(perTeam.size).toBe(30);
    expect([...perTeam.values()].every((times) => times === 1)).toBe(true);
    const distinct = new Set(all.flat().map(({ a, b }) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
    expect(distinct.size).toBe(435);
  });

  it("con menos de 15 rotaciones el jueves no hay ninguna revancha", () => {
    for (const r1 of [1, 4, 6, 8, 10, 14]) {
      const schedule = buildSeedSchedule(15, { day1: r1, day2: 15 });
      expect(rematchesPerTeam([...schedule[1], ...schedule[2]]).size).toBe(0);
    }
  });

  it("es determinista", () => {
    expect(buildSeedSchedule(15, { day1: 15, day2: 15 })).toEqual(
      buildSeedSchedule(15, { day1: 15, day2: 15 }),
    );
  });

  it("la búsqueda encuentra construcciones para otros tamaños impares, salvo 9", () => {
    for (const n of [7, 11, 13]) {
      const construction = findStarterAdders(n);
      expect(construction).not.toBeNull();
      for (const r1 of [1, n]) assertDay(dayTwoRounds(n, r1, n, construction), n);
    }
    expect(findStarterAdders(9)).toBeNull();
    expect(() => dayTwoRounds(9, 9)).toThrow(RangeError);
  });

  it("la construcción fija de 15 es un starter válido", () => {
    const covered = STARTER_ADDERS_15.starter.flat().sort((x, y) => x - y);
    expect(covered).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    const all = [...STARTER_ADDERS_15.addersA, ...STARTER_ADDERS_15.addersB].sort((x, y) => x - y);
    expect(all).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it("rechaza tamaños y rotaciones fuera de rango", () => {
    expect(() => dayOneRounds(14)).toThrow(RangeError);
    expect(() => dayOneRounds(15, 0)).toThrow(RangeError);
    expect(() => dayOneRounds(15, 16)).toThrow(RangeError);
  });
});

describe("validador", () => {
  const teams = [
    { id: "t1", number: 1, active: true },
    { id: "t2", number: 2, active: true },
    { id: "t3", number: 3, active: true },
    { id: "t4", number: 4, active: false },
  ];
  const bases = [
    { id: "b1", day: 1 as Day },
    { id: "b2", day: 1 as Day },
    { id: "c1", day: 2 as Day },
  ];

  it("un calendario limpio no tiene errores", () => {
    const rotations: ScheduleRotation[] = [
      { day: 1, number: 1, matchups: [{ baseId: "b1", teamAId: "t1", teamBId: "t2" }] },
    ];
    const report = validateSchedule(rotations, teams.slice(0, 2), bases);
    expect(report).toEqual({ errors: [], warnings: [] });
  });

  it("marca como error lo que no se puede jugar", () => {
    const rotations: ScheduleRotation[] = [
      {
        day: 1,
        number: 1,
        matchups: [
          { baseId: "b1", teamAId: "t1", teamBId: "t1" },
          { baseId: "b1", teamAId: "t2", teamBId: "t3" },
          { baseId: "c1", teamAId: "t3", teamBId: "t4" },
          { baseId: "b2", teamAId: "t2", teamBId: "zz" },
        ],
      },
    ];
    const kinds = validateSchedule(rotations, teams, bases).errors.map((issue) => issue.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "SELF_MATCH",
        "BASE_TWICE_IN_ROTATION",
        "BASE_OF_OTHER_DAY",
        "WITHDRAWN_TEAM",
        "UNKNOWN_TEAM",
        "TEAM_TWICE_IN_ROTATION",
      ]),
    );
  });

  it("advierte revanchas y equipos sin jugar", () => {
    const rotations: ScheduleRotation[] = [
      { day: 1, number: 1, matchups: [{ baseId: "b1", teamAId: "t1", teamBId: "t2" }] },
      { day: 1, number: 2, matchups: [{ baseId: "b2", teamAId: "t2", teamBId: "t1" }] },
    ];
    const report = validateSchedule(rotations, teams.slice(0, 3), bases);
    expect(report.errors).toEqual([]);
    const kinds = report.warnings.map((issue) => issue.kind);
    expect(kinds.filter((kind) => kind === "TEAM_IDLE")).toHaveLength(2);
    expect(kinds).toContain("REPEATED_PAIR");
    expect(pairCounts(rotations).get(pairCountKey("t2", "t1"))).toBe(2);
  });

  it("un equipo que repite base en la jornada es error: todos juegan todas las bases (ADR-093)", () => {
    const rotations: ScheduleRotation[] = [
      { day: 1, number: 1, matchups: [{ baseId: "b1", teamAId: "t1", teamBId: "t2" }] },
      { day: 1, number: 2, matchups: [{ baseId: "b1", teamAId: "t3", teamBId: "t1" }] },
    ];
    const report = validateSchedule(rotations, teams.slice(0, 3), bases);
    const repeated = report.errors.filter((issue) => issue.kind === "BASE_REPEATED_IN_DAY");
    expect(repeated).toEqual([
      { kind: "BASE_REPEATED_IN_DAY", day: 1, teamId: "t1", baseId: "b1", times: 2 },
    ]);
    expect(report.warnings.some((issue) => issue.kind === "BASE_REPEATED_IN_DAY")).toBe(false);
  });
});
