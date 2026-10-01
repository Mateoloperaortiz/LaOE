import { type CaptainsTeam, resolveTeam } from "./captains-pure";
import {
  RUBRIC_MAX_SCORE,
  RUBRIC_MIN_SCORE,
  type RubricCriterion,
  type RubricLevel,
  rubricLevel,
} from "./rubric-pure";
import { cleanTeamName, splitLine, teamKey } from "./schedule-import-pure";

// Las notas de los jurados de The Challenge (ADR-103), sin I/O. Cada jurado califica por aparte con la
// rúbrica; aquí se lee la tabla que se pega de un jurado y se ordena a los equipos con el promedio de
// cada criterio. Las notas no dan puntos: el podio lo pone la Dirección (ADR-100).

export const MAX_JURY_TEXT = 20_000;
export const MAX_JUDGE_NAME = 60;
/** Los puntos del podio de The Challenge, del primero al tercero (ADR-100). */
export const PODIUM_POINTS = [2000, 1000, 500] as const;

export type JuryProblem =
  | { kind: "TEAM"; line: number; team: string }
  | { kind: "MISSING"; line: number }
  | { kind: "SCORE"; line: number; score: string }
  | { kind: "TWICE"; line: number; team: string; other: number }
  | { kind: "EMPTY" };

export interface JuryRow {
  teamId: string;
  scores: number[];
}

/** Una celda con un número: entero o con decimales, con punto o coma. */
function numeric(cell: string): number | undefined {
  const value = cell.trim().replace(",", ".");
  return /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : undefined;
}

/**
 * Lee la tabla pegada de un jurado. Sirve la plantilla de jurado o la hoja «Consolidado» de la OE tal
 * cual: el equipo sale de la primera celda (por número o por nombre) y las notas son las primeras
 * `count` celdas numéricas que siguen; el total, el nivel y los `#REF!` se ignoran. Se saltan el
 * título, el encabezado, la fila de pesos, «PROMEDIO GENERAL» y los equipos sin notas. Entra la tabla
 * completa o nada.
 */
export function parseJurySheet(
  text: string,
  teams: readonly CaptainsTeam[],
  count: number,
): { rows: JuryRow[] | null; problems: JuryProblem[] } {
  const problems: JuryProblem[] = [];
  const rows: JuryRow[] = [];
  const seen = new Map<string, number>();
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (raw.trim() === "") continue;
    const line = index + 1;
    const cells = splitLine(raw).map(cleanTeamName);
    const [first = "", ...rest] = cells;
    if (first === "" || teamKey(first).startsWith("promedio")) continue;
    const numbers = rest.flatMap((cell) => {
      const value = numeric(cell);
      return value === undefined ? [] : [{ cell, value }];
    });
    const team = resolveTeam(first, teams);
    if (!team) {
      // Un título, un encabezado o la fila de pesos no traen las notas completas: se saltan.
      if (numbers.length >= count) problems.push({ kind: "TEAM", line, team: first });
      continue;
    }
    if (numbers.length < count) {
      // Un equipo sin calificar trae a lo sumo el total en 0 de la hoja: se salta.
      if (numbers.every(({ value }) => value === 0)) continue;
      problems.push({ kind: "MISSING", line });
      continue;
    }
    const scores = numbers.slice(0, count);
    const wrong = scores.find(
      ({ value }) =>
        !Number.isInteger(value) || value < RUBRIC_MIN_SCORE || value > RUBRIC_MAX_SCORE,
    );
    if (wrong) {
      problems.push({ kind: "SCORE", line, score: wrong.cell });
      continue;
    }
    const other = seen.get(team.id);
    if (other !== undefined) {
      problems.push({ kind: "TWICE", line, team: `${team.number} ${team.name}`, other });
      continue;
    }
    seen.set(team.id, line);
    rows.push({ teamId: team.id, scores: scores.map(({ value }) => value) });
  }
  if (rows.length === 0 && problems.length === 0) problems.push({ kind: "EMPTY" });
  return problems.length > 0 ? { rows: null, problems } : { rows, problems };
}

export interface JuryTeamResult {
  teamId: string;
  /** El promedio de cada criterio entre los jurados que calificaron al equipo. */
  averages: number[] | null;
  /** De 0 a 100, con los pesos llevados a 100 como en la rúbrica. */
  total: number | null;
  level: RubricLevel | null;
  judges: number;
  /** Los empates comparten puesto: 1, 1, 3. Sin notas, `null`. */
  rank: number | null;
  tied: boolean;
}

const sameTotal = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** El orden de los equipos con las notas de todos los jurados, de mayor a menor total. */
export function juryRanking(
  criteria: readonly Pick<RubricCriterion, "weight">[],
  teamIds: readonly string[],
  scores: ReadonlyArray<{ teamId: string; scores: readonly number[] }>,
): JuryTeamResult[] {
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const results = teamIds.map((teamId): JuryTeamResult => {
    const own = scores.filter((row) => row.teamId === teamId);
    if (own.length === 0 || totalWeight <= 0) {
      return {
        teamId,
        averages: null,
        total: null,
        level: null,
        judges: 0,
        rank: null,
        tied: false,
      };
    }
    const averages = criteria.map(
      (_, index) => own.reduce((sum, row) => sum + (row.scores[index] ?? 0), 0) / own.length,
    );
    const weighted = criteria.reduce(
      (sum, criterion, index) => sum + (averages[index] ?? 0) * criterion.weight,
      0,
    );
    const total = (weighted * 100) / (RUBRIC_MAX_SCORE * totalWeight);
    return {
      teamId,
      averages,
      total,
      level: rubricLevel(total),
      judges: own.length,
      rank: null,
      tied: false,
    };
  });
  const graded = results
    .filter((result): result is JuryTeamResult & { total: number } => result.total !== null)
    .sort((a, b) => b.total - a.total);
  for (const [index, result] of graded.entries()) {
    const previous = graded[index - 1];
    result.rank = previous && sameTotal(previous.total, result.total) ? previous.rank : index + 1;
    result.tied = graded.some((other) => other !== result && sameTotal(other.total, result.total));
  }
  const ungraded = results.filter((result) => result.total === null);
  return [...graded, ...ungraded];
}

/** Si un empate toca el podio: lo decide la organización (ADR-100). */
export function podiumTie(ranking: readonly JuryTeamResult[]): boolean {
  return ranking.some(
    (result) => result.tied && result.rank !== null && result.rank <= PODIUM_POINTS.length,
  );
}
