import { describe, expect, it } from "vitest";
import {
  baseState,
  delayRanking,
  judgeNudges,
  lastToRecord,
  minutesBetween,
  rotationChecklist,
  type TrackingBase,
  type TrackingMatchup,
  type TrackingRotation,
} from "@/modules/competition/domain/tracking-pure";

// El seguimiento del registro (ADR-105): estados de cada base, la última en registrar, quién se demora
// más y el aviso al líder. Cuenta el primer registro, en minutos desde el inicio de la rotación.

const at = (minute: number) => new Date(Date.UTC(2026, 9, 2, 15, minute));

const rotation = (
  id: string,
  number: number,
  status: TrackingRotation["status"],
  startMinute: number | null,
  day: 1 | 2 = 2,
): TrackingRotation => ({
  id,
  day,
  number,
  status,
  startsAt: startMinute === null ? null : at(startMinute),
});

const base = (id: string, orderIndex: number, judgeIds: string[] = [`juez-${id}`]) => ({
  id,
  day: 2 as const,
  orderIndex,
  judgeIds,
});

const matchup = (
  id: string,
  rotationId: string,
  baseId: string,
  first: { minute: number; by: string } | null,
  extra: Partial<TrackingMatchup> = {},
): TrackingMatchup => ({
  id,
  rotationId,
  baseId,
  startedAt: null,
  recorded: first !== null,
  firstRecordedAt: first ? at(first.minute) : null,
  firstRecordedById: first?.by ?? null,
  ...extra,
});

const bases = new Map<string, TrackingBase & { day: 1 | 2 }>([
  ["b1", base("b1", 0)],
  ["b2", base("b2", 1)],
  ["b3", base("b3", 2)],
]);

