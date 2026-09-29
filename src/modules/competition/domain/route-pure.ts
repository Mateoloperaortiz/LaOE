import { z } from "zod";
import type { BaseKind, Outcome } from "./scoring-pure";
import { pointsFor } from "./scoring-pure";

// El recorrido de un equipo (ADR-097), sin I/O: una parada por rotación en la que juega, con la base,
// el rival y cómo le fue. Público como la vitrina: por número de equipo, sin ids ni personas. Con
// poderes, el resultado y los puntos son los oficiales (ADR-098).

export const ROUTE_VERSION = 1;

const routeTeam = z.object({
  number: z.number().int(),
  name: z.string(),
  color: z.string().nullable(),
});

export const routeStopSchema = z.object({
  day: z.union([z.literal(1), z.literal(2)]),
  rotation: z.number().int(),
  status: z.enum(["PENDING", "ACTIVE", "CLOSED"]),
  base: z.object({
    name: z.string(),
    kind: z.enum(["NORMAL", "MACRO"]),
    location: z.string().nullable(),
  }),
  rival: routeTeam,
  result: z.enum(["WIN", "DRAW", "LOSS"]).nullable(),
  points: z.number().int().nullable(),
});
export type RouteStop = z.infer<typeof routeStopSchema>;

export const teamRouteSchema = z.object({
  version: z.literal(ROUTE_VERSION),
  serverNow: z.iso.datetime(),
  competition: z.object({
    slug: z.string(),
    name: z.string(),
    status: z.enum(["LIVE", "FINISHED", "ARCHIVED"]),
    rehearsal: z.boolean(),
  }),
  team: routeTeam,
  stops: z.array(routeStopSchema),
});
export type TeamRoute = z.infer<typeof teamRouteSchema>;

export interface RouteSource {
  teamId: string;
  rotations: ReadonlyArray<{
    id: string;
    day: number;
    number: number;
    status: "PENDING" | "ACTIVE" | "CLOSED";
  }>;
  matchups: ReadonlyArray<{
    rotationId: string;
    base: { name: string; kind: BaseKind; location: string | null };
    teamA: { id: string; number: number; name: string; color: string | null };
    teamB: { id: string; number: number; name: string; color: string | null };
    /** El resultado de la cancha. */
    outcome: Outcome | null;
    /** Con poderes: el resultado oficial y los puntos de cada lado (ADR-098). */
    official?: Outcome | null;
    points?: { a: number; b: number } | null;
  }>;
}

/** Las paradas del equipo, por jornada y número de rotación. */
export function toRouteStops(source: RouteSource): RouteStop[] {
  const byRotation = new Map(source.rotations.map((rotation) => [rotation.id, rotation]));
  const stops: RouteStop[] = [];
  for (const matchup of source.matchups) {
    const isA = matchup.teamA.id === source.teamId;
    if (!isA && matchup.teamB.id !== source.teamId) continue;
    const rotation = byRotation.get(matchup.rotationId);
    if (!rotation) continue;
    const rival = isA ? matchup.teamB : matchup.teamA;
    const outcome = matchup.outcome === null ? null : (matchup.official ?? matchup.outcome);
    const side = outcome ? (matchup.points ?? pointsFor(matchup.base.kind, outcome)) : null;
    const points = side ? (isA ? side.a : side.b) : null;
    const result =
      outcome === null
        ? null
        : outcome === "DRAW"
          ? ("DRAW" as const)
          : (outcome === "A_WIN") === isA
            ? ("WIN" as const)
            : ("LOSS" as const);
    stops.push({
      day: rotation.day === 2 ? 2 : 1,
      rotation: rotation.number,
      status: rotation.status,
      base: {
        name: matchup.base.name,
        kind: matchup.base.kind,
        location: matchup.base.location,
      },
      rival: { number: rival.number, name: rival.name, color: rival.color },
      result,
      points,
    });
  }
  return stops.sort((x, y) => x.day - y.day || x.rotation - y.rotation);
}
