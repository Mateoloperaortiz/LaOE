import { t } from "@/shared/copy";

type Props = {
  /** Alto en píxeles CSS; el ancho sale de la proporción del logo vertical (565 × 770). */
  height?: number;
  /** Solo decorativo (fondos de carteles): sin nombre accesible. */
  decorative?: boolean;
  className?: string;
};

// Conjunto vertical completo del logotipo como máscara monocroma; se pinta con currentColor,
// así la variante navy o blanca depende del fondo (07-marca.md §2).
export function LogoOE({ height = 72, decorative = false, className = "" }: Props) {
  const style = {
    height,
    width: Math.round((height * 565) / 770),
    maskImage: "url(/logos/oe.svg)",
    WebkitMaskImage: "url(/logos/oe.svg)",
  };
  if (decorative) {
    return <span aria-hidden="true" className={`logo-mascara ${className}`} style={style} />;
  }
  return (
    <span
      role="img"
      aria-label={t("T-036")}
      className={`logo-mascara ${className}`}
      style={style}
    />
  );
}

type IsotipoProps = { size?: number; className?: string };

/** El isotipo solo, como elemento decorativo a baja opacidad (uso condicionado del manual). */
export function IsotipoDecorativo({ size = 240, className = "" }: IsotipoProps) {
  return (
    <span
      aria-hidden="true"
      className={`logo-mascara ${className}`}
      style={{
        width: size,
        height: size,
        maskImage: "url(/logos/isotipo.svg)",
        WebkitMaskImage: "url(/logos/isotipo.svg)",
      }}
    />
  );
}
