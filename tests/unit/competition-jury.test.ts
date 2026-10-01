import { describe, expect, it } from "vitest";
import { juryRanking, parseJurySheet, podiumTie } from "@/modules/competition/domain/jury-pure";
import { THE_CHALLENGE_RUBRIC } from "@/modules/competition/domain/rubric-pure";

// Los jurados de The Challenge (ADR-103): la tabla de cada jurado y el orden con el promedio. Los
// nombres de los equipos son sintéticos.

const teams = [
  { id: "t1", number: 1, name: "Herederos de Prueba" },
  { id: "t2", number: 2, name: "Guardianes de Ensayo" },
  { id: "t3", number: 3, name: "Centauros de Prueba" },
  { id: "t4", number: 4, name: "Sirenas de Ensayo" },
];
const criteria = THE_CHALLENGE_RUBRIC.criteria;

describe("tabla de un jurado", () => {
  it("lee la hoja Consolidado de la OE tal cual, con #REF!, total, nivel y promedio", () => {
    const text = [
      "THE CHALLENGE — EAFIT\tTHE CHALLENGE — EAFIT",
      "Peso →\t\t\t20%\t20%\t0.2\t0.2\t0.2\tPonderado",
      "#\tEquipo\tTalento presentado\tImpacto\tIntegración\tEstructura\tProducción\tNormas\tTotal (0–100)\tNivel",
      "1\t\tBaile\t9\t8\t10\t7\t10\t#REF!\tBueno",
      "2\tGuardianes de Ensayo\tTeatro\t6\t6\t6\t6\t6\t60\tRegular",
      "3\t\t\t\t\t\t\t\t0\tPor mejorar",
      "PROMEDIO GENERAL\t\t\t7.5\t7\t8\t6.5\t8\t3.33",
    ].join("\n");
    const { rows, problems } = parseJurySheet(text, teams, 5);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { teamId: "t1", scores: [9, 8, 10, 7, 10] },
      { teamId: "t2", scores: [6, 6, 6, 6, 6] },
    ]);
  });

  it("acepta el equipo por nombre o «Equipo N», con punto y coma", () => {
    const { rows } = parseJurySheet("Sirenas de Ensayo;10;10;9;9;8\nEquipo 3;5;5;5;5;5", teams, 5);
    expect(rows?.map((row) => row.teamId)).toEqual(["t4", "t3"]);
  });

  it("junta los problemas con su línea y no devuelve filas", () => {
    const text = [
      "1\tBaile\t9\t8\t10",
      "2\tTeatro\t9\t8\t11\t7\t10",
      "3\tCanto\t9\t8\t7,5\t7\t10",
      "Equipo inventado\tMagia\t9\t8\t7\t7\t10",
      "4\tCirco\t9\t8\t7\t7\t10",
      "Sirenas de Ensayo\tMagia\t9\t8\t7\t7\t10",
    ].join("\n");
    const { rows, problems } = parseJurySheet(text, teams, 5);
    expect(rows).toBeNull();
    expect(problems).toEqual([
      { kind: "MISSING", line: 1 },
      { kind: "SCORE", line: 2, score: "11" },
      { kind: "SCORE", line: 3, score: "7,5" },
      { kind: "TEAM", line: 4, team: "Equipo inventado" },
      { kind: "TWICE", line: 6, team: "4 Sirenas de Ensayo", other: 5 },
    ]);
  });

  it("una tabla sin notas está vacía", () => {
    expect(parseJurySheet("#\tEquipo\n1\t\n2\t", teams, 5).problems).toEqual([{ kind: "EMPTY" }]);
  });
});

describe("orden de los jurados", () => {
  it("promedia cada criterio, lleva el total a 100 y ordena", () => {
    const ranking = juryRanking(
      criteria,
      ["t1", "t2", "t3", "t4"],
      [
        { teamId: "t1", scores: [10, 10, 10, 10, 10] },
        { teamId: "t1", scores: [8, 8, 8, 8, 8] },
        { teamId: "t2", scores: [10, 10, 10, 10, 10] },
        { teamId: "t3", scores: [5, 6, 7, 8, 9] },
      ],
    );
    expect(ranking.map((row) => [row.teamId, row.rank, row.judges])).toEqual([
      ["t2", 1, 1],
      ["t1", 2, 2],
      ["t3", 3, 1],
      ["t4", null, 0],
    ]);
    expect(ranking[1]?.averages).toEqual([9, 9, 9, 9, 9]);
    expect(ranking[1]?.total).toBeCloseTo(90);
    expect(ranking[0]?.level).toBe("EXCELLENT");
    // (5·20 + 6·20 + 7·20 + 8·15 + 9·10) · 100 / (10 · 85)
    expect(ranking[2]?.total).toBeCloseTo((570 * 100) / 850);
    expect(ranking[3]).toMatchObject({ averages: null, total: null, level: null });
    expect(podiumTie(ranking)).toBe(false);
  });

  it("los empates comparten puesto y se avisan si tocan el podio", () => {
    const ranking = juryRanking(
      criteria,
      ["t1", "t2", "t3", "t4"],
      [
        { teamId: "t1", scores: [9, 9, 9, 9, 9] },
        { teamId: "t2", scores: [8, 8, 8, 8, 8] },
        { teamId: "t3", scores: [8, 8, 8, 8, 8] },
        { teamId: "t4", scores: [7, 7, 7, 7, 7] },
      ],
    );
    expect(ranking.map((row) => [row.teamId, row.rank, row.tied])).toEqual([
      ["t1", 1, false],
      ["t2", 2, true],
      ["t3", 2, true],
      ["t4", 4, false],
    ]);
    expect(podiumTie(ranking)).toBe(true);
  });
});
