import { z } from "zod";

// La vitrina pública de The Games (ADR-090): lo que lee dias.oeeafit.com. JSON versionado, sin datos
// personales ni ids de persona, validado antes de salir. La única excepción son los nombres de los
// capitanes, cuando el ADMIN los publica (ADR-095); su celular nunca. Un cambio incompatible sube
// `version`.

export const SHOWCASE_VERSION = 1;

const team = z.object({
  number: z.number().int(),
  name: z.string(),
  color: z.string().nullable(),
});

const standingRow = team.extend({
  rank: z.number().int(),
  points: z.number().int(),
  played: z.number().int(),
  wins: z.number().int(),
  draws: z.number().int(),
  losses: z.number().int(),
});

const rotation = z.object({
  day: z.union([z.literal(1), z.literal(2)]),
  number: z.number().int(),
  status: z.enum(["PENDING", "ACTIVE", "CLOSED"]),
  plannedSeconds: z.number().int(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  matchups: z.array(
    z.object({
      base: z.object({
        name: z.string(),
        kind: z.enum(["NORMAL", "MACRO"]),
        location: z.string().nullable(),
      }),
      teamA: team,
      teamB: team,
      outcome: z.enum(["A_WIN", "B_WIN", "DRAW"]).nullable(),
    }),
  ),
});

export const showcaseSchema = z.object({
  version: z.literal(SHOWCASE_VERSION),
  serverNow: z.iso.datetime(),
  competition: z.object({
    slug: z.string(),
    name: z.string(),
    status: z.enum(["LIVE", "FINISHED", "ARCHIVED"]),
    rehearsal: z.boolean(),
    days: z.object({ 1: z.iso.date().nullable(), 2: z.iso.date().nullable() }),
  }),
  standings: z.object({
    overall: z.array(standingRow),
    day1: z.array(standingRow),
    day2: z.array(standingRow),
  }),
  currentRotation: rotation.nullable(),
  nextRotation: rotation.nullable(),
  announcements: z.array(
    z.object({
      id: z.string(),
      message: z.string(),
      level: z.enum(["INFO", "WARNING", "URGENT"]),
      createdAt: z.iso.datetime(),
    }),
  ),
  betting: z.object({
    enabled: z.boolean(),
    markets: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        state: z.enum(["OPEN", "CLOSED", "RESOLVED", "CANCELLED"]),
        closesAt: z.iso.datetime().nullable(),
        winner: z.number().int().nullable(),
        options: z.array(team.extend({ pool: z.number().int() })),
      }),
    ),
    balances: z.array(team.extend({ balance: z.number().int() })),
  }),
  /** Vacío mientras el ADMIN no publique los capitanes (ADR-095). */
  captains: z.array(z.object({ number: z.number().int(), names: z.array(z.string()) })),
});

export type Showcase = z.infer<typeof showcaseSchema>;
export type ShowcaseBody = Omit<Showcase, "serverNow">;

export interface ShowcaseTeam {
  id: string;
  number: number;
  name: string;
  color: string | null;
}

export interface ShowcaseSource {
  competition: {
    slug: string;
    name: string;
    status: "DRAFT" | "LIVE" | "FINISHED" | "ARCHIVED";
    isRehearsal: boolean;
    firstDayOn: string | null;
    secondDayOn: string | null;
    bettingEnabled: boolean;
    showCaptains: boolean;
  };
  teams: readonly ShowcaseTeam[];
  standings: Record<
    "overall" | "day1" | "day2",
    ReadonlyArray<{
      teamId: string;
      rank: number;
      points: number;
      played: number;
      wins: number;
      draws: number;
      losses: number;
    }>
  >;
  rotations: Record<
    "current" | "next",
    {
      day: number;
      number: number;
      status: "PENDING" | "ACTIVE" | "CLOSED";
      plannedSeconds: number;
      startsAt: Date | null;
      endsAt: Date | null;
      matchups: ReadonlyArray<{
        base: { name: string; kind: "NORMAL" | "MACRO"; location: string | null };
        teamA: { id: string };
        teamB: { id: string };
        outcome: "A_WIN" | "B_WIN" | "DRAW" | null;
      }>;
    } | null
  >;
  announcements: ReadonlyArray<{
    id: string;
    message: string;
    level: "INFO" | "WARNING" | "URGENT";
    createdAt: Date;
  }>;
  markets: ReadonlyArray<{
    id: string;
    title: string;
    status: "DRAFT" | "OPEN" | "CLOSED" | "RESOLVED" | "CANCELLED";
    closesAt: Date | null;
    winnerTeamId: string | null;
    options: readonly string[];
    pools: ReadonlyMap<string, number>;
  }>;
  balances: ReadonlyMap<string, number>;
  /** Solo nombres: la vitrina nunca recibe el celular. */
  captains: ReadonlyArray<{ teamId: string; position: number; name: string }>;
}

