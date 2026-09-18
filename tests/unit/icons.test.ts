import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CheckIcon } from "@/shared/ui/icons/CheckIcon";
import { HomeFilledIcon } from "@/shared/ui/icons/HomeFilledIcon";
import { HomeIcon } from "@/shared/ui/icons/HomeIcon";

// Fachada de iconos (ADR-076): valores de la casa y accesibilidad.
describe("iconos de la casa digital", () => {
  it("sale decorativo por defecto, con el lado y el trazo de la casa", () => {
    const html = renderToStaticMarkup(createElement(HomeIcon));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("role=");
    expect(html).toContain('width="1.25em"');
    expect(html).toContain('height="1.25em"');
    expect(html).toContain('stroke-width="1.75"');
    expect(html).toContain('stroke="currentColor"');
  });

  it("con label se anuncia como imagen y deja de estar oculto", () => {
    const html = renderToStaticMarkup(createElement(CheckIcon, { label: "Sí" }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Sí"');
    expect(html).not.toContain("aria-hidden");
  });

  it("acepta lado, trazo y clases de la pantalla sin perder las suyas", () => {
    const html = renderToStaticMarkup(
      createElement(CheckIcon, { size: 12, stroke: 3, className: "absolute right-1" }),
    );
    expect(html).toContain('width="12"');
    expect(html).toContain('stroke-width="3"');
    expect(html).toContain("absolute right-1");
    expect(html).toContain("shrink-0");
  });

  it("la familia rellena pinta con la tinta del contenedor y no lleva trazo", () => {
    const html = renderToStaticMarkup(createElement(HomeFilledIcon, { size: 22 }));
    expect(html).toContain('fill="currentColor"');
    expect(html).not.toContain("stroke-width");
  });
});
