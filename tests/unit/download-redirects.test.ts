import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as documentPdf } from "@/app/api/documentos/[id]/pdf/route";
import { GET as exportCsv } from "@/app/api/export/[tipo]/route";
import { GET as personalData } from "@/app/api/mis-datos/route";

const identity = vi.hoisted(() => ({
  getActor: vi.fn(),
  hasPermission: vi.fn(),
  hasRecentStepUp: vi.fn(),
}));

vi.mock("@/env", () => ({ getEnv: () => ({ APP_URL: "https://oe-sintetica.example" }) }));
vi.mock("@/modules/identity", () => identity);
vi.mock("@/modules/comms", () => ({}));
vi.mock("@/modules/content", () => ({}));
vi.mock("@/modules/crm", () => ({}));
vi.mock("@/modules/participation", () => ({}));
vi.mock("@/modules/people", () => ({}));
vi.mock("@/modules/system", () => ({}));
vi.mock("@/modules/wallet", () => ({}));
vi.mock("@/shared/admin-kit", () => ({}));
vi.mock("@/app/admin/_kit/registry", () => ({
  getResource: () => ({ access: "ADMIN", personalData: true }),
}));

function internalRequest(path: string): Request {
  return new Request(`http://0.0.0.0:8080${path}`, {
    headers: { "x-forwarded-host": "origen-ajeno.example" },
  });
}

function expectLogin(response: Response, path: string, login = "/ingresar"): void {
  const location = new URL(response.headers.get("location") ?? "http://sin-redireccion.invalid");
  expect(response.status).toBe(302);
  expect(location.origin).toBe("https://oe-sintetica.example");
  expect(location.pathname).toBe(login);
  expect(location.searchParams.get("next")).toBe(path);
}

beforeEach(() => {
  vi.resetAllMocks();
  identity.getActor.mockResolvedValue(null);
});

describe("descargas detrás del proxy de Railway", () => {
  it("mis datos vuelve al ingreso público sin exponer la dirección interna", async () => {
    const path = "/api/mis-datos";
    expectLogin(await personalData(internalRequest(path)), path);
  });

  it("el PDF conserva su ruta al pedir sesión en el origen público", async () => {
    const path = "/api/documentos/documentosintetico/pdf";
    const response = await documentPdf(internalRequest(path), {
      params: Promise.resolve({ id: "documentosintetico" }),
    });
    expectLogin(response, path);
  });

  it("el exporte conserva los filtros al pedir sesión", async () => {
    const path = "/api/export/personas?q=prueba&comite=demo";
    const response = await exportCsv(internalRequest(path), {
      params: Promise.resolve({ tipo: "personas" }),
    });
    expectLogin(response, path);
  });

  it("el exporte pide un código reciente en el origen público", async () => {
    identity.getActor.mockResolvedValue({ isAdmin: true });
    identity.hasRecentStepUp.mockReturnValue(false);
    const path = "/api/export/personas?q=prueba&comite=demo";
    const response = await exportCsv(internalRequest(path), {
      params: Promise.resolve({ tipo: "personas" }),
    });
    expectLogin(response, path, "/ingresar/paso");
  });
});
