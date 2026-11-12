import type { ButtonHTMLAttributes } from "react";

// Pastilla para filtros (ADR-163 regla 6). La elegida va con el color de la acción y las demás con
// relleno de control. Se anuncia con `aria-pressed`, así que el color no es la única señal.

type Area = "mi-oe" | "operacion";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

// En Mi OE la zona táctil mide al menos 44 px; en la Operación la pastilla mide 32 px.
const SIZE: Record<Area, string> = {
  "mi-oe": "min-h-11 px-4 text-secundario",
  operacion: "min-h-8 px-3 text-[0.8125rem] leading-[1.125rem]",
};

const SELECTED = "bg-accion text-accion-tinta";

const IDLE =
  "bg-relleno text-tinta hover:bg-[color-mix(in_oklab,var(--relleno)_90%,var(--titulo))]";

export function chipClass({
  selected = false,
  area = "mi-oe",
  className = "",
}: {
  selected?: boolean;
  area?: Area;
  className?: string;
} = {}): string {
  return `${BASE} ${SIZE[area]} ${selected ? SELECTED : IDLE} ${className}`.trim();
}

export function Chip({
  selected = false,
  area,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  area?: Area;
}) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={chipClass({
        selected,
        ...(area ? { area } : {}),
        ...(className ? { className } : {}),
      })}
      {...props}
    />
  );
}
