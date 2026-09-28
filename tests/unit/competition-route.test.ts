import { beforeEach, describe, expect, it, vi } from "vitest";
import { teamRouteSchema, toRouteStops } from "@/modules/competition/domain/route-pure";

// El recorrido de un equipo (ADR-097): una parada por rotación, con base, rival y resultado desde el
// punto de vista del equipo. Sin ids.

const team = (id: string, number: number) => ({
  id,
  number,
  name: `Equipo ${number}`,
  color: null,
});
const rotations = [
  { id: "r2", day: 1, number: 2, status: "ACTIVE" as const },
  { id: "r1", day: 1, number: 1, status: "CLOSED" as const },
  { id: "r16", day: 2, number: 16, status: "PENDING" as const },
  { id: "r3", day: 1, number: 3, status: "PENDING" as const },
];
const base = (name: string, kind: "NORMAL" | "MACRO" = "NORMAL") => ({
  name,
  kind,
  location: null,
});

describe("recorrido de un equipo", () => {
  it("ordena por jornada y rotación y da el resultado del lado del equipo", () => {
    const stops = toRouteStops({
      teamId: "t7",
      rotations,
      matchups: [
        {
          rotationId: "r1",
          base: base("Base 1"),
          teamA: team("t7", 7),
          teamB: team("t9", 9),
          outcome: "B_WIN",
        },
        {
          rotationId: "r2",
          base: base("Inflable", "MACRO"),
          teamA: team("t3", 3),
          teamB: team("t7", 7),
          outcome: "B_WIN",
        },
        {
          rotationId: "r3",
          base: base("Base 3"),
          teamA: team("t7", 7),
          teamB: team("t4", 4),
          outcome: null,
        },
        {
          rotationId: "r16",
          base: base("Base 16"),
          teamA: team("t5", 5),
          teamB: team("t7", 7),
          outcome: "DRAW",
        },
        {
          rotationId: "r1",
          base: base("Base 2"),
          teamA: team("t1", 1),
          teamB: team("t2", 2),
          outcome: "A_WIN",
        },
      ],
    });
    expect(
      stops.map(({ day, rotation, status, result, points }) => ({
        day,
        rotation,
        status,
        result,
        points,
      })),
    ).toEqual([
      { day: 1, rotation: 1, status: "CLOSED", result: "LOSS", points: 0 },
      { day: 1, rotation: 2, status: "ACTIVE", result: "WIN", points: 2000 },
      { day: 1, rotation: 3, status: "PENDING", result: null, points: null },
      { day: 2, rotation: 16, status: "PENDING", result: "DRAW", points: 500 },
    ]);
    expect(stops[0]?.rival).toEqual({ number: 9, name: "Equipo 9", color: null });
    expect(stops[1]?.base).toEqual({ name: "Inflable", kind: "MACRO", location: null });
    const json = JSON.stringify(
      teamRouteSchema.parse({
        version: 1,
        serverNow: "2026-10-01T18:00:00.000Z",
        competition: {
          slug: "the-games-2026",
          name: "The Games",
          status: "LIVE",
          rehearsal: false,
        },
        team: { number: 7, name: "Equipo 7", color: null },
        stops,
      }),
    );
    expect(json).not.toMatch(/"t\d+"|r16|"id"/);
  });
});

const competitionModule = vi.hoisted(() => ({ getTeamRoute: vi.fn() }));
vi.mock("@/modules/competition", () => competitionModule);
vi.mock("@/env", () => ({ getEnv: () => ({ PUBLIC_API_ORIGINS: ["https://dias.oeeafit.com"] }) }));

describe("ruta GET /api/v1/the-games/[slug]/equipos/[numero]", async () => {
  const { GET } = await import("@/app/api/v1/the-games/[slug]/equipos/[numero]/route");
  const call = (slug: string, numero: string) =>
    GET(new Request(`http://localhost/api/v1/the-games/${slug}/equipos/${numero}`), {
      params: Promise.resolve({ slug, numero }),
    });

  beforeEach(() => vi.resetAllMocks());

  it("200 con caché corta y CORS; 404 si el número no es válido o no hay equipo", async () => {
    competitionModule.getTeamRoute.mockResolvedValueOnce({ version: 1, stops: [] });
    const ok = await call("the-games-2026", "7");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe(
      "public, max-age=5, s-maxage=5, stale-while-revalidate=30",
    );
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://dias.oeeafit.com");
    expect(competitionModule.getTeamRoute).toHaveBeenCalledWith("the-games-2026", 7);
    expect((await call("the-games-2026", "0")).status).toBe(404);
    expect((await call("the-games-2026", "100")).status).toBe(404);
    expect((await call("the-games-2026", "7a")).status).toBe(404);
    competitionModule.getTeamRoute.mockResolvedValueOnce(null);
    expect((await call("the-games-2026", "31")).status).toBe(404);
    expect(competitionModule.getTeamRoute).toHaveBeenCalledTimes(2);
  });
});
