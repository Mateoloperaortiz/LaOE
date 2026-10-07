import { describe, expect, it, vi } from "vitest";
import { getResource } from "@/app/admin/_kit/registry";
import { GET as exportCsv } from "@/app/api/export/[tipo]/route";

// Con el registro real de recursos: a qué pantalla vuelve un enlace de exporte que la interfaz arma
// a mano (ADR-113, regla 10). El resto de la regla está en `download-redirects.test.ts`.

vi.mock("@/env", () => ({
  getEnv: () => ({
    APP_URL: "https://oe-sintetica.example",
    APP_TIMEZONE: "America/Bogota",
    DATABASE_URL: "postgres://sintetico:sintetico@127.0.0.1:1/sintetico",
  }),
}));
// El barrel de marca carga next/font, que no existe fuera de Next.
vi.mock("@/shared/brand", () => ({}));
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getActor: async () => null,
}));

/** Sin sesión, el destino de vuelta que nombra el exporte para ese enlace. */
async function comeBack(href: string): Promise<string> {
  const tipo = new URL(href, "http://local").pathname.split("/").pop() ?? "";
  const response = await exportCsv(new Request(`http://0.0.0.0:8080${href}`), {
    params: Promise.resolve({ tipo }),
  });
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location") ?? "http://sin-redireccion.invalid");
  expect(`${location.origin}${location.pathname}`).toBe("https://oe-sintetica.example/ingresar");
  return location.searchParams.get("next") ?? "";
}

describe("un enlace de exporte armado a mano vuelve a la pantalla que lo origina", () => {
  it("el de la junta vuelve al panel de la junta, con su término", async () => {
    expect(await comeBack("/api/export/junta?termId=terminosintetico")).toBe(
      "/admin/junta?termId=terminosintetico&descarga=1",
    );
  });

  it("el de cumplimiento vuelve a cumplimiento de permanencia, con su término y su filtro", async () => {
    expect(await comeBack("/api/export/permanencia?termId=terminosintetico&filtro=todos")).toBe(
      "/admin/permanencia/cumplimiento?termId=terminosintetico&filtro=todos&descarga=1",
    );
  });

  it("el de un segmento vuelve a la lista de segmentos, no al listado de personas", async () => {
    const column = getResource("segmentos")?.columns.find((item) => item.key === "export");
    const cell = column?.render({ id: "segmentosintetico" } as never);
    const href = typeof cell === "object" && cell !== null && "href" in cell ? cell.href : "";
    expect(href).toContain("/api/export/personas?segmento=segmentosintetico");
    expect(await comeBack(String(href))).toBe("/admin/segmentos?descarga=1");
  });
});
