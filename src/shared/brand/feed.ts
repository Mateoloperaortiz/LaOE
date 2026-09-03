// Orden del feed (07-marca.md §8): rotación determinista de cuatro colores por posición.
// Con una, dos o tres columnas, dos tarjetas contiguas nunca comparten color.

export const FEED_VARIANTS = ["azul", "amarillo", "naranja", "navy"] as const;

export type FeedVariant = (typeof FEED_VARIANTS)[number];

export function feedVariant(index: number): FeedVariant {
  const position = ((index % FEED_VARIANTS.length) + FEED_VARIANTS.length) % FEED_VARIANTS.length;
  return FEED_VARIANTS[position] as FeedVariant;
}
