import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ADR-158 y ADR-163, consecuencias: los contrastes de la capa funcional se comprueban con una prueba.
// Lee los valores de tokens.css, no una copia, así que un color que cambie y baje de AA pone esto en rojo.

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

function property(body: string, name: string): string | undefined {
  return new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim();
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

// Los tonos del degradado del fondo: los dos extremos y los del medio, en las dos áreas (ADR-163 regla 2).
const GRADIENT = [
  "sobrio-desde",
  "sobrio-medio-1",
  "sobrio-medio-2",
  "sobrio-hasta",
  "sobrio-medio-1-escritorio",
  "sobrio-medio-2-escritorio",
];

// Cada texto de la capa funcional con el fondo sobre el que va (Banner, Badge, Button, Chip, Surface).
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
  // Aspecto sobrio (ADR-163): relleno de control, fondo de panel, acción, lo elegido y lo que flota.
  ["tinta", "relleno"],
  ["titulo", "relleno"],
  ["tinta-secundaria", "relleno"],
  ["tinta", "panel"],
  ["titulo", "panel"],
  ["tinta-secundaria", "panel"],
  ["accion-tinta", "accion"],
  ["accion-asistencia-tinta", "accion-asistencia"],
  ["activo-tinta", "activo"],
  ["flota-tinta", "flota-desde"],
  ["flota-tinta", "flota-hasta"],
  // El texto sobre el degradado cumple AA en cada uno de sus tonos (regla 8).
  ...GRADIENT.flatMap(
    (stop): Array<[string, string]> => [
      ["tinta-sobre-fondo", stop],
      ["titulo", stop],
      ["tinta", stop],
      ["enlace", stop],
    ],
  ),
];

describe("contraste de la capa funcional (ADR-158 regla 8 y ADR-163 regla 11)", () => {
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

  it("los neutros, la acción y el fondo llevan los valores de ADR-163 en los dos temas", () => {
    const names = [
      "relleno",
      "linea-tenue",
      "panel",
      "tinta-sobre-fondo",
      "accion",
      "accion-tinta",
      "accion-asistencia",
      "activo",
      "flota-desde",
      "flota-hasta",
      "sobrio-desde",
      "sobrio-hasta",
    ];
    expect(names.map((name) => resolve(light, name))).toEqual([
      "#f2f4f7",
      "#eef0f3",
      "#fafbfc",
      "#4f5968",
      "#001f3e",
      "#f6f6f6",
      "#ff881b",
      "#e6edf8",
      "#0b3158",
      "#001f3e",
      "#dce6f4",
      "#f5f2ea",
    ]);
    expect(names.map((name) => resolve(darkChosen, name))).toEqual([
      "#16365a",
      "#1a3a5e",
      "#07264a",
      "#b4c1d2",
      "#94b6f0",
      "#001f3e",
      "#ff881b",
      "#16365a",
      "#1d4270",
      "#16365a",
      "#03203e",
      "#00152b",
    ]);
  });

  it("en claro las superficies flotan con sombra y en oscuro llevan una línea", () => {
    expect(light.get("superficie-borde")).toBe("transparent");
    expect(light.get("sombra-flota")).toContain("rgb(0 31 62");
    expect(darkChosen.get("superficie-borde")).toBe("#24456a");
    expect(darkChosen.get("sombra-flota")).toBe("none");
    expect(darkChosen.get("sombra-control")).toBe("none");
    expect(darkChosen.get("flota-linea")).toBe("#3b5e86");
  });

  it("la preferencia del sistema y el tema elegido dan el mismo oscuro", () => {
    const names = [...darkChosen.keys()].filter((name) => name !== "grano");
    for (const name of names) {
      expect([name, darkPreference.get(name)]).toEqual([name, darkChosen.get(name)]);
    }
  });
});

