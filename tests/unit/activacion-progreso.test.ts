import { describe, expect, it } from "vitest";
import { calcularAvance } from "@/app/admin/personas/activacion/progreso";

describe("calcularAvance", () => {
  const filas = [
    { personId: "ana", committeeId: "a3" },
    { personId: "ana", committeeId: "pixel" },
    { personId: "beto", committeeId: "a3" },
    { personId: "caro", committeeId: "pixel" },
  ];

  it("cuenta personas distintas en el total y pertenencias en cada comité", () => {
    const avance = calcularAvance(filas, new Set(["ana"]));

    // Ana está en dos comités y cuenta una sola vez en el total general.
    expect(avance).toMatchObject({ personas: 3, activadas: 1 });
    expect(avance.porComite.get("a3")).toEqual({ activadas: 1, total: 2 });
    expect(avance.porComite.get("pixel")).toEqual({ activadas: 1, total: 2 });
  });

  it("con nadie activado no inventa nada", () => {
    const avance = calcularAvance(filas, new Set());

    expect(avance).toMatchObject({ personas: 3, activadas: 0 });
    expect(avance.porComite.get("a3")).toEqual({ activadas: 0, total: 2 });
  });

  it("ignora credenciales de gente que no está en el término", () => {
    const avance = calcularAvance(filas, new Set(["ana", "alguien-que-no-está"]));

    expect(avance.activadas).toBe(1);
  });

  it("un término vacío no revienta", () => {
    expect(calcularAvance([], new Set(["ana"]))).toMatchObject({ personas: 0, activadas: 0 });
  });
});
