import type { ReactNode } from "react";
import { LogoComite } from "./LogoComite";
import { IsotipoDecorativo } from "./LogoOE";

export type CartelVariante = "paper" | "azul" | "amarillo" | "naranja" | "navy";

type Props = {
  variante: CartelVariante;
  titulo: ReactNode;
  /** Nivel del encabezado del título. */
  nivel?: "h1" | "h2" | "h3";
  eyebrow?: ReactNode;
  subtitulo?: ReactNode;
  comite?: { slug: string; name: string };
  /** Elemento gráfico opcional detrás del título. */
  elemento?: ReactNode;
  /** Isotipo decorativo a baja opacidad (activado por defecto). */
  isotipo?: boolean;
  tamano?: "hero" | "tarjeta";
  className?: string;
  children?: ReactNode;
};

// Portada tipográfica en cinco fondos con textura (07-marca.md §7 y §9). No cambia con el tema.
export function Cartel({
  variante,
  titulo,
  nivel = "h2",
  eyebrow,
  subtitulo,
  comite,
  elemento,
  isotipo = true,
  tamano = "tarjeta",
  className = "",
  children,
}: Props) {
  const Titulo = nivel;
  const esHero = tamano === "hero";
  return (
    <div
      data-variante={variante}
      className={`cartel ${variante === "paper" ? "border border-oe-blue-soft" : ""} ${esHero ? "min-h-[24rem] p-8 sm:p-12 lg:p-16" : "min-h-[15rem] p-6 sm:p-8"} flex flex-col ${className}`}
    >
      {isotipo ? (
        <IsotipoDecorativo
          size={esHero ? 460 : 240}
          className={`pointer-events-none absolute opacity-[0.1] ${esHero ? "-right-[22%] -bottom-[30%] max-sm:scale-[0.6] sm:-right-[8%] sm:-bottom-[24%]" : "-right-[18%] -bottom-[36%]"}`}
        />
      ) : null}
      {elemento ? (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {elemento}
        </div>
      ) : null}
      <div className="relative z-10 flex flex-1 flex-col gap-4">
        {comite ? (
          <LogoComite slug={comite.slug} name={comite.name} size={esHero ? 140 : 72} />
        ) : null}
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <Titulo
          className={`font-display uppercase ${esHero ? "text-display-lg sm:text-display-xl lg:text-[6.5rem] lg:leading-[0.9]" : "text-display-md"} font-black`}
        >
          {titulo}
        </Titulo>
        {subtitulo ? <p className="max-w-prose text-lg font-medium">{subtitulo}</p> : null}
        {children}
      </div>
    </div>
  );
}
