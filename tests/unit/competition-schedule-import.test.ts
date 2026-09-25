import { describe, expect, it } from "vitest";
import {
  cleanTeamName,
  parseScheduleSheet,
  teamKey,
} from "@/modules/competition/domain/schedule-import-pure";
import { dayOneRounds } from "@/modules/competition/domain/schedule-pure";

// La hoja de rotaciones de la OE (ADR-094): una fila por equipo y rotación con Equipo, Rotación,
// Base y Rival. Los nombres son sintéticos.

const name = (seed: number) => `Equipo de prueba ${seed}`;

/** Una jornada completa como la entrega la OE: agrupada por equipo, con las dos filas de cada cruce. */
function sheetOf(
  separator = "\t",
  options: { header?: boolean; basePrefix?: boolean; rotations?: number } = {},
) {
  const rounds = dayOneRounds(15, options.rotations ?? 15);
  const rows: { team: number; rotation: number; base: number; rival: number }[] = [];
  for (const [index, round] of rounds.entries()) {
    for (const { base, a, b } of round) {
      rows.push({ team: a, rotation: index + 1, base: base + 1, rival: b });
      rows.push({ team: b, rotation: index + 1, base: base + 1, rival: a });
    }
  }
  rows.sort((x, y) => x.team - y.team || x.rotation - y.rotation);
  const lines = rows.map((row) =>
    [
      name(row.team),
      row.rotation,
      options.basePrefix ? `Base ${row.base}` : row.base,
      name(row.rival),
    ].join(separator),
  );
  return [...(options.header === false ? [] : ["Equipo\tRotacion\tBase\tRival"]), ...lines].join(
    "\r\n",
  );
}

describe("lector de la hoja de rotaciones", () => {
  it("lee una jornada de 30 equipos y 15 bases pegada desde la hoja", () => {
    const { sheet, problems } = parseScheduleSheet(sheetOf());
    expect(problems).toEqual([]);
    expect(sheet?.teams).toHaveLength(30);
    expect(sheet?.teams[0]?.name).toBe(name(1));
    expect(sheet?.teams[29]?.name).toBe(name(30));
    expect(sheet?.bases).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(sheet?.firstRotation).toBe(1);
    expect(sheet?.rotations).toHaveLength(15);
    for (const rotation of sheet?.rotations ?? []) {
      expect(rotation).toHaveLength(15);
      const teams = rotation.flatMap((matchup) => [matchup.a, matchup.b]);
      expect(new Set(teams).size).toBe(30);
    }
    // El primero de cada cruce es el que aparece antes en la hoja.
    expect(sheet?.rotations[0]?.find((matchup) => matchup.base === 1)).toEqual({
      base: 1,
      a: teamKey(name(1)),
      b: teamKey(name(30)),
    });
  });

  it("acepta coma o punto y coma, sin encabezado y con la base como «Base N»", () => {
    for (const separator of [",", ";"]) {
      const { sheet, problems } = parseScheduleSheet(
        sheetOf(separator, { header: false, basePrefix: true }),
      );
      expect(problems).toEqual([]);
      expect(sheet?.rotations).toHaveLength(15);
    }
  });

  it("basta con una fila por cruce", () => {
    const text = [
      "Alfa\t1\t1\tBeta",
      "Gama\t1\t2\tDelta",
      "Alfa\t2\t2\tDelta",
      "Beta\t2\t1\tGama",
    ].join("\n");
    const { sheet, problems } = parseScheduleSheet(text);
    expect(problems).toEqual([]);
    expect(sheet?.teams.map((team) => team.name)).toEqual(["Alfa", "Gama", "Beta", "Delta"]);
    expect(sheet?.rotations[1]).toEqual([
      { base: 1, a: "gama", b: "beta" },
      { base: 2, a: "alfa", b: "delta" },
    ]);
  });

  it("compara los nombres sin mayúsculas, tildes ni espacios de más", () => {
    expect(teamKey("  Los  Héroes de TROYA ")).toBe("los heroes de troya");
    expect(cleanTeamName('"Guardianes  Arcadia"')).toBe("Guardianes Arcadia");
    const { sheet, problems } = parseScheduleSheet(
      ["Sátiros\t1\t1\tNinfas", "ninfas \t1\t1\tsatiros"].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(sheet?.teams.map((team) => team.name)).toEqual(["Sátiros", "ninfas"]);
  });

  it("rechaza la fila del rival que no coincide", () => {
    const text = ["Alfa\t1\t1\tBeta", "Beta\t1\t2\tAlfa"].join("\n");
    expect(parseScheduleSheet(text)).toEqual({
      sheet: null,
      problems: [{ kind: "TEAM_TWICE", line: 2, team: "Beta", rotation: 1 }],
    });
  });

  it("rechaza dos cruces en la misma base de una rotación", () => {
    const text = ["Alfa\t1\t1\tBeta", "Gama\t1\t1\tDelta"].join("\n");
    expect(parseScheduleSheet(text).problems).toEqual([
      { kind: "BASE_TWICE", line: 2, base: 1, rotation: 1 },
    ]);
  });

  it("señala cada fila mal escrita con su línea", () => {
    const text = [
      "Equipo\tRotacion\tBase\tRival",
      "Alfa\t1\t1",
      "Alfa\tuno\t1\tBeta",
      "Alfa\t1\tcancha\tBeta",
      "Alfa\t1\t1\talfa",
      "Alfa\t100\t1\tBeta",
    ].join("\n");
    expect(parseScheduleSheet(text).problems).toEqual([
      { kind: "COLUMNS", line: 2 },
      { kind: "ROTATION", line: 3 },
      { kind: "BASE", line: 4 },
      { kind: "SELF_MATCH", line: 5, team: "Alfa" },
      { kind: "ROTATION", line: 6 },
    ]);
  });

  it("conserva la numeración de la hoja cuando sigue a la jornada anterior", () => {
    const text = [
      "Equipo\tRotacion\tBase\tRival\tEnfrentamiento repetido",
      "Alfa\t16\t1\tBeta\tNo (nuevo)",
      "Gama\t16\t2\tDelta\tNo (nuevo)",
      "Alfa\t17\t2\tGama\tSi (ya jugaron)",
      "Beta\t17\t1\tDelta\tNo (nuevo)",
    ].join("\n");
    const { sheet, problems } = parseScheduleSheet(text);
    expect(problems).toEqual([]);
    expect(sheet?.firstRotation).toBe(16);
    expect(sheet?.rotations).toHaveLength(2);
    expect(sheet?.rotations[1]).toEqual([
      { base: 1, a: "beta", b: "delta" },
      { base: 2, a: "alfa", b: "gama" },
    ]);
  });

  it("rechaza una rotación que falta y una hoja vacía", () => {
    const text = ["Alfa\t1\t1\tBeta", "Alfa\t3\t1\tBeta"].join("\n");
    expect(parseScheduleSheet(text).problems).toEqual([{ kind: "MISSING_ROTATION", rotation: 2 }]);
    expect(parseScheduleSheet("\n  \n").problems).toEqual([{ kind: "EMPTY" }]);
    expect(parseScheduleSheet("Equipo\tRotacion\tBase\tRival\n").problems).toEqual([
      { kind: "EMPTY" },
    ]);
  });
});
