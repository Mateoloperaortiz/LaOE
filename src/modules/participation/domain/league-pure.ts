import { addDays } from "@/shared/lib/dates-pure";

// Las ligas semanales (ADR-178): la parte pura, sin base. Cuatro ligas; al cerrar la semana los
// primeros cinco que sumaron suben una y los últimos cinco que sumaron bajan una. Quien no sumó nada se
// queda donde estaba.

export const LEAGUE_TIERS = ["BRONCE", "PLATA", "ORO", "DIAMANTE"] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];

/** Cuántos suben y cuántos bajan de cada liga al cerrar la semana. */
export const LEAGUE_MOVE = 5;

export interface LeagueRow {
  personId: string;
  tier: LeagueTier;
  points: number;
}

function shift(tier: LeagueTier, by: 1 | -1): LeagueTier {
  const index = LEAGUE_TIERS.indexOf(tier) + by;
  return LEAGUE_TIERS[Math.min(Math.max(index, 0), LEAGUE_TIERS.length - 1)] ?? tier;
}

/** La tabla de una liga: más puntos arriba; a igual puntaje, el orden es estable por persona. */
export function leagueTable<T extends LeagueRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.points - a.points || a.personId.localeCompare(b.personId));
}

/**
 * La liga de cada persona para la semana siguiente. Entre quienes sumaron algo, los primeros
 * `LEAGUE_MOVE` suben y, de los que quedan, los últimos `LEAGUE_MOVE` bajan; en Diamante nadie sube y en
 * Bronce nadie baja. Una liga con pocos que sumaron prefiere subir a bajar.
 */
export function nextTiers(rows: readonly LeagueRow[]): Map<string, LeagueTier> {
  const next = new Map<string, LeagueTier>();
  for (const tier of LEAGUE_TIERS) {
    const table = leagueTable(rows.filter((row) => row.tier === tier));
    const scored = table.filter((row) => row.points > 0);
    const up = tier === "DIAMANTE" ? [] : scored.slice(0, LEAGUE_MOVE);
    const rest = scored.slice(up.length);
    const down = tier === "BRONCE" ? [] : rest.slice(Math.max(rest.length - LEAGUE_MOVE, 0));
    for (const row of table) next.set(row.personId, tier);
    for (const row of up) next.set(row.personId, shift(tier, 1));
    for (const row of down) next.set(row.personId, shift(tier, -1));
  }
  return next;
}

/** Si la liga nueva es más alta que la anterior: el momento del ascenso (ADR-178 regla 4). */
export function promoted(previous: LeagueTier | null, current: LeagueTier): boolean {
  return previous !== null && LEAGUE_TIERS.indexOf(current) > LEAGUE_TIERS.indexOf(previous);
}

/** El lunes de la semana de un día "AAAA-MM-DD": la semana de la liga va de lunes a domingo. */
export function leagueWeekOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
}
