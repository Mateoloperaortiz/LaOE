import { describe, expect, it } from "vitest";
import { excerpt } from "@/modules/content/domain/markdown-pure";

describe("excerpt", () => {
  it("quita títulos, énfasis, enlaces, imágenes y listas", () => {
    const markdown = [
      "## Título",
      "",
      "Texto con **negrita**, _cursiva_ y un [enlace](https://oeeafit.com).",
      "",
      "![portada](https://x/y.png)",
      "",
      "- uno",
      "- dos",
      "",
      "> cita",
    ].join("\n");
    expect(excerpt(markdown)).toBe("Título Texto con negrita, cursiva y un enlace. uno dos cita");
  });

  it("corta en una palabra y cierra con puntos suspensivos", () => {
    const largo = "palabra ".repeat(60).trim();
    const corto = excerpt(largo, 50);
    expect(corto.length).toBeLessThanOrEqual(51);
    expect(corto.endsWith("…")).toBe(true);
    expect(corto).not.toContain("palabr…");
  });

  it("devuelve vacío para un cuerpo vacío", () => {
    expect(excerpt("")).toBe("");
    expect(excerpt("   \n  ")).toBe("");
  });
});
