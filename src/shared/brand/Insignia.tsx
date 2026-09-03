import type { ReactNode } from "react";

type Fondo = "amarillo" | "naranja" | "azul" | "sky" | "navy" | "paper" | "cream" | "yellow-soft";

type Props = {
  fondo?: Fondo;
  className?: string;
  children: ReactNode;
};

// Combinaciones permitidas por el manual: texto navy sobre los cálidos y claros; paper sobre navy.
const estilos: Record<Fondo, string> = {
  amarillo: "bg-oe-yellow text-oe-navy",
  naranja: "bg-oe-orange text-oe-navy",
  azul: "bg-oe-blue text-oe-navy",
  sky: "bg-oe-sky text-oe-navy",
  navy: "bg-oe-navy text-oe-paper",
  paper: "bg-oe-paper text-oe-navy border border-oe-blue-soft",
  cream: "bg-oe-cream text-oe-navy border border-oe-blue-soft",
  "yellow-soft": "bg-oe-yellow-soft text-oe-navy",
};

export function Insignia({ fondo = "sky", className = "", children }: Props) {
  return (
    <span
      className={`eyebrow inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${estilos[fondo]} ${className}`}
    >
      {children}
    </span>
  );
}
