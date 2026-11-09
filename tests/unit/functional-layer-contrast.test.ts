import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR-158, consecuencias: los contrastes de la capa funcional se comprueban con una prueba. Lee los
// valores de tokens.css, no una copia, así que un color que cambie y baje de AA pone esto en rojo.

const css = readFileSync("src/shared/brand/tokens.css", "utf8");

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`falta el bloque ${selector}`);
  const open = css.indexOf("{", start + selector.length - 1);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  throw new Error(`bloque sin cerrar: ${selector}`);
}

function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) {
    out.set(match[1] as string, (match[2] as string).trim());
  }
  return out;
}

const palette = declarations(block("@theme {"));
const light = declarations(block(":root {"));
const darkPreference = declarations(block(':root:not([data-theme="light"]) {'));
const darkChosen = declarations(block(':root[data-theme="dark"] {'));

function resolve(theme: Map<string, string>, name: string): string {
  const raw = theme.get(name);
  if (!raw) throw new Error(`--${name} no está definido en el tema`);
  const hex = /^#[0-9a-f]{6}$/i.exec(raw);
  if (hex) return raw.toLowerCase();
  const reference = /^var\(--color-(oe-[a-z-]+)\)$/.exec(raw);
  const value = reference ? palette.get(`color-${reference[1]}`) : undefined;
  if (!value) throw new Error(`--${name} no se reduce a un color fijo: ${raw}`);
  return value.toLowerCase();
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Cada texto de la capa funcional con el fondo sobre el que va (Banner, Badge, Button, Surface).
const PAIRS: Array<[texto: string, fondo: string]> = [
  ["tinta", "superficie"],
  ["titulo", "superficie"],
  ["enlace", "superficie"],
  ["tinta-secundaria", "superficie"],
  ["tinta-secundaria", "fondo"],
  ["tinta", "error-fondo"],
  ["error", "error-fondo"],
  ["tinta", "exito-fondo"],
  ["exito", "exito-fondo"],
  ["estado-tinta", "aviso-fondo"],
  ["estado-tinta", "info-fondo"],
  ["accion-mi-oe-tinta", "accion-mi-oe"],
  ["accion-operacion-tinta", "accion-operacion"],
];

describe("contraste de la capa funcional (ADR-158 regla 8)", () => {
  it.each([
    ["claro", light],
    ["oscuro", darkChosen],
  ] as const)("todo texto cumple AA en el tema %s", (_name, theme) => {
    const failures = PAIRS.flatMap(([text, background]) => {
      const ratio = contrast(resolve(theme, text), resolve(theme, background));
      return ratio >= 4.5 ? [] : [`${text} sobre ${background}: ${ratio.toFixed(2)}:1`];
    });
    expect(failures).toEqual([]);
  });

  it("el tema claro lleva los valores de ADR-158", () => {
    expect(
      ["superficie", "linea", "linea-fuerte", "tinta-secundaria"].map((name) =>
        resolve(light, name),
      ),
    ).toEqual(["#ffffff", "#e4e8ee", "#cdd4de", "#5a6473"]);
    expect([resolve(light, "error"), resolve(light, "error-fondo")]).toEqual([
      "#b42318",
      "#fdecea",
    ]);
    expect([resolve(light, "exito"), resolve(light, "exito-fondo")]).toEqual([
      "#1e6b45",
      "#e7f4ec",
    ]);
  });

  it("la preferencia del sistema y el tema elegido dan el mismo oscuro", () => {
    const names = [...darkChosen.keys()].filter((name) => name !== "grano");
    for (const name of names) {
      expect([name, darkPreference.get(name)]).toEqual([name, darkChosen.get(name)]);
    }
  });
});

describe("densidad de escritorio de la Operación (ADR-161)", () => {
  const desk = declarations(block('[data-densidad="escritorio"] {'));
  const base = declarations(block("@theme {"));
  const px = (rem: string | undefined) => Number.parseFloat(rem ?? "0") * 16;

  it("Mi OE conserva la escala de ADR-158", () => {
    expect(
      ["pantalla", "seccion", "cuerpo", "secundario", "etiqueta"].map((name) => [
        px(base.get(`text-${name}`)),
        px(base.get(`text-${name}--line-height`)),
      ]),
    ).toEqual([
      [28, 34],
      [20, 26],
      [16, 24],
      [14, 20],
      [12, 16],
    ]);
  });

  it("la Operación usa 24/30, 18/24, 14/20, 13/18 y 11/16", () => {
    expect(
      ["pantalla", "seccion", "cuerpo", "secundario", "etiqueta"].map((name) => [
        px(desk.get(`text-${name}`)),
        px(desk.get(`text-${name}--line-height`)),
      ]),
    ).toEqual([
      [24, 30],
      [18, 24],
      [14, 20],
      [13, 18],
      [11, 16],
    ]);
  });

  it("las superficies tienen esquinas de 10 px", () => {
    expect(px(base.get("radius-superficie"))).toBe(10);
  });
});
