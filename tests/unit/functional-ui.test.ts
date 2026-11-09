import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { Button, buttonClass } from "@/shared/ui/Button";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { Surface } from "@/shared/ui/Surface";

// Componentes base de la capa funcional (ADR-158, tramo R6-A del rediseño).

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
});

describe("Button", () => {
  it("la acción principal es naranja en Mi OE y navy en la Operación", () => {
    expect(buttonClass({ area: "mi-oe" })).toContain("bg-accion-mi-oe");
    expect(buttonClass({ area: "operacion" })).toContain("bg-accion-operacion");
  });

  it("en la Operación el botón mide 40 px y el compacto 32 px, con esquinas de superficie", () => {
    expect(buttonClass({ area: "operacion" })).toContain("min-h-10");
    expect(buttonClass({ area: "operacion", size: "compacto" })).toContain("min-h-8");
    expect(buttonClass({ area: "operacion" })).toContain("rounded-superficie");
  });

  it("en Mi OE la zona táctil mide al menos 44 px", () => {
    expect(buttonClass({ area: "mi-oe" })).toContain("min-h-11");
    expect(buttonClass({ variant: "secundaria", area: "mi-oe" })).toContain("min-h-11");
  });

  it("un botón no envía un formulario salvo que se pida", () => {
    expect(renderToStaticMarkup(createElement(Button, null, "Guardar"))).toContain('type="button"');
    expect(renderToStaticMarkup(createElement(Button, { type: "submit" }, "Guardar"))).toContain(
      'type="submit"',
    );
  });
});

describe("Badge, Surface y ScreenHeader", () => {
  it("la etiqueta usa la escala corta y el color de su estado", () => {
    const html = renderToStaticMarkup(Badge({ tone: "exito", children: "Activo" }));
    expect(html).toContain("etiqueta-corta");
    expect(html).toContain("text-exito");
  });

  it("la superficie no lleva grano", () => {
    const html = renderToStaticMarkup(Surface({ as: "section", children: "x" }));
    expect(html.startsWith("<section")).toBe(true);
    expect(html).toContain("bg-superficie");
    expect(html).not.toContain("granito");
  });

  it("la cabecera pone el título en la capa funcional, no en la condensada", () => {
    const html = renderToStaticMarkup(
      createElement(ScreenHeader, { title: "Personas", description: "124 activas" }),
    );
    expect(html).toContain('<h1 class="titulo-pantalla');
    expect(html).toContain("text-tinta-secundaria");
  });
});
