import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/mis-datos/route";

const calls = vi.hoisted(() => ({
  getActor: vi.fn(),
  collectPersonalData: vi.fn(),
  recordSelfExport: vi.fn(),
}));

vi.mock("@/env", () => ({ getEnv: () => ({ APP_URL: "https://oe-sintetica.example" }) }));
vi.mock("@/app/_lib/actor", () => ({ actorContext: vi.fn() }));
vi.mock("@/modules/identity", async () => {
  const { hasRecentStepUp } = await import("@/modules/identity/domain/guards");
  return { getActor: calls.getActor, hasRecentStepUp };
});
vi.mock("@/modules/people", () => ({ collectPersonalData: calls.collectPersonalData }));
vi.mock("@/modules/system", () => ({ recordSelfExport: calls.recordSelfExport }));
vi.mock("@/modules/comms", () => ({}));
vi.mock("@/modules/competition", () => ({}));
vi.mock("@/modules/crm", () => ({}));
vi.mock("@/modules/forms", () => ({}));
vi.mock("@/modules/participation", () => ({}));
vi.mock("@/modules/permanence", () => ({}));
vi.mock("@/modules/wallet", () => ({}));

beforeEach(() => {
  vi.resetAllMocks();
  calls.collectPersonalData.mockResolvedValue(null);
});

describe("la descarga de Mis datos confirma la identidad antes de leer y auditar", () => {
  it.each([
    ["sin sesión", null, "/ingresar"],
    [
      "con el paso de seguridad vencido",
      { personId: "persona-sintetica", otpVerifiedAt: new Date(Date.now() - 16 * 60_000) },
      "/ingresar/paso",
    ],
  ])("%s vuelve a Ajustes con el aviso de descarga pendiente", async (_label, actor, path) => {
    calls.getActor.mockResolvedValue(actor);
    const response = await GET();
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get("location") ?? "https://sin-destino.invalid");
    expect(target.origin).toBe("https://oe-sintetica.example");
    expect(target.pathname).toBe(path);
    expect(target.searchParams.get("next")).toBe("/app/ajustes?descarga=1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(calls.collectPersonalData).not.toHaveBeenCalled();
    expect(calls.recordSelfExport).not.toHaveBeenCalled();
  });

  it("con paso reciente consulta solamente a la persona de la sesión", async () => {
    calls.getActor.mockResolvedValue({
      personId: "persona-sintetica",
      otpVerifiedAt: new Date(),
    });
    expect((await GET()).status).toBe(404);
    expect(calls.collectPersonalData).toHaveBeenCalledExactlyOnceWith("persona-sintetica");
    expect(calls.recordSelfExport).not.toHaveBeenCalled();
  });
});
