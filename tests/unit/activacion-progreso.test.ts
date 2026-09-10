import { describe, expect, it } from "vitest";
import { calcularAvance } from "@/app/admin/personas/activacion/progreso";

describe("calcularAvance", () => {
  const filas = [
    { personId: "ana", committeeId: "a3" },
    { personId: "ana", committeeId: "pixel" },
    { personId: "beto", committeeId: "a3" },
    { personId: "caro", committeeId: "pixel" },
  ];
  const elegibles = ["ana", "beto", "caro"];

  it("cuenta personas en el total y pertenencias en cada comité", () => {
    const avance = calcularAvance(elegibles, filas, new Set(["ana"]));

    // Ana está en dos comités y cuenta una sola vez en el total general.
    expect(avance).toMatchObject({ personas: 3, activadas: 1 });
    expect(avance.porComite.get("a3")).toEqual({ activadas: 1, total: 2 });
    expect(avance.porComite.get("pixel")).toEqual({ activadas: 1, total: 2 });
  });

  it("cuenta a quien puede entrar aunque no tenga comité este semestre", () => {
    // Un honorario sin pertenencias: necesita contraseña y tiene que verse en el total.
    const avance = calcularAvance([...elegibles, "delia"], filas, new Set(["delia"]));

    expect(avance).toMatchObject({ personas: 4, activadas: 1 });
    expect(avance.porComite.get("a3")).toEqual({ activadas: 0, total: 2 });
  });

  it("no cuenta a quien tiene comité pero ya no puede entrar", () => {
    // Una persona retirada conserva su pertenencia histórica y no debe inflar el total.
    const avance = calcularAvance(["ana", "beto"], filas, new Set(["ana", "caro"]));

    expect(avance).toMatchObject({ personas: 2, activadas: 1 });
  });

  it("con nadie activado no inventa nada", () => {
    const avance = calcularAvance(elegibles, filas, new Set());

    expect(avance).toMatchObject({ personas: 3, activadas: 0 });
    expect(avance.porComite.get("a3")).toEqual({ activadas: 0, total: 2 });
  });

  it("ignora credenciales de gente que no está en la lista", () => {
    expect(calcularAvance(elegibles, filas, new Set(["ana", "fantasma"])).activadas).toBe(1);
  });

  it("un término sin gente no revienta", () => {
    expect(calcularAvance([], [], new Set(["ana"]))).toMatchObject({ personas: 0, activadas: 0 });
  });
});
