import type { GalleryPhoto } from "@/modules/content";

// Las variantes se sirven desde el mismo origen con sesión y membresía vivas. Nunca pasan
// por el optimizador de Next ni por una URL firmada que pueda circular fuera de Mi OE.
export function photoSource(photo: GalleryPhoto, width: number) {
  return `/api/fotos/${encodeURIComponent(photo.id)}?w=${width}`;
}

export function photoSources(photo: GalleryPhoto) {
  return photo.widths.map((width) => `${photoSource(photo, width)} ${width}w`).join(", ");
}
