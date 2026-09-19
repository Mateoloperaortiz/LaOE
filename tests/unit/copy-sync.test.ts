import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { textos } from "@/shared/copy/textos.generated";
import { COPY_SOURCE, parseCopy } from "../../scripts/lib/copy";

describe("catálogo de textos", () => {
  it("el generado coincide con docs/14: si falla, corré npm run copy:sync", () => {
    expect(textos).toEqual(parseCopy(readFileSync(COPY_SOURCE, "utf8")));
  });

  it("rechaza filas incompletas y códigos repetidos", () => {
    expect(() => parseCopy("| T-001 | Donde | Texto |")).toThrow("Fila de copy incompleta");
    const row = "| T-001 | Donde | Texto | COM | Propuesta |";
    expect(() => parseCopy(`${row}\n${row}`)).toThrow("Código repetido");
  });

  it("conserva una barra escapada dentro de una celda", () => {
    const entries = parseCopy("| T-001 | Donde | Uno \\| dos | COM | Propuesta |");
    expect(entries["T-001"]?.text).toBe("Uno | dos");
  });
});
