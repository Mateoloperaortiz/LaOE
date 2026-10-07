import { mediaSrcSet, mediaUrl } from "@/shared/lib/media";
import { widthVariants } from "../media-variants";

type Props = {
  asset: {
    id: string;
    width: number | null;
    height: number | null;
    variants: Record<string, { width: number }>;
  };
  alt: string;
  /** Atributo `sizes` del navegador; por defecto ocupa el ancho del contenedor hasta 1200 px. */
  sizes?: string;
  className?: string;
  /** Portada sobre el pliegue: sin carga diferida. */
  priority?: boolean;
};

// Imagen servida por /api/media/[id] (ADR-022): srcset con las variantes WebP; sin next/image porque
// su optimizador haría pasar los bytes por la app.
export function Imagen({
  asset,
  alt,
  sizes = "(min-width: 1280px) 1200px, 100vw",
  className = "",
  priority = false,
}: Props) {
  // La variante completa no es un ancho del `srcset` (ADR-114 regla 8): se entrega cuando no hay otra.
  const widths = widthVariants(asset.variants).map((variant) => variant.width);
  const largest = widths.length > 0 ? Math.max(...widths) : undefined;
  return (
    // biome-ignore lint/performance/noImgElement: ADR-022, los bytes no atraviesan la app
    <img
      src={mediaUrl(asset.id, largest)}
      {...(widths.length > 0 ? { srcSet: mediaSrcSet(asset.id, widths), sizes } : {})}
      {...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {})}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className}
    />
  );
}
