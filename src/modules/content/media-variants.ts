// Vocabulario de las variantes de un medio que comparten el dominio y los componentes del módulo
// (ADR-114 regla 8). Vive en la raíz, sin base ni entorno, para que `Imagen` lo pueda importar.

/**
 * Nombre en `variants` de la variante completa: el original recodificado a WebP, sin metadatos y entero
 * hasta el lado de `FULL_VARIANT_MAX_SIDE`. Es lo que se entrega en lugar del original; no es una de las
 * de ancho.
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
