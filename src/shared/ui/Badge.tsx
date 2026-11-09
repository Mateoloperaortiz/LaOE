import type { ReactNode } from "react";

// Etiqueta corta de la capa funcional (ADR-158 reglas 2 y 4): 12/16, peso 700, en mayúsculas
// espaciadas. Marca el estado de un registro en una tabla o una ficha. Su texto ya dice el estado, así
// que el color solo acompaña.

type Tone = "neutral" | "error" | "exito" | "aviso" | "info";

const TONE: Record<Tone, string> = {
  neutral: "border border-linea bg-superficie text-tinta-secundaria",
  error: "bg-error-fondo text-error",
  exito: "bg-exito-fondo text-exito",
  aviso: "bg-aviso-fondo text-estado-tinta",
  info: "bg-info-fondo text-estado-tinta",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`etiqueta-corta inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${TONE[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
