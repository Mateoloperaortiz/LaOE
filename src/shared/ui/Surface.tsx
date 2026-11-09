import type { ReactNode } from "react";

// Superficie de la capa funcional (ADR-158 regla 3): fondo de superficie, borde de línea y sin grano,
// que va solo en las superficies de marca (regla 6). Agrupa un formulario, una lista o una ficha.

type Tag = "div" | "section" | "article" | "aside";

export function Surface({
  as: Element = "div",
  children,
  className = "",
}: {
  as?: Tag;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Element
      className={`rounded-superficie border border-linea bg-superficie text-tinta ${className}`.trim()}
    >
      {children}
    </Element>
  );
}
