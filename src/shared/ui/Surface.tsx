import type { ReactNode } from "react";

// Superficie de la capa funcional (ADR-163 regla 7, sobre ADR-158 regla 3): fondo de superficie y sin
// grano, que va solo en las superficies de marca. Agrupa un formulario, una lista o una ficha.
// - `flota` va sobre el fondo: sin borde y con sombra suave en claro; con una línea y sin sombra en oscuro.
// - `plana` va dentro de otra superficie: se separa con la línea tenue y nunca lleva sombra.

type Tag = "div" | "section" | "article" | "aside";
type Variant = "flota" | "plana";

const VARIANT: Record<Variant, string> = {
  flota: "border border-superficie-borde sombra-flota",
  plana: "border border-linea-tenue",
};

export function Surface({
  as: Element = "div",
  variant = "flota",
  children,
  className = "",
}: {
  as?: Tag;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Element
      className={`rounded-tarjeta bg-superficie text-tinta ${VARIANT[variant]} ${className}`.trim()}
    >
      {children}
    </Element>
  );
}
