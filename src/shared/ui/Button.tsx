import type { ButtonHTMLAttributes } from "react";

// Botón de la capa funcional (ADR-163 reglas 4 y 6). La acción principal es navy en las dos áreas, y
// cada pantalla tiene un solo botón principal. El secundario lleva relleno de control y no lleva borde.
// `buttonClass` viste igual un enlace (`AppLink`) que lleva a otra pantalla. En la Operación hay un
// tamaño compacto para barras de herramientas, filtros y filas (ADR-161 regla 3).

type Variant = "principal" | "secundaria" | "enlace";
type Area = "mi-oe" | "operacion";
type Size = "normal" | "compacto";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

// En Mi OE la zona táctil mide al menos 44 px (ADR-158 regla 8). En la Operación, 40 px con letra de 14
// y 32 px con letra de 13 el compacto (ADR-161 regla 3). Las esquinas salen de `--radius-control`: 14 px
// en Mi OE y 10 px dentro del marco de escritorio.
const SIZE: Record<Area, Record<Size, string>> = {
  "mi-oe": {
    normal: "min-h-11 px-5 text-cuerpo",
    compacto: "min-h-11 px-4 text-secundario",
  },
  operacion: {
    normal: "min-h-10 px-4 text-[0.875rem] leading-5",
    compacto: "min-h-8 px-3 text-[0.8125rem] leading-[1.125rem]",
  },
};

const PRINCIPAL =
  "bg-accion text-accion-tinta no-underline hover:bg-[color-mix(in_oklab,var(--accion)_88%,var(--accion-tinta))]";

const SECUNDARIA =
  "bg-relleno text-titulo no-underline hover:bg-[color-mix(in_oklab,var(--relleno)_90%,var(--titulo))]";

const ENLACE = "text-enlace underline underline-offset-4 hover:decoration-2";

export function buttonClass({
  variant = "principal",
  area = "mi-oe",
  size = "normal",
  className = "",
}: {
  variant?: Variant;
  area?: Area;
  size?: Size;
  className?: string;
} = {}): string {
  const look = variant === "principal" ? PRINCIPAL : variant === "secundaria" ? SECUNDARIA : ENLACE;
  const sized = variant === "enlace" ? "min-h-11 px-0" : SIZE[area][size];
  return `${BASE} ${sized} ${look} ${className}`.trim();
}

export function Button({
  variant,
  area,
  size,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  area?: Area;
  size?: Size;
}) {
  return (
    <button
      type={type}
      className={buttonClass({
        ...(variant ? { variant } : {}),
        ...(area ? { area } : {}),
        ...(size ? { size } : {}),
        ...(className ? { className } : {}),
      })}
      {...props}
    />
  );
}
