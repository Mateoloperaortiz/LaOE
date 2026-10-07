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
