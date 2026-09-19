import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { textosCliente } from "@/shared/copy/textos.client.generated";
import { textos } from "@/shared/copy/textos.generated";
import { COPY_SOURCE, clientCopyOf, collectClientCodes, parseCopy } from "../../scripts/lib/copy";

describe("catálogo de textos", () => {
  it("el generado coincide con docs/14: si falla, corré npm run copy:sync", () => {
    expect(textos).toEqual(parseCopy(readFileSync(COPY_SOURCE, "utf8")));
  });

  it("el subconjunto de cliente trae los códigos que usa el navegador: si falla, corré npm run copy:sync", () => {
    const entries = parseCopy(readFileSync(COPY_SOURCE, "utf8"));
    expect(textosCliente).toEqual(clientCopyOf(entries, collectClientCodes()));
  });

  it("el subconjunto de cliente es una fracción del catálogo y no lleva metadatos editoriales", () => {
    const codes = Object.keys(textosCliente);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.length).toBeLessThan(Object.keys(textos).length / 4);
    expect(Object.values(textosCliente).every((text) => typeof text === "string")).toBe(true);
  });

  it("un código de cliente que no está en el inventario detiene la generación", () => {
    expect(() => clientCopyOf({}, ["T-001"])).toThrow("T-001");
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
