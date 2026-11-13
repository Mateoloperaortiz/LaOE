import { describe, expect, it } from "vitest";
import { matchDestinations, type PaletteResult } from "@/shared/admin-kit/CommandPalette";

// La paleta busca los destinos del actor en el navegador (ADR-165 regla 2): por su etiqueta, sin
// mirar acentos ni mayúsculas, y desde dos letras, como la búsqueda del servidor.

const destination = (title: string, href: string): PaletteResult => ({
  type: "destination",
  id: href,
  title,
  subtitle: null,
  href,
});

const DESTINATIONS = [
  destination("Mesa", "/admin/mesa"),
  destination("Evaluaciones", "/admin/permanencia/evaluaciones"),
  destination("Comités", "/admin/comites"),
  destination("Jornada de activación", "/admin/personas/activacion"),
];

describe("destinos de la paleta", () => {
  it("encuentra por cualquier parte de la etiqueta, sin acentos ni mayúsculas", () => {
    expect(matchDestinations(DESTINATIONS, "comites").map((item) => item.href)).toEqual([
      "/admin/comites",
    ]);
    expect(matchDestinations(DESTINATIONS, "ACTIVACIÓN").map((item) => item.href)).toEqual([
      "/admin/personas/activacion",
    ]);
    expect(matchDestinations(DESTINATIONS, "  me ").map((item) => item.href)).toEqual([
      "/admin/mesa",
    ]);
  });

  it("con menos de dos letras no busca", () => {
    expect(matchDestinations(DESTINATIONS, "m")).toEqual([]);
    expect(matchDestinations(DESTINATIONS, "   ")).toEqual([]);
  });

  it("muestra a lo sumo seis", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      destination(`Destino ${index}`, `/admin/d${index}`),
    );
    expect(matchDestinations(many, "destino")).toHaveLength(6);
  });
});
