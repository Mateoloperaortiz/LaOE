import { describe, expect, it } from "vitest";
import { semesterFromCode, termInputSchema } from "@/modules/participation/domain/terms";
import { neutralizeCell, toCsv } from "@/shared/admin-kit/csv";
import { formDataToInput } from "@/shared/admin-kit/types";

describe("csv", () => {
  it("neutraliza celdas que empiezan como fórmula", () => {
    expect(neutralizeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(neutralizeCell("+57")).toBe("'+57");
    expect(neutralizeCell("-1")).toBe("'-1");
    expect(neutralizeCell("@x")).toBe("'@x");
    expect(neutralizeCell("normal")).toBe("normal");
    expect(neutralizeCell(null)).toBe("");
    expect(neutralizeCell(12)).toBe("12");
  });
  it("entrecomilla y escapa, y agrega BOM y CRLF", () => {
    const csv = toCsv(["nombre", "nota"], [{ nombre: 'Ana "La" Pérez', nota: "a,b\nc" }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Ana ""La"" Pérez","a,b\nc"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("formDataToInput", () => {
  it("vacíos a undefined, checkbox a booleano, recorta espacios", () => {
    const form = new FormData();
    form.set("name", "  Pixel ");
    form.set("color", "");
    form.set("flag", "on");
    const input = formDataToInput(form, [
      { name: "name", label: "n", type: "text" },
      { name: "color", label: "c", type: "color" },
      { name: "flag", label: "f", type: "checkbox" },
      { name: "missing", label: "m", type: "checkbox" },
    ]);
    expect(input).toEqual({ name: "Pixel", color: undefined, flag: true, missing: false });
  });
});

describe("términos", () => {
  it("deriva el semestre del código y valida fechas", () => {
    expect(semesterFromCode("2026-1")).toBe(1);
    expect(semesterFromCode("2026-2")).toBe(2);
    const ok = termInputSchema.safeParse({
      code: "2026-2",
      startsOn: "2026-07-13",
      endsOn: "2026-12-05",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.requiredOrdinaryAssemblies).toBe(1);
      expect(ok.data.permanenceGeneralNominal).toBe(50);
    }
    const bad = termInputSchema.safeParse({
      code: "2026-3",
      startsOn: "2026-07-13",
      endsOn: "2026-01-01",
    });
    expect(bad.success).toBe(false);
  });
});
