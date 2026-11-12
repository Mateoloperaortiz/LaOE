import type { ReactNode } from "react";

// Ficha de estado de la capa funcional (ADR-158 regla 4, con el aspecto de ADR-163): 12/16, en tipo
// oración y sin borde. Marca el estado de un registro en una tabla o una ficha. Su texto ya dice el
// estado, así que el color solo acompaña.

type Tone = "neutral" | "error" | "exito" | "aviso" | "info";

const TONE: Record<Tone, string> = {
  neutral: "bg-relleno text-tinta",
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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-etiqueta font-semibold ${TONE[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
