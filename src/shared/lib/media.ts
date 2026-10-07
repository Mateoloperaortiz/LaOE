// URL de entrega de un medio (ADR-022): estable en el HTML; el navegador sigue el 302 al bucket.

export function mediaUrl(assetId: string, width?: number): string {
  return width ? `/api/media/${assetId}?w=${width}` : `/api/media/${assetId}`;
}

/** `srcset` con las variantes disponibles, de menor a mayor ancho. */
export function mediaSrcSet(assetId: string, widths: number[]): string {
  return [...widths]
    .sort((a, b) => a - b)
    .map((width) => `${mediaUrl(assetId, width)} ${width}w`)
    .join(", ");
}

/**
 * Nombre en `variants` de la variante completa (ADR-114 regla 8): el original recodificado a WebP, sin
 * metadatos y sin reducir. Es lo que se entrega en lugar del original; no es una de las de ancho.
 */
export const FULL_VARIANT = "full";

/** Las variantes por ancho, de menor a mayor: las que arman el `srcset`. La completa no entra. */
export function widthVariants<Variant extends { width: number }>(
  variants: Record<string, Variant>,
): Variant[] {
  return Object.entries(variants)
    .filter(([name]) => name !== FULL_VARIANT)
    .map(([, variant]) => variant)
    .sort((a, b) => a.width - b.width);
}
