import { Elemento, type ElementoTipo } from "@/shared/brand";

type Props = {
  texto: string;
  elemento?: ElementoTipo;
  color?: string;
};

// Estado vacío de Mi OE: un elemento gráfico de la marca y el texto del código T-… correspondiente.
export function Vacio({ texto, elemento = "destello", color = "text-oe-orange" }: Props) {
  return (
    <div className="flex items-center gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
      <Elemento tipo={elemento} className={`size-12 shrink-0 ${color}`} />
      <p className="text-lg">{texto}</p>
    </div>
  );
}
