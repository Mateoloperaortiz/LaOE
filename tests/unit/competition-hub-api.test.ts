import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/shared/copy";
import { credentialedCorsHeaders } from "@/shared/lib/cors";

// La API del hub de capitanes (ADR-096): CORS con credenciales solo para DÍAS, escrituras solo desde
// DÍAS en JSON, 401 sin sesión, 429 con demasiados fallos y la cookie del equipo con su ruta.

const DIAS = "https://dias.oeeafit.com";

const competitionModule = vi.hoisted(() => ({
  enterHubAs: vi.fn(),
  getHubState: vi.fn(),
  placeHubBetAs: vi.fn(),
  hubSessionFromCookie: vi.fn(),
  hubCookieValue: vi.fn(() => "sesion-firmada"),
  HUB_COOKIE: "oe_capitanes",
  HUB_API_PATH: "/api/v1/the-games/hub",
}));
vi.mock("@/modules/competition", () => competitionModule);
vi.mock("@/env", () => ({
  getEnv: () => ({ PUBLIC_API_ORIGINS: [DIAS], APP_URL: "https://oeeafit.com" }),
}));

const session = {
  competitionId: "comp1abcdefgh",
  teamId: "team1abcdefgh",
  codeIssuedAt: 1,
  expiresAt: Date.now() + 60_000,
};

function call(
  path: string,
  init: { method?: string; origin?: string; json?: unknown; cookie?: string } = {},
) {
  const headers = new Headers();
  if (init.origin) headers.set("origin", init.origin);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", `oe_capitanes=${init.cookie}`);
  return new NextRequest(`https://oeeafit.com/api/v1/the-games/hub${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.json !== undefined ? { body: JSON.stringify(init.json) } : {}),
  });
}

describe("CORS con credenciales", () => {
  it("devuelve solo el origen permitido, con credenciales y Vary", () => {
    expect(credentialedCorsHeaders([DIAS], DIAS, "GET, OPTIONS")).toMatchObject({
      "access-control-allow-origin": DIAS,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, OPTIONS",
      vary: "Origin",
    });
    expect(credentialedCorsHeaders([DIAS], "https://otro.example", "GET")).toEqual({
      vary: "Origin",
    });
    expect(credentialedCorsHeaders([DIAS], null, "GET")).toEqual({ vary: "Origin" });
  });
});

describe("rutas del hub", async () => {
  const estado = await import("@/app/api/v1/the-games/hub/route");
  const sesion = await import("@/app/api/v1/the-games/hub/sesion/route");
  const apuestas = await import("@/app/api/v1/the-games/hub/apuestas/route");

  beforeEach(() => {
    vi.clearAllMocks();
    competitionModule.hubSessionFromCookie.mockImplementation((value?: string) =>
      value === "valida" ? session : null,
    );
  });

  it("sin sesión responde 401 sin caché, y con una cookie vencida dice por qué", async () => {
    competitionModule.getHubState.mockResolvedValue(null);
    const anon = await estado.GET(call("", { origin: DIAS }));
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({ error: null });
    expect(anon.headers.get("cache-control")).toBe("no-store");
    expect(anon.headers.get("access-control-allow-origin")).toBe(DIAS);
    expect(anon.headers.get("access-control-allow-credentials")).toBe("true");
    const stale = await estado.GET(call("", { origin: DIAS, cookie: "vieja" }));
    expect(await stale.json()).toEqual({ error: t("T-3038") });
    const foreign = await estado.GET(call("", { origin: "https://otro.example" }));
    expect(foreign.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("entrar solo desde DÍAS y en JSON; 429 con demasiados fallos; la cookie queda en su ruta", async () => {
    expect(
      (
        await sesion.POST(
          call("/sesion", { method: "POST", origin: "https://otro.example", json: { code: "x" } }),
        )
      ).status,
    ).toBe(403);
    expect((await sesion.POST(call("/sesion", { method: "POST", origin: DIAS }))).status).toBe(403);
    expect(competitionModule.enterHubAs).not.toHaveBeenCalled();

    competitionModule.enterHubAs.mockResolvedValueOnce({
      ok: false,
      reason: "RATE_LIMITED",
      message: t("T-3037"),
    });
    const limited = await sesion.POST(
      call("/sesion", { method: "POST", origin: DIAS, json: { code: "ABCD-EFGH" } }),
    );
    expect(limited.status).toBe(429);

    competitionModule.enterHubAs.mockResolvedValueOnce({ ok: true, session });
    competitionModule.getHubState.mockResolvedValueOnce({ version: 1, balance: 1000 });
    const ok = await sesion.POST(
      call("/sesion", { method: "POST", origin: DIAS, json: { code: "ABCD-EFGH" } }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ version: 1, balance: 1000 });
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("oe_capitanes=sesion-firmada");
    expect(cookie).toContain("Path=/api/v1/the-games/hub");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie.toLowerCase()).toContain("samesite=lax");

    const out = await sesion.DELETE(call("/sesion", { method: "DELETE", origin: DIAS }));
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("apostar pide sesión y devuelve el motivo del dominio", async () => {
    const body = { marketId: "mercado1", pick: 2, stake: 300 };
    const anon = await apuestas.POST(
      call("/apuestas", { method: "POST", origin: DIAS, json: body }),
    );
    expect(anon.status).toBe(401);
    const { DomainError } = await import("@/shared/lib/errors");
    competitionModule.placeHubBetAs.mockRejectedValueOnce(new DomainError(t("T-2783")));
    const repeated = await apuestas.POST(
      call("/apuestas", { method: "POST", origin: DIAS, json: body, cookie: "valida" }),
    );
    expect(repeated.status).toBe(400);
    expect(await repeated.json()).toEqual({ error: t("T-2783") });
    competitionModule.placeHubBetAs.mockResolvedValueOnce({ betId: "b1", balance: 700 });
    competitionModule.getHubState.mockResolvedValueOnce({ version: 1, balance: 700 });
    const placed = await apuestas.POST(
      call("/apuestas", { method: "POST", origin: DIAS, json: body, cookie: "valida" }),
    );
    expect(placed.status).toBe(200);
    expect(competitionModule.placeHubBetAs).toHaveBeenLastCalledWith(
      { personId: null, ip: null },
      session,
      body,
    );
  });

  it("la verificación previa declara los métodos de cada ruta", () => {
    const preflight = sesion.OPTIONS(call("/sesion", { method: "OPTIONS", origin: DIAS }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("POST, DELETE, OPTIONS");
    expect(preflight.headers.get("access-control-allow-headers")).toBe("content-type");
  });
});
