import { describe, expect, it } from "vitest";
import {
  galleryPagination,
  galleryPhotoView,
  galleryVariant,
  validGalleryVariants,
} from "@/modules/content/domain/gallery-pure";

const hash = "a".repeat(64);
const variant = (width: number) => ({
  key: `fotos/prueba/${hash}/w${width}.webp`,
  width,
  height: Math.round((width * 2) / 3),
  byteSize: 200,
  contentType: "image/webp",
});

describe("reglas de galería privada", () => {
  it("sirve una copia WebP aun sin ancho y escoge suficiente resolución sin originales", () => {
    const variants = {
      w480: variant(480),
      w960: variant(960),
      w1600: variant(1600),
      w2400: variant(2400),
    };
    expect(galleryVariant(variants, 640)?.width).toBe(960);
    expect(galleryVariant(variants, 1920)?.width).toBe(2400);
    expect(galleryVariant(variants, null)?.width).toBe(2400);
    expect(galleryVariant(variants, 9000)?.width).toBe(2400);
    expect(galleryVariant({}, null)).toBeNull();
  });

  it("valida claves propias, dimensiones y una copia saneada para las fuentes chicas", () => {
    expect(validGalleryVariants({ w300: variant(300) }, hash, "prueba", 300, 200)).toBe(true);
    expect(validGalleryVariants({ w2400: variant(2400) }, hash, "prueba", 6000, 4000)).toBe(true);
    expect(
      validGalleryVariants(
        { w300: { ...variant(300), key: "uploads/original.jpg" } },
        hash,
        "prueba",
        300,
        200,
      ),
    ).toBe(false);
    expect(
      validGalleryVariants({ w300: { ...variant(300), height: 100 } }, hash, "prueba", 300, 200),
    ).toBe(false);
    expect(validGalleryVariants({}, hash, "prueba", 300, 200)).toBe(false);
  });

  it("proyecta dimensiones sin hashes ni claves privadas y acota el tamaño de página", () => {
    const photo = galleryPhotoView({
      id: "fotoprueba",
      width: 1200,
      height: 800,
      alt: "Foto sintética",
      variants: { w960: variant(960), w480: variant(480) },
    });
    expect(photo).toEqual({
      id: "fotoprueba",
      width: 1200,
      height: 800,
      alt: "Foto sintética",
      widths: [480, 960],
    });
    expect(galleryPagination()).toEqual({ page: 1, pageSize: 48 });
    expect(galleryPagination({ page: -10, pageSize: 999 })).toEqual({ page: 1, pageSize: 96 });
    expect(galleryPagination({ page: Number.MAX_SAFE_INTEGER })).toEqual({
      page: 1_000_000,
      pageSize: 48,
    });
  });
});