describe("densidad de escritorio de la Operación (ADR-161 y ADR-163)", () => {
  const desk = declarations(block('[data-densidad="escritorio"] {'));
  const base = declarations(block("@theme {"));
  const px = (rem: string | undefined) => Number.parseFloat(rem ?? "0") * 16;
  const SCALE = ["pantalla", "seccion", "cuerpo", "secundario", "etiqueta"];

  it("Mi OE conserva la escala de ADR-158", () => {
    expect(
      SCALE.map((name) => [
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

  it("la Operación usa 26/32, 18/24, 14/20 y 13/18, y la etiqueta mide 12/16 en las dos áreas", () => {
    expect(
      SCALE.map((name) => [
        px(desk.get(`text-${name}`) ?? base.get(`text-${name}`)),
        px(desk.get(`text-${name}--line-height`) ?? base.get(`text-${name}--line-height`)),
      ]),
    ).toEqual([
      [26, 32],
      [18, 24],
      [14, 20],
      [13, 18],
      [12, 16],
    ]);
  });

  it("el título de tarjeta mide 16/22 y la cifra 30/36", () => {
    expect([px(base.get("text-tarjeta")), px(base.get("text-tarjeta--line-height"))]).toEqual([
      16, 22,
    ]);
    expect([px(base.get("text-cifra")), px(base.get("text-cifra--line-height"))]).toEqual([30, 36]);
  });

  it("las esquinas miden 14 y 20 px en Mi OE, y 10 y 16 px en la Operación", () => {
    expect([px(base.get("radius-control")), px(base.get("radius-tarjeta"))]).toEqual([14, 20]);
    expect([px(desk.get("radius-control")), px(desk.get("radius-tarjeta"))]).toEqual([10, 16]);
    expect([px(base.get("radius-marco")), px(base.get("radius-barra"))]).toEqual([20, 24]);
  });

  it("el fondo va a 170° en Mi OE y a 155° en la Operación, con sus tonos del medio", () => {
    expect([
      light.get("sobrio-angulo"),
      light.get("sobrio-pos-1"),
      light.get("sobrio-pos-2"),
    ]).toEqual(["170deg", "30%", "62%"]);
    expect([desk.get("sobrio-angulo"), desk.get("sobrio-pos-1"), desk.get("sobrio-pos-2")]).toEqual(
      ["155deg", "34%", "68%"],
    );
    expect([desk.get("sobrio-medio-1"), desk.get("sobrio-medio-2")]).toEqual([
      "var(--sobrio-medio-1-escritorio)",
      "var(--sobrio-medio-2-escritorio)",
    ]);
    expect(
      [
        "sobrio-medio-1",
        "sobrio-medio-2",
        "sobrio-medio-1-escritorio",
        "sobrio-medio-2-escritorio",
      ].map((name) => resolve(light, name)),
    ).toEqual(["#edf1f6", "#f6f6f6", "#e9eef5", "#f4f4f3"]);
  });
});

describe("campos de formulario (ADR-163 regla 6, R6-B)", () => {
  const desk = declarations(block('[data-densidad="escritorio"] {'));
  const base = declarations(block("@theme {"));

  it("en Mi OE el campo es una superficie con sombra y en la Operación lleva la línea", () => {
    expect([light.get("campo-borde"), light.get("campo-sombra")]).toEqual([
      "transparent",
      "var(--sombra-control)",
    ]);
    expect([desk.get("campo-borde"), desk.get("campo-sombra")]).toEqual([
      "var(--linea-campo)",
      "none",
    ]);
  });

  it("en oscuro el campo lleva una línea, porque no hay sombras", () => {
    expect([darkChosen.get("campo-borde"), darkChosen.get("campo-sombra")]).toEqual([
      "#24456a",
      "none",
    ]);
  });

  it("un control mide 44 px en Mi OE y 40 px en la Operación", () => {
    const px = (rem: string | undefined) => Number.parseFloat(rem ?? "0") * 16;
    expect([px(base.get("alto-control")), px(desk.get("alto-control"))]).toEqual([44, 40]);
  });
});

describe("tipografía del aspecto sobrio (ADR-163 regla 3)", () => {
  const utility = (name: string) => block(`@utility ${name} {`);

  it("ningún título ni cifra pasa de peso 600", () => {
    const names = [
      "titulo-pantalla",
      "titulo-seccion",
      "titulo-ficha",
      "titulo-tarjeta",
      "cifra-resumen",
    ];
    expect(names.map((name) => property(utility(name), "font-weight"))).toEqual(
      names.map(() => "600"),
    );
  });

  it("la etiqueta corta va en peso 500, en tipo oración y sin espaciado", () => {
    const body = utility("etiqueta-corta");
    expect(property(body, "font-weight")).toBe("500");
    expect(property(body, "text-transform")).toBe("none");
    expect(property(body, "letter-spacing")).toBe("normal");
  });

  it("los títulos y las cifras van en la familia de contenido, no en la condensada", () => {
    for (const name of ["titulo-pantalla", "titulo-ficha", "cifra-resumen"]) {
      expect(property(utility(name), "font-family")).toBe("var(--font-sans)");
    }
  });
});
