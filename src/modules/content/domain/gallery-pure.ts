import type { MediaVariant, MediaVariants } from "../schema";

export interface GalleryPhoto {
  id: string;
  width: number;
  height: number;
  alt: string;
  widths: number[];
}

export interface GalleryAlbum {
  id: string;
  slug: string;
  title: string;
  caption: string;
  cover: GalleryPhoto | null;
  photoCount: number;
}

export interface GalleryCollectionView {
  id: string;
  slug: string;
  title: string;
  description: string;
  hero: GalleryPhoto | null;
  albums: GalleryAlbum[];
  featured: GalleryPhoto[];
}

export interface GalleryAlbumPage extends GalleryAlbum {
  collectionSlug: string;
  collectionTitle: string;
  photos: GalleryPhoto[];
  page: number;
  pageSize: number;
  totalPages: number;
}

export const GALLERY_WIDTHS = [480, 960, 1600, 2400] as const;
export const GALLERY_HASH = /^[a-f0-9]{64}$/;
export const GALLERY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function galleryPagination(options: { page?: number; pageSize?: number } = {}) {
  return {
    page:
      Number.isSafeInteger(options.page) && (options.page ?? 0) > 0
        ? Math.min(options.page ?? 1, 1_000_000)
        : 1,
    pageSize:
      Number.isSafeInteger(options.pageSize) && (options.pageSize ?? 0) > 0
        ? Math.min(options.pageSize ?? 48, 96)
        : 48,
  };
}

/** Siempre una copia WebP preparada; ni el original ni una URL del bucket salen a la vista. */
export function galleryVariant(variants: MediaVariants, width: number | null): MediaVariant | null {
  const ordered = Object.values(variants).sort((a, b) => a.width - b.width);
  return (
    (width === null ? ordered.at(-1) : ordered.find((item) => item.width >= width)) ??
    ordered.at(-1) ??
    null
  );
}

export function validGalleryVariants(
  variants: MediaVariants,
  sourceHash: string,
  collectionSlug: string,
  width: number,
  height: number,
): boolean {
  const entries = Object.entries(variants);
  const expected = new Set(GALLERY_WIDTHS.map((value) => Math.min(value, width)));
  return (
    entries.length > 0 &&
    entries.length <= 4 &&
    entries.every(
      ([name, variant]) =>
        expected.has(variant.width) &&
        name === `w${variant.width}` &&
        variant.key === `fotos/${collectionSlug}/${sourceHash}/w${variant.width}.webp` &&
        variant.contentType === "image/webp" &&
        Number.isSafeInteger(variant.width) &&
        variant.width > 0 &&
        Number.isSafeInteger(variant.height) &&
        variant.height > 0 &&
        Math.abs(variant.height - Math.round((height * variant.width) / width)) <= 1 &&
        Number.isSafeInteger(variant.byteSize) &&
        variant.byteSize > 0 &&
        variant.byteSize <= 20 * 1024 * 1024,
    ) &&
    entries.some(([, variant]) => variant.width === Math.min(width, 2400))
  );
}

export function galleryPhotoView(photo: {
  id: string;
  width: number;
  height: number;
  alt: string;
  variants: MediaVariants;
}): GalleryPhoto {
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    alt: photo.alt,
    widths: Object.values(photo.variants)
      .map((variant) => variant.width)
      .sort((a, b) => a - b),
  };
}
