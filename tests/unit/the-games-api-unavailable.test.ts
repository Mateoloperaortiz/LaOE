import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { captureLogs, type LoggedLine } from "../helpers/logs";

// Lo que la API pública de The Games hace cuando el dominio lanza algo que no esperaba (ADR-118 regla
// 24): le responde a DÍAS lo mismo de siempre, 503 «no disponible» con su CORS y sin caché, y deja en
// el registro de la casa una línea de error con la causa. Antes no dejaba nada: la respuesta sale bien
// formada y Next tampoco registra. El dominio va simulado para poder hacerlo lanzar; las rutas, el CORS
// y el logger son los de verdad, y las líneas se leen ya serializadas.

const DIAS = "https://dias.oeeafit.com";
const TEAM_CODE = "ABCD-EFGH";
const COOKIE = "cookie-firmada-sintetica";

const competitionModule = vi.hoisted(() => ({
  getShowcase: vi.fn(),
  getTeamRoute: vi.fn(),
  getHubState: vi.fn(),
  enterHubAs: vi.fn(),
  placeHubBetAs: vi.fn(),
  createCompetitionAs: vi.fn(),
  hubSessionFromCookie: vi.fn(),
  hubCookieValue: vi.fn(() => "sesion-firmada"),
  HUB_COOKIE: "oe_capitanes",
  HUB_API_PATH: "/api/v1/the-games/hub",
}));
// El error con razón es el de verdad: la ruta de apuestas lo reconoce por su clase.
vi.mock("@/modules/competition", async () => {
  const pure = await vi.importActual<typeof import("@/modules/competition/domain/hub-pure")>(
    "@/modules/competition/domain/hub-pure",
  );
  return { ...competitionModule, HubBetError: pure.HubBetError };
});
vi.mock("@/env", () => ({
  getEnv: () => ({ PUBLIC_API_ORIGINS: [DIAS], APP_URL: "https://oeeafit.com" }),
}));
vi.mock("@/modules/identity", () => ({
  requireAdminActor: async () => ({ personId: "admin-sintetico", isAdmin: true }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const session = {
  competitionId: "comp1abcdefgh",
  teamId: "team1abcdefgh",
  codeIssuedAt: 1,
  expiresAt: Date.now() + 60_000,
};

/** Un fallo interno cualquiera, con el código que trae un error de Postgres. */
const boom = () => Object.assign(new Error("la base no respondió (sintético)"), { code: "57P01" });

function hubRequest(path: string, init: { method?: string; json?: unknown } = {}): NextRequest {
  const headers = new Headers({ origin: DIAS, cookie: `oe_capitanes=${COOKIE}` });
  if (init.json !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`https://oeeafit.com/api/v1/the-games/hub${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
  });
}

function publicRequest(path: string): Request {
  return new Request(`https://oeeafit.com/api/v1/the-games/${path}`, { headers: { origin: DIAS } });
}

/** Los encabezados de un 503 de la vitrina y del recorrido: el CORS de solo lectura y sin caché. */
const PUBLIC_HEADERS = {
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-origin": DIAS,
  "access-control-max-age": "86400",
  "cache-control": "no-store",
  "content-type": "application/json",
};

/** Los de un 503 del hub: el CORS con credenciales de DÍAS, sin caché y sin cookie. */
const hubHeaders = (methods: string) => ({
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": methods,
  "access-control-allow-origin": DIAS,
  "access-control-max-age": "600",
  "cache-control": "no-store",
  "content-type": "application/json",
  vary: "Origin",
});

const errorLines = (lines: LoggedLine[]) => lines.filter(({ record }) => record.level === 50);

describe("la API pública de The Games cuando el dominio lanza", async () => {
  const vitrina = await import("@/app/api/v1/the-games/[slug]/route");
  const recorrido = await import("@/app/api/v1/the-games/[slug]/equipos/[numero]/route");
  const estado = await import("@/app/api/v1/the-games/hub/route");
  const sesion = await import("@/app/api/v1/the-games/hub/sesion/route");
  const apuestas = await import("@/app/api/v1/the-games/hub/apuestas/route");

  const enter = () =>
    sesion.POST(hubRequest("/sesion", { method: "POST", json: { code: TEAM_CODE, accept: 1 } }));
  const bet = () =>
    apuestas.POST(
      hubRequest("/apuestas", {
        method: "POST",
        json: { marketId: "mercado1", pick: 7, stake: 100 },
      }),
    );

  const cases: {
    name: string;
    route: string;
    headers: Record<string, string>;
    arrange(error: Error): void;
    call(): Promise<Response>;
  }[] = [
    {
      name: "la vitrina",
      route: "GET /api/v1/the-games/[slug]",
      headers: PUBLIC_HEADERS,
      arrange: (error) => competitionModule.getShowcase.mockRejectedValue(error),
      call: () =>
        vitrina.GET(publicRequest("the-games-2026"), {
          params: Promise.resolve({ slug: "the-games-2026" }),
        }),
    },
    {
      name: "el recorrido de un equipo",
      route: "GET /api/v1/the-games/[slug]/equipos/[numero]",
      headers: PUBLIC_HEADERS,
      arrange: (error) => competitionModule.getTeamRoute.mockRejectedValue(error),
      call: () =>
        recorrido.GET(publicRequest("the-games-2026/equipos/7"), {
          params: Promise.resolve({ slug: "the-games-2026", numero: "7" }),
        }),
    },
    {
      name: "el estado del hub",
      route: "GET /api/v1/the-games/hub",
      headers: hubHeaders("GET, OPTIONS"),
      arrange: (error) => competitionModule.getHubState.mockRejectedValue(error),
      call: () => estado.GET(hubRequest("")),
    },
    {
      name: "entrar al hub con el código del equipo",
      route: "POST /api/v1/the-games/hub/sesion",
      headers: hubHeaders("POST, DELETE, OPTIONS"),
      arrange: (error) => competitionModule.enterHubAs.mockRejectedValue(error),
      call: enter,
    },
    {
      name: "entrar al hub, cuando falla la lectura del estado después de entrar",
      route: "POST /api/v1/the-games/hub/sesion",
      headers: hubHeaders("POST, DELETE, OPTIONS"),
      arrange: (error) => {
        competitionModule.enterHubAs.mockResolvedValue({ ok: true, session });
        competitionModule.getHubState.mockRejectedValue(error);
      },
      call: enter,
    },
    {
      name: "apostar",
      route: "POST /api/v1/the-games/hub/apuestas",
      headers: hubHeaders("POST, OPTIONS"),
      arrange: (error) => competitionModule.placeHubBetAs.mockRejectedValue(error),
      call: bet,
    },
    {
      name: "apostar, cuando falla la lectura del estado después de apostar",
      route: "POST /api/v1/the-games/hub/apuestas",
      headers: hubHeaders("POST, OPTIONS"),
      arrange: (error) => {
        competitionModule.placeHubBetAs.mockResolvedValue(undefined);
        competitionModule.getHubState.mockRejectedValue(error);
      },
      call: bet,
    },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    competitionModule.hubSessionFromCookie.mockImplementation((value?: string) =>
      value === COOKIE ? session : null,
    );
    competitionModule.hubCookieValue.mockReturnValue("sesion-firmada");
  });

  it.each(
    cases,
  )("$name: DÍAS recibe el 503 «no disponible» de siempre, con su CORS, sin caché y sin cookie", async ({
    arrange,
    call,
    headers,
  }) => {
    arrange(boom());
    const { result: response } = await captureLogs(call);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "no disponible" });
    expect(Object.fromEntries(response.headers)).toEqual(headers);
  });

  it.each(
    cases,
  )("$name: deja una línea de error con la causa y la ruta, sin el código del equipo ni la cookie", async ({
    arrange,
    call,
    route,
  }) => {
    arrange(boom());
    const { lines } = await captureLogs(call);
    expect(lines).toHaveLength(1);
    const [entry] = errorLines(lines);
    expect(entry?.record).toMatchObject({
      level: 50,
      msg: "API pública no disponible",
      route,
      err: { type: "Error", message: "la base no respondió (sintético)", code: "57P01" },
    });
    expect((entry?.record.err as { stack?: unknown }).stack).toEqual(
      expect.stringContaining("the-games-api-unavailable.test.ts"),
    );
    expect(entry?.line).not.toContain(TEAM_CODE);
    expect(entry?.line).not.toContain(COOKIE);
  });

  it("lo que no es un fallo no deja línea de error: lo que no existe, la sesión vencida y la apuesta que el dominio rechaza", async () => {
    const { HubBetError } = await import("@/modules/competition");
    competitionModule.getShowcase.mockResolvedValue(null);
    competitionModule.getTeamRoute.mockResolvedValue(null);
    competitionModule.getHubState.mockResolvedValue(null);
    const { result: statuses, lines } = await captureLogs(async () => {
      const seen: number[] = [];
      for (const item of cases.slice(0, 3)) seen.push((await item.call()).status);
      competitionModule.placeHubBetAs.mockRejectedValueOnce(
        new HubBetError("SESSION", t("T-3038")),
      );
      seen.push((await bet()).status);
      competitionModule.placeHubBetAs.mockRejectedValueOnce(new DomainError(t("T-032")));
      seen.push((await bet()).status);
      competitionModule.placeHubBetAs.mockRejectedValueOnce(new ZodError([]));
      seen.push((await bet()).status);
      return seen;
    });
    expect(statuses).toEqual([404, 404, 401, 401, 400, 400]);
    expect(lines).toEqual([]);
  });
});

describe("crear una competencia desde el admin", async () => {
  const { createCompetitionAction } = await import("@/app/admin/the-games/actions");

  function form(): FormData {
    const data = new FormData();
    data.set("editionId", "edicion-sintetica");
    data.set("slug", "the-games-2026");
    data.set("name", "The Games");
    return data;
  }

  beforeEach(() => vi.resetAllMocks());

  it("un fallo interno no vuelve como «hay errores de validación»: la acción lo relanza, como las demás", async () => {
    competitionModule.createCompetitionAs.mockRejectedValue(boom());
    const outcome = await createCompetitionAction(form()).then(
      () => "terminó",
      (error: Error) => error.message,
    );
    expect(outcome).toBe("la base no respondió (sintético)");
    expect(outcome).not.toContain(encodeURIComponent(t("T-260")));
  });

  it("lo que el dominio rechaza vuelve con su texto, y lo que no valida con el de validación", async () => {
    competitionModule.createCompetitionAs.mockRejectedValueOnce(new DomainError(t("T-032")));
    await expect(createCompetitionAction(form())).rejects.toThrow(
      `redirect:/admin/the-games?${new URLSearchParams({ error: t("T-032") })}`,
    );
    competitionModule.createCompetitionAs.mockRejectedValueOnce(new ZodError([]));
    await expect(createCompetitionAction(form())).rejects.toThrow(
      `redirect:/admin/the-games?${new URLSearchParams({ error: t("T-260") })}`,
    );
  });

  it("la competencia creada lleva a su pantalla", async () => {
    competitionModule.createCompetitionAs.mockResolvedValue({ id: "comp1abcdefgh" });
    await expect(createCompetitionAction(form())).rejects.toThrow(
      "redirect:/admin/the-games/comp1abcdefgh",
    );
    expect(competitionModule.createCompetitionAs).toHaveBeenCalledWith(
      { personId: "admin-sintetico", isAdmin: true, ip: "203.0.113.7" },
      {
        editionId: "edicion-sintetica",
        slug: "the-games-2026",
        name: "The Games",
        isRehearsal: false,
      },
    );
  });
});
