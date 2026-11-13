import { describe, expect, it } from "vitest";
import { diasHasta, portadaMomento } from "@/app/(public)/_ui/momento";

// ADR-189 regla 3: el titular de la portada cambia solo. Los días son civiles, en la zona de la app.
const timeZone = "America/Bogota";
const now = new Date("2026-03-10T15:00:00Z"); // martes 10 de marzo, 10:00 a. m. en Bogotá

describe("portadaMomento", () => {
  it("la convocatoria abierta manda, aunque haya un evento esta semana", () => {
    expect(
      portadaMomento({
        admisionAbierta: true,
        proximoInicio: new Date("2026-03-11T15:00:00Z"),
        now,
        timeZone,
      }),
    ).toEqual({ tipo: "convocatoria" });
  });

  it("es semana de evento desde siete días antes hasta el mismo día", () => {
    const caso = (inicio: string) =>
      portadaMomento({ admisionAbierta: false, proximoInicio: new Date(inicio), now, timeZone });
    expect(caso("2026-03-10T23:00:00Z")).toEqual({ tipo: "evento", dias: 0 });
    expect(caso("2026-03-11T13:00:00Z")).toEqual({ tipo: "evento", dias: 1 });
    expect(caso("2026-03-17T23:00:00Z")).toEqual({ tipo: "evento", dias: 7 });
    expect(caso("2026-03-18T13:00:00Z")).toEqual({ tipo: "semestre" });
  });

  it("sin convocatoria ni edición cercana, es el resto del semestre", () => {
    expect(portadaMomento({ admisionAbierta: false, proximoInicio: null, now, timeZone })).toEqual({
      tipo: "semestre",
    });
  });
});

describe("diasHasta", () => {
  it("cuenta días civiles de la zona de la app, no periodos de 24 horas", () => {
    // 11:30 p. m. del martes en Bogotá ya es miércoles en UTC: sigue siendo hoy.
    expect(diasHasta(new Date("2026-03-11T04:30:00Z"), now, timeZone)).toBe(0);
    // 12:30 a. m. del miércoles en Bogotá: mañana, aunque falten menos de 24 horas.
    expect(diasHasta(new Date("2026-03-11T05:30:00Z"), now, timeZone)).toBe(1);
    expect(diasHasta(new Date("2026-03-09T15:00:00Z"), now, timeZone)).toBe(-1);
  });
});
