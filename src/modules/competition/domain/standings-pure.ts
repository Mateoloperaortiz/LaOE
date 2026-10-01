// Posiciones de The Games sin I/O (ADR-089 regla 6): se suman desde el libro de puntos y nunca se
// guardan. La general suma además el saldo de apuestas de cada equipo (ADR-104). No hay desempate: quien empata en el total comparte el puesto (1, 2, 2, 4) y el orden
// visual sigue el número del equipo.

import type { Day } from "./schedule-pure";
import type { Outcome } from "./scoring-pure";

export type StandingsScope = "overall" | Day;

export interface StandingsTeam {
  id: string;
  number: number;
  name: string;
  color: string | null;
  active: boolean;
}

export interface PointRow {
  teamId: string;
  day: Day;
  points: number;
}

export interface ResultRow {
  day: Day;
  teamAId: string;
  teamBId: string;
  outcome: Outcome;
}

export interface StandingRow {
  rank: number;
  teamId: string;
  number: number;
  name: string;
  color: string | null;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

function inScope(day: Day, scope: StandingsScope): boolean {
  return scope === "overall" || scope === day;
}

/** Tabla de un alcance: general, jornada 1 o jornada 2. Los equipos retirados no aparecen.
 *  `credits` es el saldo de apuestas por equipo, y solo cuenta en la general (ADR-104). */
export function computeStandings(
  teams: readonly StandingsTeam[],
  points: readonly PointRow[],
  results: readonly ResultRow[],
  scope: StandingsScope,
  credits: ReadonlyMap<string, number> = new Map(),
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const team of teams) {
    if (!team.active) continue;
    rows.set(team.id, {
      rank: 0,
      teamId: team.id,
      number: team.number,
      name: team.name,
      color: team.color,
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    });
  }
  for (const entry of points) {
    if (!inScope(entry.day, scope)) continue;
    const row = rows.get(entry.teamId);
    if (row) row.points += entry.points;
  }
  if (scope === "overall") {
    for (const [teamId, balance] of credits) {
      const row = rows.get(teamId);
      if (row) row.points += balance;
    }
  }
  for (const result of results) {
    if (!inScope(result.day, scope)) continue;
    const a = rows.get(result.teamAId);
    const b = rows.get(result.teamBId);
    for (const [row, won, lost] of [
      [a, "A_WIN", "B_WIN"],
      [b, "B_WIN", "A_WIN"],
    ] as const) {
      if (!row) continue;
      row.played += 1;
      if (result.outcome === won) row.wins += 1;
      else if (result.outcome === lost) row.losses += 1;
      else row.draws += 1;
    }
  }
  const sorted = [...rows.values()].sort((x, y) => y.points - x.points || x.number - y.number);
  let previous: StandingRow | undefined;
  sorted.forEach((row, index) => {
    row.rank = previous && previous.points === row.points ? previous.rank : index + 1;
    previous = row;
  });
  return sorted;
}
