import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as documentPdf } from "@/app/api/documentos/[id]/pdf/route";
import { GET as exportCsv } from "@/app/api/export/[tipo]/route";
import { GET as personalData } from "@/app/api/mis-datos/route";
import { safeNextPath } from "@/modules/identity/domain/pure";

const identity = vi.hoisted(() => ({
  getActor: vi.fn(),
  hasPermission: vi.fn(),
  hasRecentStepUp: vi.fn(),
}));

vi.mock("@/env", () => ({ getEnv: () => ({ APP_URL: "https://oe-sintetica.example" }) }));
vi.mock("@/modules/identity", () => identity);
vi.mock("@/modules/comms", () => ({}));
vi.mock("@/modules/competition", () => ({}));
vi.mock("@/modules/content", () => ({}));
vi.mock("@/modules/crm", () => ({}));
vi.mock("@/modules/participation", () => ({}));
vi.mock("@/modules/people", () => ({}));
vi.mock("@/modules/system", () => ({}));
vi.mock("@/modules/wallet", () => ({}));
vi.mock("@/shared/admin-kit", () => ({}));
vi.mock("@/app/admin/_kit/registry", () => ({
  getResource: () => ({ access: "ADMIN", personalData: true, basePath: "/admin/personas" }),
}));

function internalRequest(path: string): Request {
  return new Request(`http://0.0.0.0:8080${path}`, {
    headers: { "x-forwarded-host": "origen-ajeno.example" },
  });
}

function exportRequest(path: string): Promise<Response> {
  return exportCsv(internalRequest(path), { params: Promise.resolve({ tipo: "personas" }) });
}

/** A dónde manda la ruta y qué destino de vuelta nombra, siempre en el origen público. */
function gate(response: Response): { path: string; next: string } {
  const location = new URL(response.headers.get("location") ?? "http://sin-redireccion.invalid");
  expect(response.status).toBe(302);
  expect(location.origin).toBe("https://oe-sintetica.example");
  return { path: location.pathname, next: location.searchParams.get("next") ?? "" };
}

beforeEach(() => {
  vi.resetAllMocks();
  identity.getActor.mockResolvedValue(null);
});

describe("una descarga que pide sesión o paso de seguridad vuelve a su pantalla", () => {
  it("un ADMIN sin paso de seguridad reciente vuelve del paso al listado del exporte, con su búsqueda y la marca", async () => {
    identity.getActor.mockResolvedValue({ isAdmin: true });
    identity.hasRecentStepUp.mockReturnValue(false);
    const { path, next } = gate(await exportRequest("/api/export/personas?q=prueba&comite=demo"));
    expect(path).toBe("/ingresar/paso");
    // El paso de seguridad filtra su destino con `safeNextPath`: el que nombra la ruta lo pasa.
    expect(safeNextPath(next, "/admin")).toBe(next);
    expect(next).toBe("/admin/personas?q=prueba&comite=demo&descarga=1");
  });

  it("el exporte sin sesión manda al ingreso y vuelve al listado, no a la ruta de API", async () => {
    const { path, next } = gate(await exportRequest("/api/export/personas?q=prueba&comite=demo"));
    expect(path).toBe("/ingresar");
    expect(safeNextPath(next)).toBe(next);
    expect(next).toBe("/admin/personas?q=prueba&comite=demo&descarga=1");
  });

  it("mis datos sin sesión manda al ingreso y vuelve a la sección de Ajustes que los descarga", async () => {
    const { path, next } = gate(await personalData(internalRequest("/api/mis-datos")));
    expect(path).toBe("/ingresar");
    expect(safeNextPath(next)).toBe(next);
    expect(next).toBe("/app/ajustes?descarga=1");
  });

  it("el exporte de un recurso montado bajo otra ruta vuelve a la pantalla que nombra el enlace", async () => {
    identity.getActor.mockResolvedValue({ isAdmin: true });
    identity.hasRecentStepUp.mockReturnValue(false);
    const screen = "/admin/eventos/evento1/ediciones/edicion1/inscritos?q=ana&pagina=2";
    const { path, next } = gate(
      await exportRequest(
        `/api/export/personas?editionId=edicion1&q=ana&pantalla=${encodeURIComponent(screen)}`,
      ),
    );
    expect(path).toBe("/ingresar/paso");
    expect(safeNextPath(next, "/admin")).toBe(next);
    expect(next).toBe(`${screen}&descarga=1`);
  });

  it("la pantalla nombrada vale con la búsqueda tal como la escribe el listado: espacios, tildes y asteriscos", async () => {
    const screen = `/admin/personas?${new URLSearchParams({ q: "ana maría*", pagina: "3" })}`;
    const { next } = gate(
      await exportRequest(`/api/export/personas?pantalla=${encodeURIComponent(screen)}`),
    );
    expect(screen).toBe("/admin/personas?q=ana+mar%C3%ADa*&pagina=3");
    expect(safeNextPath(next)).toBe(next);
    expect(next).toBe(`${screen}&descarga=1`);
  });

  it("una pantalla nombrada que no es una ruta del admin se descarta y vale el listado del recurso", async () => {
    const rejected = [
      "https://ajeno.example/admin/personas",
      "//ajeno.example/admin/personas",
      "/admin/../api/export/personas",
      "/admin/%2e%2e/api/export/personas",
      "/admin\\..\\api",
      "/administrador",
      "/api/export/personas",
      "/ingresar/paso",
      "/app/ajustes",
      "/admin/personas#fragmento",
      "",
    ];
    for (const screen of rejected) {
      const { next } = gate(
        await exportRequest(`/api/export/personas?q=ana&pantalla=${encodeURIComponent(screen)}`),
      );
      expect(next, screen).toBe("/admin/personas?q=ana&descarga=1");
    }
  });

  it("la marca no se repite cuando la descarga se pide desde una pantalla que ya la traía", async () => {
    const screen = "/admin/personas?q=ana&descarga=1";
    const { next } = gate(
      await exportRequest(`/api/export/personas?q=ana&pantalla=${encodeURIComponent(screen)}`),
    );
    expect(next).toBe(screen);
  });
});

describe("descargas que todavía nombran su propia ruta (DT-061, pendientes)", () => {
  it("el PDF conserva su ruta al pedir sesión en el origen público", async () => {
    const pdfPath = "/api/documentos/documentosintetico/pdf";
    const response = await documentPdf(internalRequest(pdfPath), {
      params: Promise.resolve({ id: "documentosintetico" }),
    });
    expect(gate(response)).toEqual({ path: "/ingresar", next: pdfPath });
  });
});
