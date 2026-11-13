import type { ReactNode } from "react";
import { type CartelVariante, Elemento, type ElementoTipo } from "@/shared/brand";

type AficheProps = {
  variante: CartelVariante;
  titulo: ReactNode;
  /** La portada lleva el titular más grande; las demás páginas, el tamaño de página. */
  tamano?: "portada" | "pagina";
  eyebrow?: ReactNode;
  bajada?: ReactNode;
  /** El lado gráfico: una imagen ya publicada o un panel con un elemento de la marca. */
  visual?: ReactNode;
  className?: string;
  children?: ReactNode;
};

// El afiche del portal (ADR-189 regla 2): una banda de borde a borde con los colores y el grano de un
// cartel. Como el cartel, no cambia con el tema. Abre cada página con su título a tamaño de afiche.
export function Afiche({
  variante,
  titulo,
  tamano = "pagina",
  eyebrow,
  bajada,
  visual,
  className = "",
  children,
}: AficheProps) {
  return (
    <header
      className={`cartel portal-afiche ${className}`}
      data-variante={variante}
      data-tamano={tamano}
    >
      <div className="portal-afiche-inner">
        <div className="portal-afiche-texto">
          {eyebrow ? <div className="portal-afiche-eyebrow">{eyebrow}</div> : null}
          <h1>{titulo}</h1>
          {bajada ? <p className="portal-afiche-bajada">{bajada}</p> : null}
          {children}
        </div>
        {visual ? <div className="portal-afiche-visual">{visual}</div> : null}
      </div>
    </header>
  );
}

type SelloProps = {
  arriba: string;
  grande: string;
  abajo?: string;
  color?: "amarillo" | "naranja";
  posicion?: "abajo" | "arriba";
};

/** Sello redondo del afiche: un dato corto en la condensada («Desde 1987», «Faltan 3 días»). */
export function SelloRedondo({
  arriba,
  grande,
  abajo,
  color = "amarillo",
  posicion = "abajo",
}: SelloProps) {
  return (
    <p className="portal-sello-redondo" data-color={color} data-posicion={posicion}>
      <span>{arriba}</span> <span className="portal-sello-grande">{grande}</span>
      {abajo ? (
        <>
          {" "}
          <span>{abajo}</span>
        </>
      ) : null}
    </p>
  );
}

type PanelProps = {
  elemento?: ElementoTipo;
  children?: ReactNode;
};

/** El lado gráfico del afiche: un elemento de la marca, o la imagen que llegue como hijo. */
export function PanelGrafico({ elemento = "asterisco", children }: PanelProps) {
  return (
    <div className="portal-panel">
      <Elemento tipo={elemento} className="portal-panel-elemento" />
      <span className="portal-panel-barras" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {children}
    </div>
  );
}