describe("seguimiento del registro", () => {
  it("cuenta minutos enteros y no los cuenta hacia atrás ni sin hora", () => {
    expect(minutesBetween(at(0), at(12))).toBe(12);
    expect(minutesBetween(at(0), new Date(at(0).getTime() + 89_000))).toBe(1);
    expect(minutesBetween(at(10), at(5))).toBeNull();
    expect(minutesBetween(null, at(5))).toBeNull();
  });

  it("da los tres estados de una base y quién registró", () => {
    const r = rotation("r16", 16, "ACTIVE", 0);
    expect(baseState(matchup("m1", "r16", "b1", null), r, bases.get("b1"))).toEqual({
      kind: "NOT_STARTED",
    });
    expect(
      baseState(matchup("m1", "r16", "b1", null, { startedAt: at(3) }), r, bases.get("b1")),
    ).toEqual({ kind: "PLAYING", startedAt: at(3) });
    expect(
      baseState(matchup("m1", "r16", "b1", { minute: 14, by: "juez-b1" }), r, bases.get("b1")),
    ).toEqual({ kind: "RECORDED", at: at(14), minutes: 14, by: "JUDGE" });
    expect(
      baseState(matchup("m1", "r16", "b1", { minute: 14, by: "operador" }), r, bases.get("b1")),
    ).toMatchObject({ kind: "RECORDED", by: "OPERATION" });
  });

  it("una base anulada vuelve a faltar aunque guarde su primer registro", () => {
    const voided = matchup("m1", "r16", "b1", { minute: 5, by: "juez-b1" }, { recorded: false });
    expect(baseState(voided, rotation("r16", 16, "ACTIVE", 0), bases.get("b1")).kind).toBe(
      "NOT_STARTED",
    );
  });

  it("la lista pone primero las bases que faltan, cada grupo en el orden de las bases", () => {
    const r = rotation("r16", 16, "ACTIVE", 0);
    const list = rotationChecklist(
      r,
      [
        matchup("m1", "r16", "b1", { minute: 9, by: "juez-b1" }),
        matchup("m3", "r16", "b3", null, { startedAt: at(2) }),
        matchup("m2", "r16", "b2", null),
        matchup("otra", "r17", "b1", null),
      ],
      bases,
    );
    expect(list.rows.map((row) => row.baseId)).toEqual(["b2", "b3", "b1"]);
    expect(list).toMatchObject({ recorded: 1, total: 3 });
  });

  it("la última de una rotación cerrada es la que registró más tarde, o la que quedó debiendo", () => {
    const all = [
      matchup("m1", "r16", "b1", { minute: 9, by: "juez-b1" }),
      matchup("m2", "r16", "b2", { minute: 20, by: "juez-b2" }),
      matchup("m3", "r16", "b3", { minute: 12, by: "juez-b3" }),
    ];
    expect([...lastToRecord(all)]).toEqual(["m2"]);
    const withDebt = [...all.slice(0, 2), matchup("m3", "r16", "b3", null)];
    expect([...lastToRecord(withDebt)]).toEqual(["m3"]);
    expect([...lastToRecord([])]).toEqual([]);
  });

  it("ordena por deudas, por lo que le dejó a la operación, por la mediana y por las veces última", () => {
    const rotations = [
      rotation("r16", 16, "CLOSED", 0),
      rotation("r17", 17, "CLOSED", 30),
      rotation("r18", 18, "ACTIVE", 60),
      rotation("r19", 19, "PENDING", null),
      rotation("r1", 1, "CLOSED", 0, 1),
    ];
    const matchups = [
      // Rotación 16: b2 registra de última; b1 y b3 temprano.
      matchup("a1", "r16", "b1", { minute: 5, by: "juez-b1" }),
      matchup("a2", "r16", "b2", { minute: 25, by: "juez-b2" }),
      matchup("a3", "r16", "b3", { minute: 8, by: "juez-b3" }),
      // Rotación 17: b3 queda debiendo; b1 lo registra la operación.
      matchup("b1", "r17", "b1", { minute: 50, by: "operador" }),
      matchup("b2", "r17", "b2", { minute: 45, by: "juez-b2" }),
      matchup("b3", "r17", "b3", null),
      // Rotación 18 en curso: lo que falta todavía no es deuda.
      matchup("c1", "r18", "b1", null),
      matchup("c2", "r18", "b2", { minute: 70, by: "juez-b2" }),
      matchup("c3", "r18", "b3", null),
    ];
    const ranking = delayRanking(2, rotations, matchups, bases);
    expect(ranking.map((row) => row.baseId)).toEqual(["b3", "b1", "b2"]);
    expect(ranking[0]).toMatchObject({ owed: 1, byJudge: 1, byOperation: 0, lastCount: 1 });
    expect(ranking[1]).toMatchObject({
      owed: 0,
      byJudge: 1,
      byOperation: 1,
      medianMinutes: 12.5,
      lastCount: 0,
    });
    expect(ranking[2]).toMatchObject({ byJudge: 3, medianMinutes: 15, lastCount: 1 });
  });

  it("la tabla de una jornada sin rotaciones jugadas trae sus bases en cero", () => {
    const ranking = delayRanking(2, [rotation("r16", 16, "PENDING", null)], [], bases);
    expect(ranking.map((row) => row.baseId)).toEqual(["b1", "b2", "b3"]);
    expect(ranking.every((row) => row.medianMinutes === null && row.owed === 0)).toBe(true);
  });

  it("una corrección no le suma demora: cuenta el primer registro", () => {
    const corrected = matchup("a1", "r16", "b1", { minute: 6, by: "juez-b1" });
    const ranking = delayRanking(2, [rotation("r16", 16, "CLOSED", 0)], [corrected], bases);
    expect(ranking.find((row) => row.baseId === "b1")?.medianMinutes).toBe(6);
  });

  it("avisa al líder solo si otra base ya registró y la suya no", () => {
    const current = [
      { id: "m1", baseId: "b1", recorded: false },
      { id: "m2", baseId: "b2", recorded: true },
      { id: "m3", baseId: "b3", recorded: false },
    ];
    expect(judgeNudges(current, ["b1"])).toEqual([{ matchupId: "m1", recorded: 1, total: 3 }]);
    expect(judgeNudges(current, ["b2"])).toEqual([]);
    expect(
      judgeNudges(
        current.map((item) => ({ ...item, recorded: false })),
        ["b1"],
      ),
    ).toEqual([]);
  });
});
