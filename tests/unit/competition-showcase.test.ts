import { beforeEach, describe, expect, it, vi } from "vitest";
import { showcaseSchema, toShowcase } from "@/modules/competition/domain/showcase-pure";
import { corsHeaders } from "@/shared/lib/cors";

// Vitrina pública de The Games (ADR-090): JSON versionado sin datos personales, CORS de origen fijo.

const competition = {
  slug: "the-games-2026",
  name: "The Games 2026",
  status: "LIVE" as const,
  isRehearsal: false,
  firstDayOn: "2026-10-01",
  secondDayOn: null,
  bettingEnabled: true,
  showCaptains: false,
};
// El celular va de más a propósito: la vitrina no lo tiene que copiar aunque le llegue.
const captains = [
  { teamId: "team-b", position: 1, name: "Sara de Ensayo", phone: "3000000030" },
  { teamId: "team-a", position: 2, name: "Luis de Ensayo", phone: "3000000002" },
  { teamId: "team-a", position: 1, name: "Ana de Ensayo", phone: "3000000001" },
  { teamId: "team-x", position: 1, name: "Sin equipo", phone: null },
];
const teams = [
  { id: "team-a", number: 1, name: "Titanes", color: "#a53420" },
  { id: "team-b", number: 30, name: "Olímpicos", color: null },
];
const standingsRow = (teamId: string, rank: number, points: number) => ({
  teamId,
  rank,
  points,
  played: 1,
  wins: points > 0 ? 1 : 0,
  draws: 0,
  losses: points > 0 ? 0 : 1,
});

function source(overrides: Partial<Parameters<typeof toShowcase>[0]> = {}) {
  return {
    competition,
    teams,
    standings: {
      overall: [standingsRow("team-a", 1, 1000), standingsRow("team-b", 2, 0)],
      day1: [standingsRow("team-a", 1, 1000), standingsRow("team-b", 2, 0)],
      day2: [],
    },
    rotations: {
      current: {
        day: 1,
        number: 1,
        status: "ACTIVE" as const,
        plannedSeconds: 1200,
        startsAt: new Date("2026-10-01T18:00:00Z"),
        endsAt: new Date("2026-10-01T18:20:00Z"),
        matchups: [
          {
            base: { name: "Inflable 1", kind: "MACRO" as const, location: null },
            teamA: { id: "team-a" },
            teamB: { id: "team-b" },
            outcome: "A_WIN" as const,
          },
        ],
      },
      next: null,
    },
    announcements: [
      {
        id: "an-1",
        message: "La rotación 2 arranca en 5 minutos",
        level: "INFO" as const,
        createdAt: new Date("2026-10-01T18:15:00Z"),
      },
    ],
    markets: [
      {
        id: "mk-1",
        title: "¿Quién gana el inflable?",
        status: "OPEN" as const,
        closesAt: null,
        winnerTeamId: null,
        options: ["team-a", "team-b"],
        pools: new Map([["team-a", 300]]),
      },
      {
        id: "mk-2",
        title: "Borrador",
        status: "DRAFT" as const,
        closesAt: null,
        winnerTeamId: null,
        options: ["team-a", "team-b"],
        pools: new Map(),
      },
    ],
    balances: new Map([
      ["team-a", 700],
      ["team-b", 1000],
    ]),
    captains,
    ...overrides,
  };
}

