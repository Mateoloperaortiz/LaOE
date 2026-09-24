import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

vi.mock("@/env", () => ({
  getEnv: () => ({
    APP_URL: "http://localhost:3105",
    S3_ENDPOINT: "http://localhost:3900",
    S3_BUCKET: "pruebas",
    S3_FORCE_PATH_STYLE: true,
    PUBLIC_INDEXING: false,
  }),
}));

describe("proxy y autenticación de Mi OE", () => {
  it.each([
    "/app/solicitudes?tipo=licencia",
    "/app/ajustes",
  ])("deja que la Server Action autentique y redirija con su protocolo: %s", (path) => {
    const response = proxy(
      new NextRequest(`http://localhost:3105${path}`, {
        method: "POST",
        headers: { "Next-Action": "accion-sintetica" },
      }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it.each([
    { path: "/app/solicitudes?tipo=licencia", method: "GET", headers: {} },
    { path: "/app/ajustes", method: "POST", headers: {} },
    { path: "/app/ajustes", method: "GET", headers: { "Next-Action": "accion-sintetica" } },
    { path: "/admin/personas", method: "POST", headers: { "Next-Action": "accion-sintetica" } },
  ])("conserva la redirección optimista de $method $path", ({ path, method, headers }) => {
    const response = proxy(new NextRequest(`http://localhost:3105${path}`, { method, headers }));
    const target = new URL(response.headers.get("location") ?? "http://sin-redireccion.invalid");
    expect(response.status).toBe(307);
    expect(target.pathname).toBe("/ingresar");
    expect(target.searchParams.get("next")).toBe(path);
  });

  it("la API pública v1 no pide sesión (ADR-090)", () => {
    const response = proxy(
      new NextRequest("http://localhost:3105/api/v1/the-games/the-games-2026"),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });
});