/** Los nombres de los capitanes por número de equipo, en el orden de la hoja. */
function captainsOf(source: ShowcaseSource, numberOf: (id: string) => number | undefined) {
  const byTeam = new Map<number, { position: number; name: string }[]>();
  for (const captain of source.captains) {
    const number = numberOf(captain.teamId);
    if (number === undefined) continue;
    byTeam.set(number, [...(byTeam.get(number) ?? []), captain]);
  }
  return [...byTeam]
    .sort(([x], [y]) => x - y)
    .map(([number, list]) => ({
      number,
      names: [...list].sort((x, y) => x.position - y.position).map((item) => item.name),
    }));
}

/** Arma la vitrina sin `serverNow`, que se estampa en cada respuesta. `null` si no es pública. */
export function toShowcase(source: ShowcaseSource): ShowcaseBody | null {
  const { competition } = source;
  if (competition.status === "DRAFT") return null;
  const byId = new Map(source.teams.map((item) => [item.id, item]));
  const teamOf = (id: string) => {
    const found = byId.get(id);
    return { number: found?.number ?? 0, name: found?.name ?? "", color: found?.color ?? null };
  };
  const rows = (list: ShowcaseSource["standings"]["overall"]) =>
    list.map(({ teamId, ...rest }) => ({ ...teamOf(teamId), ...rest }));
  const rotationOf = (value: ShowcaseSource["rotations"]["current"]) =>
    value
      ? {
          day: value.day === 2 ? (2 as const) : (1 as const),
          number: value.number,
          status: value.status,
          plannedSeconds: value.plannedSeconds,
          startsAt: value.startsAt?.toISOString() ?? null,
          endsAt: value.endsAt?.toISOString() ?? null,
          matchups: value.matchups.map((matchup) => ({
            base: matchup.base,
            teamA: teamOf(matchup.teamA.id),
            teamB: teamOf(matchup.teamB.id),
            outcome: matchup.outcome,
          })),
        }
      : null;
  return {
    version: SHOWCASE_VERSION,
    competition: {
      slug: competition.slug,
      name: competition.name,
      status: competition.status,
      rehearsal: competition.isRehearsal,
      days: { 1: competition.firstDayOn, 2: competition.secondDayOn },
    },
    standings: {
      overall: rows(source.standings.overall),
      day1: rows(source.standings.day1),
      day2: rows(source.standings.day2),
    },
    currentRotation: rotationOf(source.rotations.current),
    nextRotation: rotationOf(source.rotations.next),
    announcements: source.announcements.map((item) => ({
      id: item.id,
      message: item.message,
      level: item.level,
      createdAt: item.createdAt.toISOString(),
    })),
    betting: {
      enabled: competition.bettingEnabled,
      markets: competition.bettingEnabled
        ? source.markets.flatMap((market) =>
            market.status === "DRAFT"
              ? []
              : [
                  {
                    id: market.id,
                    title: market.title,
                    state: market.status,
                    closesAt: market.closesAt?.toISOString() ?? null,
                    winner: market.winnerTeamId ? teamOf(market.winnerTeamId).number : null,
                    options: market.options.map((teamId) => ({
                      ...teamOf(teamId),
                      pool: market.pools.get(teamId) ?? 0,
                    })),
                  },
                ],
          )
        : [],
      balances: competition.bettingEnabled
        ? [...source.balances]
            .map(([teamId, balance]) => ({ ...teamOf(teamId), balance }))
            .sort((x, y) => y.balance - x.balance || x.number - y.number)
        : [],
    },
    captains: competition.showCaptains ? captainsOf(source, (id) => byId.get(id)?.number) : [],
  };
}
