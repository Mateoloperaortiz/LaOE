import { describe, expect, it } from "vitest";
import { activeAdminHref } from "@/shared/admin-kit/navigation";

describe("destino administrativo activo", () => {
  const hrefs = [
    "/admin",
    "/admin/personas",
    "/admin/personas/importar",
    "/admin/documentos",
    "/admin/comites/a3",
    "/admin/comites/a3/permanencia",
  ];
  it("elige el destino más específico y no activa Inicio en sus descendientes", () => {
    expect(activeAdminHref("/admin", hrefs)).toBe("/admin");
    expect(activeAdminHref("/admin/personas/importar", hrefs)).toBe("/admin/personas/importar");
    expect(activeAdminHref("/admin/comites/a3/permanencia", hrefs)).toBe(
      "/admin/comites/a3/permanencia",
    );
    expect(activeAdminHref("/admin/documentos/id", hrefs)).toBe("/admin/documentos");
  });
  it("exige frontera de segmento y no inventa destinos", () => {
    expect(activeAdminHref("/admin/personas-extra", hrefs)).toBeUndefined();
    expect(activeAdminHref("/admin/otra", hrefs)).toBeUndefined();
    expect(activeAdminHref("/app", hrefs)).toBeUndefined();
  });
});
