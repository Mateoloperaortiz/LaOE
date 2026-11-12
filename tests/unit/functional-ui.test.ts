import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { Button, buttonClass } from "@/shared/ui/Button";
import { Chip, chipClass } from "@/shared/ui/Chip";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { Surface } from "@/shared/ui/Surface";

// Componentes base de la capa funcional (ADR-158, con el aspecto sobrio de ADR-163).

describe("Banner", () => {
  it("anuncia un error como alerta y lo demás como estado, siempre con icono y texto", () => {
    for (const tone of ["error", "exito", "aviso", "info"] as const) {
      const html = renderToStaticMarkup(
        createElement(Banner, { tone, title: "Título" }, "Cuerpo del aviso"),
      );
      expect(html).toContain(`role="${tone === "error" ? "alert" : "status"}"`);
      expect(html).toContain("<svg");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain("Título");
      expect(html).toContain("Cuerpo del aviso");
    }
  });

  it("aviso e información llevan texto navy también en tema oscuro", () => {
    for (const tone of ["aviso", "info"] as const) {
      const html = renderToStaticMarkup(createElement(Banner, { tone }, "x"));
      expect(html).toContain("text-estado-tinta");
      expect(html).not.toContain("text-tinta ");
    }
  });

  it("no lleva borde y su título va en peso 600", () => {
    const html = renderToStaticMarkup(
      createElement(Banner, { tone: "error", title: "Título" }, "x"),
    );
    expect(html).not.toContain("border");
    expect(html).toContain("font-semibold");
    expect(html).not.toContain("font-bold");
  });
});

describe("Button", () => {
  it("la acción principal es navy en las dos áreas", () => {
    for (const area of ["mi-oe", "operacion"] as const) {
      const classes = buttonClass({ area });
      expect(classes).toContain("bg-accion ");
      expect(classes).toContain("text-accion-tinta");
      expect(classes).not.toContain("asistencia");
    }
  });

  it("el secundario lleva relleno de control y no lleva borde", () => {
    for (const area of ["mi-oe", "operacion"] as const) {
      const classes = buttonClass({ variant: "secundaria", area });
      expect(classes).toContain("bg-relleno");
      expect(classes).not.toContain("border");
    }
  });

  it("en la Operación el botón mide 40 px y el compacto 32 px", () => {
    expect(buttonClass({ area: "operacion" })).toContain("min-h-10");
    expect(buttonClass({ area: "operacion", size: "compacto" })).toContain("min-h-8");
  });

  it("en Mi OE la zona táctil mide al menos 44 px", () => {
    expect(buttonClass({ area: "mi-oe" })).toContain("min-h-11");
    expect(buttonClass({ variant: "secundaria", area: "mi-oe" })).toContain("min-h-11");
  });

  it("las esquinas salen del radio de control y el botón ya no es redondo", () => {
    for (const area of ["mi-oe", "operacion"] as const) {
      expect(buttonClass({ area })).toContain("rounded-control");
      expect(buttonClass({ area })).not.toContain("rounded-full");
    }
  });

  it("un botón no envía un formulario salvo que se pida", () => {
    expect(renderToStaticMarkup(createElement(Button, null, "Guardar"))).toContain('type="button"');
    expect(renderToStaticMarkup(createElement(Button, { type: "submit" }, "Guardar"))).toContain(
      'type="submit"',
    );
  });
});

describe("Chip", () => {
  it("la elegida va con el color de la acción y se anuncia como presionada", () => {
    const html = renderToStaticMarkup(createElement(Chip, { selected: true }, "Todo"));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("bg-accion ");
    expect(html).toContain("rounded-full");
  });

  it("las demás llevan relleno de control", () => {
    const html = renderToStaticMarkup(createElement(Chip, null, "Evidencias"));
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("bg-relleno");
    expect(html).toContain('type="button"');
  });

  it("mide 44 px en Mi OE y 32 px en la Operación", () => {
    expect(chipClass()).toContain("min-h-11");
    expect(chipClass({ area: "operacion" })).toContain("min-h-8");
  });
});

describe("Badge y Surface", () => {
  it("la ficha de estado va en tipo oración, sin borde y con el color de su estado", () => {
    const html = renderToStaticMarkup(Badge({ tone: "exito", children: "Activo" }));
    expect(html).toContain("text-etiqueta");
    expect(html).toContain("text-exito");
    expect(html).not.toContain("uppercase");
    expect(renderToStaticMarkup(Badge({ children: "Borrador" }))).not.toContain("border");
  });

  it("la superficie que flota lleva sombra y no lleva grano", () => {
    const html = renderToStaticMarkup(Surface({ as: "section", children: "x" }));
    expect(html.startsWith("<section")).toBe(true);
    expect(html).toContain("bg-superficie");
    expect(html).toContain("sombra-flota");
    expect(html).toContain("border-superficie-borde");
    expect(html).toContain("rounded-tarjeta");
    expect(html).not.toContain("granito");
  });

  it("la superficie plana se separa con la línea tenue y no lleva sombra", () => {
    const html = renderToStaticMarkup(Surface({ variant: "plana", children: "x" }));
    expect(html).toContain("border-linea-tenue");
    expect(html).not.toContain("sombra");
  });
});

describe("ScreenHeader", () => {
  it("pone el título en la capa funcional, no en la condensada", () => {
    const html = renderToStaticMarkup(
      createElement(ScreenHeader, { title: "Personas", description: "124 activas" }),
    );
    expect(html).toContain('<h1 class="titulo-pantalla');
    expect(html).toContain("text-tinta-secundaria");
    expect(html).not.toContain("<nav");
  });

  it("con una ruta, la ruta y las acciones van arriba del título", () => {
    const html = renderToStaticMarkup(
      createElement(ScreenHeader, {
        trail: [{ label: "Operación" }, { label: "Personas" }],
        trailLabel: "Ruta",
        title: "Miembros · 2026-2",
        actions: createElement(Button, { area: "operacion" }, "Importar roster"),
      }),
    );
    expect(html).toContain('<nav aria-label="Ruta">');
    expect(html).toContain('aria-current="page"');
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html.indexOf("<nav")).toBeLessThan(html.indexOf("<h1"));
    expect(html.indexOf("Importar roster")).toBeLessThan(html.indexOf("<h1"));
    expect(html.match(/Importar roster/g)).toHaveLength(1);
  });

  it("un paso de la ruta con destino es un enlace, salvo el actual", () => {
    const html = renderToStaticMarkup(
      createElement(ScreenHeader, {
        trail: [
          { label: "Personas", href: "/admin/personas" },
          { label: "Valeria Ochoa", href: "/admin/personas/1" },
        ],
        trailLabel: "Ruta",
        title: "Valeria Ochoa",
      }),
    );
    expect(html).toContain('href="/admin/personas"');
    expect(html).not.toContain('href="/admin/personas/1"');
  });
});
