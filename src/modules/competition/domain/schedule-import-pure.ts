// La hoja de rotaciones de la OE (ADR-094): una fila por equipo y rotación con Equipo, Rotación,
// Base y Rival, pegada desde la hoja de cálculo. Aquí solo se lee y se comprueba que sea coherente;
// qué equipo y qué base de la competencia es cada nombre lo resuelve el comando.

export const MAX_SHEET_LENGTH = 200_000;
const MAX_NUMBER = 99;

export type SheetProblem =
  | { kind: "COLUMNS"; line: number }
  | { kind: "ROTATION"; line: number }
  | { kind: "BASE"; line: number }
  | { kind: "SELF_MATCH"; line: number; team: string }
  | { kind: "TEAM_TWICE"; line: number; team: string; rotation: number }
  | { kind: "BASE_TWICE"; line: number; base: number; rotation: number }
  | { kind: "MISSING_ROTATION"; rotation: number }
  | { kind: "EMPTY" };

export interface SheetTeam {
  key: string;
  name: string;
}

export interface SheetMatchup {
  base: number;
  /** Claves de equipo; `a` es el que aparece antes en la hoja. */
  a: string;
  b: string;
}

export interface ScheduleSheet {
  /** En el orden en que aparecen: primero la columna Equipo y después los que solo son rivales. */
  teams: SheetTeam[];
  /** La rotación r está en la posición r − 1. */
  rotations: SheetMatchup[][];
  /** Los números de base que usa la hoja, de menor a mayor. */
  bases: number[];
}

/** El nombre como se muestra: sin comillas de la hoja y sin espacios de más. */
export function cleanTeamName(value: string): string {
  return value
    .trim()
    .replace(/^"(.*)"$/s, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** La clave para comparar nombres: sin mayúsculas, tildes ni espacios de más. */
export function teamKey(value: string): string {
  return cleanTeamName(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function splitLine(line: string): string[] {
  const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(separator).map((cell) => cell.trim());
}

function numberIn(value: string, pattern: RegExp): number | null {
  const match = pattern.exec(cleanTeamName(value));
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return parsed >= 1 && parsed <= MAX_NUMBER ? parsed : null;
}

interface Row {
  line: number;
  team: string;
  rival: string;
  rotation: number;
  base: number;
}

/** Lee la hoja pegada. Devuelve el calendario o, si algo no cuadra, todos los problemas con su línea. */
export function parseScheduleSheet(text: string): {
  sheet: ScheduleSheet | null;
  problems: SheetProblem[];
} {
  const problems: SheetProblem[] = [];
  const rows: Row[] = [];
  const names = new Map<string, string>();
  let first = true;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (raw.trim() === "") continue;
    const line = index + 1;
    const cells = splitLine(raw);
    const [team = "", rotationCell = "", baseCell = "", rival = ""] = cells.map(cleanTeamName);
    const rotation = numberIn(rotationCell, /^(\d+)$/);
    const isFirst = first;
    first = false;
    // La primera fila puede ser el encabezado: no trae número de rotación.
    if (isFirst && rotation === null && !/\d/.test(rotationCell)) continue;
    if (cells.length < 4 || team === "" || rival === "") {
      problems.push({ kind: "COLUMNS", line });
      continue;
    }
    const base = numberIn(baseCell, /^(?:base\s*)?(\d+)$/i);
    if (rotation === null) problems.push({ kind: "ROTATION", line });
    if (base === null) problems.push({ kind: "BASE", line });
    if (rotation === null || base === null) continue;
    if (teamKey(team) === teamKey(rival)) {
      problems.push({ kind: "SELF_MATCH", line, team });
      continue;
    }
    rows.push({ line, team, rival, rotation, base });
  }
  if (rows.length === 0 && problems.length === 0) problems.push({ kind: "EMPTY" });

  for (const row of rows) {
    if (!names.has(teamKey(row.team))) names.set(teamKey(row.team), row.team);
  }
  for (const row of rows) {
    if (!names.has(teamKey(row.rival))) names.set(teamKey(row.rival), row.rival);
  }

  // Cada rotación: qué juega cada equipo y qué enfrentamiento hay en cada base.
  const slots = new Map<number, Map<string, { base: number; other: string }>>();
  const byBase = new Map<number, Map<number, SheetMatchup>>();
  for (const row of rows) {
    const team = teamKey(row.team);
    const rival = teamKey(row.rival);
    const own = slots.get(row.rotation) ?? new Map<string, { base: number; other: string }>();
    slots.set(row.rotation, own);
    let clash = false;
    for (const [key, other] of [
      [team, rival],
      [rival, team],
    ] as const) {
      const current = own.get(key);
      if (current && (current.base !== row.base || current.other !== other)) {
        problems.push({
          kind: "TEAM_TWICE",
          line: row.line,
          team: names.get(key) ?? key,
          rotation: row.rotation,
        });
        clash = true;
        break;
      }
    }
    if (clash) continue;
    const bases = byBase.get(row.rotation) ?? new Map<number, SheetMatchup>();
    byBase.set(row.rotation, bases);
    const current = bases.get(row.base);
    const pair = new Set([team, rival]);
    if (current && !(pair.has(current.a) && pair.has(current.b))) {
      problems.push({ kind: "BASE_TWICE", line: row.line, base: row.base, rotation: row.rotation });
      continue;
    }
    own.set(team, { base: row.base, other: rival });
    own.set(rival, { base: row.base, other: team });
    if (!current) bases.set(row.base, { base: row.base, a: team, b: rival });
  }

  const last = Math.max(0, ...rows.map((row) => row.rotation));
  for (let rotation = 1; rotation <= last; rotation++) {
    if (!rows.some((row) => row.rotation === rotation)) {
      problems.push({ kind: "MISSING_ROTATION", rotation });
    }
  }
  if (problems.length > 0) return { sheet: null, problems };

  const order = [...names.keys()];
  const rank = (key: string) => order.indexOf(key);
  const rotations = Array.from({ length: last }, (_, index) =>
    [...(byBase.get(index + 1)?.values() ?? [])]
      .map((matchup) =>
        rank(matchup.a) <= rank(matchup.b)
          ? matchup
          : { base: matchup.base, a: matchup.b, b: matchup.a },
      )
      .sort((x, y) => x.base - y.base),
  );
  const bases = [...new Set(rotations.flat().map((matchup) => matchup.base))].sort((x, y) => x - y);
  return {
    sheet: {
      teams: order.map((key) => ({ key, name: names.get(key) ?? key })),
      rotations,
      bases,
    },
    problems,
  };
}
