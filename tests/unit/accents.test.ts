import { describe, expect, it } from "vitest";
import { stripAccents } from "@/shared/lib/accents";

// DT-074 (ADR-122 regla 11): la función única de quitar acentos, por sus tres conjuntos. Lo que hace
// con ella cada sitio está en `accent-stripping.test.ts`.

const SETS = ["BLOCK", "MARKS", "DIACRITICS"] as const;
const bySet = (value: string) => SETS.map((marks) => stripAccents(value, marks));

describe("stripAccents", () => {
  it("en español los tres conjuntos dan lo mismo, compuesto o descompuesto, y no tocan mayúsculas ni espacios", () => {
    const text = "  Ñandú GÜIRO, canción y pingüino  ";
    const plain = "  Nandu GUIRO, cancion y pinguino  ";
    expect(bySet(text)).toEqual([plain, plain, plain]);
    expect(bySet(text.normalize("NFD"))).toEqual([plain, plain, plain]);
  });

  it("una marca de fuera del bloque solo la quita «toda marca»", () => {
    expect(bySet("a\u20d7b")).toEqual(["a\u20d7b", "ab", "a\u20d7b"]);
    expect(bySet("cafe\ufe0f")).toEqual(["cafe\ufe0f", "cafe", "cafe\ufe0f"]);
  });

  it("un acento suelto solo lo quitan «los diacríticos»", () => {
    expect(bySet("a\u00b4b")).toEqual(["a\u00b4b", "a\u00b4b", "ab"]);
    expect(bySet("^`\u00a8")).toEqual(["^`\u00a8", "^`\u00a8", ""]);
  });

  it("una marca del bloque que no es un diacrítico la dejan «los diacríticos»", () => {
    expect(bySet("a\u034fb")).toEqual(["ab", "ab", "a\u034fb"]);
  });
});
