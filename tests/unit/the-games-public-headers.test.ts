import { beforeEach, describe, expect, it, vi } from "vitest";

// Las cabeceras de las dos lecturas públicas de The Games que consume DÍAS: la vitrina (ADR-090 reglas
// 3 y 4) y el recorrido de un equipo (ADR-097). Es contrato de la API pública v1: lo que guarda
// Cloudflare y lo que el navegador deja leer desde DÍAS salen de aquí. Fija todas las cabeceras de
// cada respuesta de cada ruta, con cada forma de `PUBLIC_API_ORIGINS`, además del estado y el cuerpo.
// El dominio va simulado; las rutas y el CORS son los de verdad.

const DIAS = "https://dias.oeeafit.com";
const LOCAL_A = "http://localhost:3100";
const LOCAL_B = "http://localhost:3101";
const OTHER = "https://otro.example";

const env = vi.hoisted(() => ({ origins: [] as string[] }));
const competitionModule = vi.hoisted(() => ({ getShowcase: vi.fn(), getTeamRoute: vi.fn() }));
vi.mock("@/modules/competition", () => competitionModule);
vi.mock("@/env", () => ({ getEnv: () => ({ PUBLIC_API_ORIGINS: env.origins }) }));

type HeaderMap = Record<string, string>;
interface Seen {
  status: number;
  headers: HeaderMap;
  body: string;
}

const READ_ONLY: HeaderMap = {
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-max-age": "86400",
};

/** Lo que el CORS de solo lectura responde según los orígenes permitidos y quién pide. */
const origins: { name: string; allowed: string[]; origin: string | null; cors: HeaderMap }[] = [
  {
    name: "un solo origen permitido y pide DÍAS",
    allowed: [DIAS],
    origin: DIAS,
    cors: { ...READ_ONLY, "access-control-allow-origin": DIAS },
  },
  {
    name: "un solo origen permitido y pide otro sitio: el origen sale fijo y sin Vary",
    allowed: [DIAS],
    origin: OTHER,
    cors: { ...READ_ONLY, "access-control-allow-origin": DIAS },
  },
  {
    name: "un solo origen permitido y el pedido no trae origen",
    allowed: [DIAS],
    origin: null,
    cors: { ...READ_ONLY, "access-control-allow-origin": DIAS },
  },
  {
    name: "varios orígenes permitidos y pide uno de ellos",
    allowed: [LOCAL_A, LOCAL_B],
    origin: LOCAL_B,
    cors: { ...READ_ONLY, "access-control-allow-origin": LOCAL_B, vary: "Origin" },
  },
  {
    name: "varios orígenes permitidos y pide otro sitio: solo Vary",
    allowed: [LOCAL_A, LOCAL_B],
    origin: OTHER,
    cors: { vary: "Origin" },
  },
  {
    name: "varios orígenes permitidos y el pedido no trae origen: solo Vary",
    allowed: [LOCAL_A, LOCAL_B],
    origin: null,
    cors: { vary: "Origin" },
  },
  { name: "ningún origen permitido: sin CORS", allowed: [], origin: DIAS, cors: {} },
];

const json = (status: number, cache: string, body: unknown) => (cors: HeaderMap) => ({
  status,
  headers: { ...cors, "cache-control": cache, "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** La caché de cada respuesta, igual en las dos rutas. */
const expected = {
  found: json(200, "public, max-age=5, s-maxage=5, stale-while-revalidate=30", { version: 1 }),
  notFound: json(404, "public, max-age=30, s-maxage=30", { error: "no existe" }),
  unavailable: json(503, "no-store", { error: "no disponible" }),
  preflight: (cors: HeaderMap): Seen => ({
    status: 204,
    headers: { ...cors, "cache-control": "public, max-age=86400" },
    body: "",
  }),
};

async function seen(response: Response | Promise<Response>): Promise<Seen> {
  const settled = await response;
  return {
    status: settled.status,
    headers: Object.fromEntries(settled.headers.entries()),
    body: await settled.text(),
  };
}

function request(path: string, origin: string | null, method = "GET"): Request {
  return new Request(`https://oeeafit.com/api/v1/the-games/${path}`, {
    method,
    headers: origin ? { origin } : {},
  });
}

describe("las cabeceras de las lecturas públicas de The Games para DÍAS", async () => {
  const vitrina = await import("@/app/api/v1/the-games/[slug]/route");
  const recorrido = await import("@/app/api/v1/the-games/[slug]/equipos/[numero]/route");

  beforeEach(() => vi.resetAllMocks());

  const showcase = (slug: string, origin: string | null) =>
    vitrina.GET(request(slug, origin), { params: Promise.resolve({ slug }) });
  const teamRoute = (slug: string, numero: string, origin: string | null) =>
    recorrido.GET(request(`${slug}/equipos/${numero}`, origin), {
      params: Promise.resolve({ slug, numero }),
    });

  describe("la vitrina", () => {
    it.each(origins)("con $name", async ({ allowed, origin, cors }) => {
      env.origins = allowed;
      competitionModule.getShowcase.mockResolvedValueOnce({ version: 1 });
      const found = await seen(showcase("the-games-2026", origin));
      const invalidSlug = await seen(showcase("NO_VALE", origin));
      competitionModule.getShowcase.mockResolvedValueOnce(null);
      const missing = await seen(showcase("the-games-2026", origin));
      competitionModule.getShowcase.mockRejectedValueOnce(new Error("la base no respondió"));
      const unavailable = await seen(showcase("the-games-2026", origin));
      const preflight = await seen(vitrina.OPTIONS(request("the-games-2026", origin, "OPTIONS")));

      expect({ found, invalidSlug, missing, unavailable, preflight }).toEqual({
        found: expected.found(cors),
        invalidSlug: expected.notFound(cors),
        missing: expected.notFound(cors),
        unavailable: expected.unavailable(cors),
        preflight: expected.preflight(cors),
      });
      // El slug que no vale no llega al dominio.
      expect(competitionModule.getShowcase).toHaveBeenCalledTimes(3);
    });
  });

  describe("el recorrido de un equipo", () => {
    it.each(origins)("con $name", async ({ allowed, origin, cors }) => {
      env.origins = allowed;
      competitionModule.getTeamRoute.mockResolvedValueOnce({ version: 1 });
      const found = await seen(teamRoute("the-games-2026", "7", origin));
      const invalidSlug = await seen(teamRoute("NO_VALE", "7", origin));
      const invalidNumber = await seen(teamRoute("the-games-2026", "0", origin));
      competitionModule.getTeamRoute.mockResolvedValueOnce(null);
      const missing = await seen(teamRoute("the-games-2026", "31", origin));
      competitionModule.getTeamRoute.mockRejectedValueOnce(new Error("la base no respondió"));
      const unavailable = await seen(teamRoute("the-games-2026", "7", origin));
      const preflight = await seen(
        recorrido.OPTIONS(request("the-games-2026/equipos/7", origin, "OPTIONS")),
      );

      expect({ found, invalidSlug, invalidNumber, missing, unavailable, preflight }).toEqual({
        found: expected.found(cors),
        invalidSlug: expected.notFound(cors),
        invalidNumber: expected.notFound(cors),
        missing: expected.notFound(cors),
        unavailable: expected.unavailable(cors),
        preflight: expected.preflight(cors),
      });
      // Ni el slug ni el número que no valen llegan al dominio.
      expect(competitionModule.getTeamRoute).toHaveBeenCalledTimes(3);
    });
  });
});
