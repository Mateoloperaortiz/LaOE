import { describe, expect, it } from "vitest";
import { parseGroupCsv } from "@/modules/permanence/domain/groups-pure";

// CSV de correos para un grupo de trabajo (ADR-036 regla 6): columna CORREO, normalización y repetidos.

describe("parseGroupCsv", () => {
  it("toma la columna CORREO, normaliza y quita repetidos y vacíos", () => {
    const csv =
      "NOMBRE;CORREO\nAna;Ana@eafit.edu.co\nBeto; beto@eafit.edu.co \nAna;ana@eafit.edu.co\nSin;\n";
    expect(parseGroupCsv(csv)).toEqual(["ana@eafit.edu.co", "beto@eafit.edu.co"]);
  });

  it("acepta una sola columna de correos sin cabecera y cabeceras con tilde o en inglés", () => {
    expect(parseGroupCsv("uno@eafit.edu.co\ndos@eafit.edu.co")).toEqual([
      "uno@eafit.edu.co",
      "dos@eafit.edu.co",
    ]);
    expect(parseGroupCsv("Email,Nombre\nx@eafit.edu.co,X")).toEqual(["x@eafit.edu.co"]);
    expect(parseGroupCsv("Correo institucional\ny@eafit.edu.co")).toEqual(["y@eafit.edu.co"]);
  });

  it("devuelve vacío cuando no hay columna de correos", () => {
    expect(parseGroupCsv("NOMBRE;APELLIDO\nAna;Pérez")).toEqual([]);
    expect(parseGroupCsv("")).toEqual([]);
  });
});
