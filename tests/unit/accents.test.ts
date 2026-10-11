import { describe, expect, it } from "vitest";
import { stripAccents } from "@/shared/lib/accents";

// DT-074 y DT-332 (ADR-122 regla 11, ADR-123 regla 18): la función única de quitar acentos, que quita
// un solo conjunto, toda marca. Acá queda qué texto sale distinto de como salía en los sitios que
// quitaban solo el bloque U+0300 a U+036F o los diacríticos, y cuál sale igual que antes en los ocho.
// Lo que hace con ella cada sitio está en `accent-stripping.test.ts`.

const ARROW = "\u20d7";
const VARIANT = "\ufe0f";
const LOOSE_ACUTE = "\u00b4";
const JOINER = "\u034f";

describe("quitar acentos: un solo conjunto de marcas para los ocho sitios", () => {
  it("el español sale igual compuesto o descompuesto, y no se tocan mayúsculas ni espacios", () => {
    const text = "  Ñandú GÜIRO, canción y pingüino  ";
    const plain = "  Nandu GUIRO, cancion y pinguino  ";
    expect(stripAccents(text)).toBe(plain);
    expect(stripAccents(text.normalize("NFD"))).toBe(plain);
  });

  it("el español y lo que solo lleva marcas del bloque salen como salían en los ocho", () => {
    expect(stripAccents("Pingüino Ñame á")).toBe("Pinguino Name a");
    // Vietnamita: todas sus marcas son del bloque, y la Đ no se descompone.
    expect(stripAccents("Nguyễn Thị Hồng Đào")).toBe("Nguyen Thi Hong Đao");
    // Griego con tono.
    expect(stripAccents("Ελλάδα")).toBe("Ελλαδα");
  });

  it("las marcas de fuera del bloque se quitan en todos: antes solo en la importación de GH Points y los buscadores de comités", () => {
    // Árabe con vocales (U+064E, U+064F, U+0651): «muhammad» queda en sus cuatro consonantes.
    expect(stripAccents("\u0645\u064f\u062d\u064e\u0645\u064e\u0651\u062f")).toBe(
      "\u0645\u062d\u0645\u062f",
    );
    // Hebreo con puntos.
    expect(stripAccents("\u05e9\u05b8\u05c1\u05dc\u05d5\u05b9\u05dd")).toBe(
      "\u05e9\u05dc\u05d5\u05dd",
    );
    // El selector de variante de un emoji (U+FE0F) y la flecha combinante (U+20D7).
    expect(stripAccents(`café \u2764${VARIANT}`)).toBe("cafe \u2764");
    expect(stripAccents(`a${ARROW}b`)).toBe("ab");
    // Las vocales del tailandés y del devanagari y la marca sonora del japonés también son marcas:
    // el texto pierde más que un acento, y dos palabras distintas pueden quedar iguales.
    expect(stripAccents("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35")).toBe("\u0e2a\u0e27\u0e2a\u0e14");
    expect(stripAccents("\u0939\u093f\u0902\u0926\u0940")).toBe("\u0939\u0926");
    expect(stripAccents("\u304c")).toBe("\u304b");
  });

  it("lo que no es una marca se queda en todos: antes el selector múltiple del admin quitaba los acentos sueltos", () => {
    for (const kept of [
      // Acentos sueltos, los que deja una tecla muerta, y el punto medio.
      `caf${LOOSE_ACUTE}e`,
      "a^b`c\u00a8d\u00b7e",
      // Un emoji con modificador de tono de piel (U+1F3FD): el modificador es un símbolo.
      "ok \u{1f44d}\u{1f3fd}",
      // Un emoji compuesto con el unidor de ancho cero (U+200D).
      "\u{1f469}\u200d\u{1f4bb}",
      // La prolongación del katakana (U+30FC), que es un diacrítico y no una marca.
      "\u30ab\u30fc",
    ]) {
      expect(stripAccents(kept), JSON.stringify(kept)).toBe(kept);
    }
  });

  it("el unidor de grafemas (U+034F) se quita en todos: antes el selector múltiple del admin lo dejaba", () => {
    expect(stripAccents(`a${JOINER}b`)).toBe("ab");
  });
});
