import type { ReactNode } from "react";
import "../app/member.css";

// El marco de las pantallas de acceso (ADR-188): ingreso, código, paso de seguridad, activación,
// autorización, baja de campañas y check-in por QR. Son pantallas de trabajo (ADR-158 regla 1), así
// que llevan la capa funcional con el aspecto de Mi OE (ADR-163 regla 10): el fondo con degradado, los
// títulos en tipo oración, la acción en navy y los campos con sombra suave. Las reglas son las mismas
// que revisten las páginas de siempre dentro de Mi OE; por eso comparten hoja de estilos.
export function AccessFrame({ children }: { children: ReactNode }) {
  return (
    <div className="acceso-shell fondo-sobrio" data-capa="funcional">
      {children}
    </div>
  );
}
