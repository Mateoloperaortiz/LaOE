import { describe, expect, it } from "vitest";
import { preservePageScroll } from "@/shared/lib/navigation-scroll";

describe("desplazamiento de una navegación dentro de la página", () => {
  it.each([
    "/app/gh-points?tablero=veteranos",
    "?tablero=comites",
    "/app/gh-points",
    "",
    "./gh-points?tablero=nuevos",
  ])("conserva el lugar al actualizar o limpiar la consulta: %s", (href) => {
    expect(preservePageScroll(href, "/app/gh-points")).toBe(true);
  });

  it("admite los destinos de Next expresados como objeto", () => {
    expect(
      preservePageScroll(
        { pathname: "/app/gh-points", query: { tablero: "comites" } },
        "/app/gh-points",
      ),
    ).toBe(true);
    expect(preservePageScroll({ query: { tablero: "nuevos" } }, "/app/gh-points")).toBe(true);
  });

  it.each([
    "/app",
    "/app/gh-points/coleccion",
    "#rankings",
    "#",
    "/app/gh-points?tablero=comites#rankings",
    "https://externo.invalid/app/gh-points?tablero=comites",
    "//externo.invalid/app/gh-points",
    "mailto:prueba@example.invalid",
    "https://[url-invalida",
  ])("respeta otra página, ancla o destino externo: %s", (href) => {
    expect(preservePageScroll(href, "/app/gh-points")).toBe(false);
  });

  it("compara el origen real cuando el destino es absoluto", () => {
    expect(
      preservePageScroll(
        "https://app.example.invalid/app/gh-points?tablero=veteranos",
        "/app/gh-points",
        "https://app.example.invalid",
      ),
    ).toBe(true);
  });

  it("no fuerza una política sin ruta actual o con un objeto externo o ancla", () => {
    expect(preservePageScroll("?tablero=comites", null)).toBe(false);
    expect(preservePageScroll({ hash: "rankings" }, "/app/gh-points")).toBe(false);
    expect(
      preservePageScroll(
        { hostname: "externo.invalid", pathname: "/app/gh-points" },
        "/app/gh-points",
      ),
    ).toBe(false);
  });
});
