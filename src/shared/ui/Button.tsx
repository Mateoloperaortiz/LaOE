import type { ButtonHTMLAttributes } from "react";

// Botón de la capa funcional (ADR-158 regla 5). La acción principal cambia con el área: naranja con
// texto navy en Mi OE y navy con texto paper en la Operación. Cada pantalla tiene un solo botón
// principal. `buttonClass` viste igual un enlace (`AppLink`) que lleva a otra pantalla. En la
// Operación hay un tamaño compacto para barras de herramientas, filtros y filas (ADR-161 regla 3).

type Variant = "principal" | "secundaria" | "enlace";
type Area = "mi-oe" | "operacion";
type Size = "normal" | "compacto";

const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

// En Mi OE la zona táctil mide al menos 44 px (ADR-158 regla 8). En la Operación, 40 px con letra de 14
// y 32 px con letra de 13 el compacto, con las esquinas de las superficies (ADR-161 regla 3).
const SIZE: Record<Area, Record<Size, string>> = {
  "mi-oe": {
    normal: "min-h-11 rounded-full px-5 text-cuerpo",
    compacto: "min-h-11 rounded-full px-4 text-secundario",
  },
  operacion: {
    normal: "min-h-10 rounded-superficie px-4 text-[0.875rem] leading-5",
    compacto: "min-h-8 rounded-superficie px-3 text-[0.8125rem] leading-[1.125rem]",
  },
};

const PRINCIPAL: Record<Area, string> = {
  "mi-oe":
    "bg-accion-mi-oe text-accion-mi-oe-tinta no-underline hover:bg-[color-mix(in_oklab,var(--accion-mi-oe)_88%,var(--accion-mi-oe-tinta))]",
  operacion:
    "bg-accion-operacion text-accion-operacion-tinta no-underline hover:bg-[color-mix(in_oklab,var(--accion-operacion)_85%,var(--accion-operacion-tinta))]",
};

const SECUNDARIA =
  "border border-linea-fuerte bg-superficie text-titulo no-underline hover:bg-[color-mix(in_oklab,var(--superficie)_92%,var(--titulo))]";

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
  const look =
    variant === "principal" ? PRINCIPAL[area] : variant === "secundaria" ? SECUNDARIA : ENLACE;
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
