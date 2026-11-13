import { describe, expect, it } from "vitest";
import { checkInPathFrom } from "@/shared/lib/occasion-public-id";

// El lector de «Asistencia» en Mi OE (ADR-160 regla 4): de un QR solo sale el camino de registro de
// una ocasión, y siempre en la casa donde se leyó.

const ORIGIN = "https://casa.example";

describe("el QR de una ocasión", () => {
  it("abre el registro de siempre, con o sin barra al final", () => {
    expect(checkInPathFrom("https://oeeafit.com/a/abc234defg", ORIGIN)).toBe("/a/abc234defg");
    expect(checkInPathFrom("https://oeeafit.com/a/abc234defg/", ORIGIN)).toBe("/a/abc234defg");
    expect(checkInPathFrom("  /a/abc234defg  ", ORIGIN)).toBe("/a/abc234defg");
  });

  it("no lleva a otro dominio: se queda solo con el camino", () => {
    expect(checkInPathFrom("https://otro.example/a/abc234defg?x=1", ORIGIN)).toBe("/a/abc234defg");
  });

  it("rechaza lo que no es el registro de una ocasión", () => {
    expect(checkInPathFrom("https://oeeafit.com/app/carnet", ORIGIN)).toBeNull();
    expect(checkInPathFrom("https://oeeafit.com/a/corto", ORIGIN)).toBeNull();
    expect(checkInPathFrom("https://oeeafit.com/a/ABC234DEFG", ORIGIN)).toBeNull();
    expect(checkInPathFrom("https://oeeafit.com/a/abc234defg/otra", ORIGIN)).toBeNull();
    expect(checkInPathFrom("token-de-un-carnet", ORIGIN)).toBeNull();
    expect(checkInPathFrom("http://[mal", ORIGIN)).toBeNull();
  });
});