describe("vitrina", () => {
  it("arma el JSON versionado con equipos por número y sin ids de equipo ni borradores", () => {
    const body = toShowcase(source());
    if (!body) throw new Error("sin vitrina");
    const parsed = showcaseSchema.parse({ ...body, serverNow: "2026-10-01T18:16:00.000Z" });
    expect(parsed.version).toBe(1);
    expect(parsed.standings.overall[0]).toMatchObject({ rank: 1, number: 1, name: "Titanes" });
    expect(parsed.currentRotation?.matchups[0]).toMatchObject({
      base: { kind: "MACRO" },
      teamB: { number: 30 },
      outcome: "A_WIN",
    });
    expect(parsed.betting.markets.map((market) => market.id)).toEqual(["mk-1"]);
    expect(parsed.betting.markets[0]?.options).toEqual([
      { number: 1, name: "Titanes", color: "#a53420", pool: 300 },
      { number: 30, name: "Olímpicos", color: null, pool: 0 },
    ]);
    expect(parsed.betting.balances.map((row) => row.number)).toEqual([30, 1]);
    const json = JSON.stringify(parsed);
    expect(json).not.toContain("team-a");
    expect(json).not.toContain("@");
  });

  it("con poderes, publica el resultado oficial (ADR-098)", () => {
    const base = source();
    const current = base.rotations.current;
    if (!current) throw new Error("sin rotación");
    const body = toShowcase({
      ...base,
      rotations: {
        current: {
          ...current,
          matchups: [
            {
              base: { name: "Base 3", kind: "NORMAL" as const, location: null },
              teamA: { id: "team-a" },
              teamB: { id: "team-b" },
              outcome: "A_WIN" as const,
              official: "B_WIN" as const,
            },
          ],
        },
        next: null,
      },
    });
    expect(body?.currentRotation?.matchups[0]?.outcome).toBe("B_WIN");
  });

  it("una competencia en borrador no es pública y sin apuestas no se muestran", () => {
    expect(toShowcase(source({ competition: { ...competition, status: "DRAFT" } }))).toBeNull();
    const body = toShowcase(source({ competition: { ...competition, bettingEnabled: false } }));
    expect(body?.betting).toEqual({ enabled: false, markets: [], balances: [] });
  });

  it("los capitanes solo salen publicados, por número de equipo y sin celular (ADR-095)", () => {
    const hidden = toShowcase(source());
    expect(hidden?.captains).toEqual([]);
    expect(JSON.stringify(hidden)).not.toContain("Ensayo");

    const body = toShowcase(source({ competition: { ...competition, showCaptains: true } }));
    if (!body) throw new Error("sin vitrina");
    const parsed = showcaseSchema.parse({ ...body, serverNow: "2026-10-01T18:16:00.000Z" });
    expect(parsed.captains).toEqual([
      { number: 1, names: ["Ana de Ensayo", "Luis de Ensayo"] },
      { number: 30, names: ["Sara de Ensayo"] },
    ]);
    const json = JSON.stringify(parsed);
    expect(json).not.toMatch(/300000000\d|3000000030/);
    expect(json).not.toContain("team-a");
    expect(json).not.toContain("Sin equipo");
  });
});

describe("CORS de la API v1", () => {
  it("con un solo origen lo devuelve fijo, sin importar quién pide", () => {
    const headers = corsHeaders(["https://dias.oeeafit.com"], "https://otro.example");
    expect(headers["access-control-allow-origin"]).toBe("https://dias.oeeafit.com");
    expect(headers.vary).toBeUndefined();
    expect(headers["access-control-allow-methods"]).toBe("GET, OPTIONS");
  });

  it("con varios devuelve el que coincide y agrega Vary", () => {
    const allowed = ["http://localhost:3100", "http://localhost:3101"];
    expect(corsHeaders(allowed, "http://localhost:3101")).toMatchObject({
      "access-control-allow-origin": "http://localhost:3101",
      vary: "Origin",
    });
    expect(corsHeaders(allowed, "https://otro.example")).toEqual({ vary: "Origin" });
    expect(corsHeaders([], "https://otro.example")).toEqual({});
  });
});

const competitionModule = vi.hoisted(() => ({ getShowcase: vi.fn() }));
vi.mock("@/modules/competition", () => competitionModule);
vi.mock("@/env", () => ({ getEnv: () => ({ PUBLIC_API_ORIGINS: ["https://dias.oeeafit.com"] }) }));

describe("ruta GET /api/v1/the-games/[slug]", async () => {
  const { GET, OPTIONS } = await import("@/app/api/v1/the-games/[slug]/route");
  const call = (slug: string) =>
    GET(
      new Request(`http://localhost/api/v1/the-games/${slug}`, {
        headers: { origin: "https://dias.oeeafit.com" },
      }),
      {
        params: Promise.resolve({ slug }),
      },
    );

  beforeEach(() => vi.resetAllMocks());

  it("200 con caché corta y CORS", async () => {
    competitionModule.getShowcase.mockResolvedValue({ version: 1 });
    const response = await call("the-games-2026");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=5, s-maxage=5, stale-while-revalidate=30",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("https://dias.oeeafit.com");
    expect(await response.json()).toEqual({ version: 1 });
  });

  it("404 en JSON si no existe, es borrador o el slug no es válido", async () => {
    competitionModule.getShowcase.mockResolvedValue(null);
    expect((await call("the-games-2026")).status).toBe(404);
    const invalid = await call("NO_VALE");
    expect(invalid.status).toBe(404);
    expect(competitionModule.getShowcase).toHaveBeenCalledTimes(1);
  });

  it("503 sin caché si la lectura falla, y OPTIONS responde el CORS", async () => {
    competitionModule.getShowcase.mockRejectedValue(new Error("base caída"));
    const failed = await call("the-games-2026");
    expect(failed.status).toBe(503);
    expect(failed.headers.get("cache-control")).toBe("no-store");
    const preflight = OPTIONS(
      new Request("http://localhost/api/v1/the-games/x", { method: "OPTIONS" }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});
