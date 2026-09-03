import type { ReactNode } from "react";

type Props = {
  nivel?: "h1" | "h2" | "h3";
  color?: "azul" | "amarillo" | "naranja" | "sky" | "blue-soft" | "yellow-soft";
  className?: string;
  children: ReactNode;
};

const barras: Record<NonNullable<Props["color"]>, string> = {
  azul: "var(--color-oe-blue)",
  amarillo: "var(--color-oe-yellow)",
  naranja: "var(--color-oe-orange)",
  sky: "var(--color-oe-sky)",
  "blue-soft": "var(--color-oe-blue-soft)",
  "yellow-soft": "var(--color-oe-yellow-soft)",
};

// Barra de color detrás del título, que sale del borde de la pantalla (07-marca.md §7).
export function BarraTitulo({ nivel = "h2", color = "azul", className = "", children }: Props) {
  const Titulo = nivel;
  return (
    <Titulo
      className={`barra-titulo text-display-md sm:text-display-lg ${className}`}
      style={{ "--barra": barras[color] } as React.CSSProperties}
    >
      {children}
    </Titulo>
  );
}
