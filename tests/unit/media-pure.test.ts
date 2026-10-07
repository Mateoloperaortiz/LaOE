import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Imagen } from "@/modules/content/components/Imagen";
import {
  confirmablePurpose,
  DELIVERY,
  fullVariantKey,
  hasFullVariant,
  isAllowedSize,
  isAllowedType,
  keyPurpose,
  photoKey,
  pickVariant,
  UPLOAD_KEY_PATTERN,
  uploadKey,
  variantKey,
  variantWidthsFor,
} from "@/modules/content/domain/media-pure";
import { mediaSrcSet, mediaUrl, widthVariants } from "@/shared/lib/media";

describe("medios (reglas puras)", () => {
  it("acepta solo JPG, PNG y WebP entre 5 KB y 20 MB", () => {
    expect(isAllowedType("image/jpeg")).toBe(true);
    expect(isAllowedType("image/webp")).toBe(true);
    expect(isAllowedType("image/gif")).toBe(false);
    expect(isAllowedType("application/pdf")).toBe(false);
    expect(isAllowedSize(5 * 1024)).toBe(true);
    expect(isAllowedSize(5 * 1024 - 1)).toBe(false);
    expect(isAllowedSize(20 * 1024 * 1024)).toBe(true);
    expect(isAllowedSize(20 * 1024 * 1024 + 1)).toBe(false);
  });

  it("arma la clave de subida por mes y la de cada variante", () => {
    const key = uploadKey("image/png", "abcdefghij1234567890", new Date("2026-09-03T23:30:00Z"));
    expect(key).toBe("uploads/2026/09/abcdefghij1234567890.png");
    expect(UPLOAD_KEY_PATTERN.test(key)).toBe(true);
    expect(UPLOAD_KEY_PATTERN.test("variants/x/w480.webp")).toBe(false);
    expect(variantKey("abc", 960)).toBe("variants/abc/w960.webp");
    expect(() => uploadKey("image/gif", "x")).toThrow();
  });

  it("nunca agranda el original", () => {
    expect(variantWidthsFor(2000)).toEqual([480, 960, 1600]);
    expect(variantWidthsFor(1200)).toEqual([480, 960]);
    expect(variantWidthsFor(300)).toEqual([]);
  });

  it("elige la variante más grande que no supere el ancho pedido", () => {
    const variants = {
      w480: { key: "v/w480.webp", width: 480, height: 320, byteSize: 1, contentType: "image/webp" },
      w960: { key: "v/w960.webp", width: 960, height: 640, byteSize: 1, contentType: "image/webp" },
    };
    expect(pickVariant(variants, 960)?.width).toBe(960);
    expect(pickVariant(variants, 700)?.width).toBe(480);
    expect(pickVariant(variants, 100)?.width).toBe(480);
    expect(pickVariant(variants, 4000)?.width).toBe(960);
    expect(pickVariant(variants, null)).toBeNull();
    expect(pickVariant({}, 960)).toBeNull();
  });

  it("con variante completa nunca se queda sin variante: es la que va sin ancho pedido o sin otra", () => {
    const webp = { height: 1, byteSize: 1, contentType: "image/webp" };
    const full = { key: "v/full.webp", width: 1200, ...webp };
    const ladder = {
      w480: { key: "v/w480.webp", width: 480, ...webp },
      w960: { key: "v/w960.webp", width: 960, ...webp },
    };
    expect(fullVariantKey("abc")).toBe("variants/abc/full.webp");
    expect(hasFullVariant({ ...ladder, full })).toBe(true);
    expect(hasFullVariant(ladder)).toBe(false);
    // Sin ancho, la completa; con ancho, la escalera de siempre: la completa no es un peldaño.
    expect(pickVariant({ ...ladder, full }, null)).toBe(full);
    expect(pickVariant({ ...ladder, full }, 960)?.key).toBe("v/w960.webp");
    expect(pickVariant({ ...ladder, full }, 1200)?.key).toBe("v/w960.webp");
    expect(pickVariant({ ...ladder, full }, 4000)?.key).toBe("v/w960.webp");
    expect(pickVariant({ ...ladder, full }, 100)?.key).toBe("v/w480.webp");
    // Un original de menos de 480 px no tiene escalera: va la completa con cualquier ancho.
    expect(pickVariant({ full }, 480)).toBe(full);
    expect(widthVariants({ full, ...ladder }).map((variant) => variant.width)).toEqual([480, 960]);
    expect(widthVariants({ full })).toEqual([]);
    // Ningún ancho, tampoco uno que no es un ancho, deja sin variante a un medio que tiene la completa.
    for (const width of [null, 0, -1, 0.5, 1, 479, 1e9, Number.NaN, Infinity, -Infinity]) {
      expect(pickVariant({ ...ladder, full }, width)).not.toBeNull();
      expect(pickVariant({ full }, width)).toBe(full);
    }
  });

  it("el srcset de una imagen lleva las variantes de ancho y no la completa", () => {
    const asset = { id: "abc", width: 1200, height: 800 };
    const ladder = { w480: { width: 480 }, w960: { width: 960 } };
    const before = renderToStaticMarkup(
      createElement(Imagen, { asset: { ...asset, variants: ladder }, alt: "Portada" }),
    );
    const after = renderToStaticMarkup(
      createElement(Imagen, {
        asset: { ...asset, variants: { full: { width: 1200 }, ...ladder } },
        alt: "Portada",
      }),
    );
    expect(after).toBe(before);
    expect(after).toContain('src="/api/media/abc?w=960"');
    expect(after).toContain('srcSet="/api/media/abc?w=480 480w, /api/media/abc?w=960 960w"');
    // Una imagen chica, que solo tiene la completa, se pide sin ancho y sin srcset, como antes.
    const small = renderToStaticMarkup(
      createElement(Imagen, {
        asset: { id: "abc", width: 300, height: 200, variants: { full: { width: 300 } } },
        alt: "Chica",
      }),
    );
    expect(small).toContain('src="/api/media/abc"');
    expect(small).not.toContain("srcSet");
  });

  it("la caché del 302 dura menos que la firma", () => {
    expect(DELIVERY.PUBLIC.expiresInSeconds).toBeGreaterThan(518_400);
    expect(DELIVERY.PUBLIC.cacheControl).toContain("max-age=518400");
    expect(DELIVERY.PRIVATE.expiresInSeconds).toBeGreaterThan(300);
    expect(DELIVERY.PRIVATE.cacheControl).toContain("max-age=300");
  });

  it("construye la URL y el srcset de entrega", () => {
    expect(mediaUrl("abc")).toBe("/api/media/abc");
    expect(mediaUrl("abc", 960)).toBe("/api/media/abc?w=960");
    expect(mediaSrcSet("abc", [960, 480])).toBe(
      "/api/media/abc?w=480 480w, /api/media/abc?w=960 960w",
    );
  });
});

describe("qué clave se puede confirmar (ADR-113 regla 5)", () => {
  const ana = "anaanaanaanaanaanaana000";
  const bruno = "brunobrunobrunobruno0000";
  const media = uploadKey("image/png", "abcdefghij1234567890", new Date("2026-10-07T12:00:00Z"));
  const photo = photoKey(ana, "image/webp", "abcdefghij1234567890");

  it("el propósito lo dice el prefijo de la clave, y una clave de otra forma no tiene ninguno", () => {
    expect(keyPurpose(media)).toBe("media");
    expect(keyPurpose(photo)).toBe("photo");
    for (const key of [
      "variants/abc/w480.webp",
      "evidence/abcdefghij1234567890.png",
      `${photo}/../../${media}`,
      `x${media}`,
      "uploads/2026/10/abcdefghij1234567890.svg",
      "",
    ]) {
      expect(keyPurpose(key)).toBeNull();
    }
    expect(keyPurpose(undefined as never)).toBeNull();
  });

  it("un medio lo confirma solo el alcance de ADMIN", () => {
    const base = { key: media, purpose: "media", personId: ana };
    expect(confirmablePurpose({ ...base, scope: { by: "ADMIN" } })).toBe("media");
    expect(confirmablePurpose({ ...base, scope: { by: "SELF" } })).toBeNull();
    // Sin persona (un script que ya comprobó a su ADMIN) el medio se confirma igual.
    expect(confirmablePurpose({ ...base, personId: null, scope: { by: "ADMIN" } })).toBe("media");
  });

  it("una foto la confirma solo su dueña, con cualquiera de los dos alcances", () => {
    const base = { key: photo, purpose: "photo" };
    expect(confirmablePurpose({ ...base, personId: ana, scope: { by: "SELF" } })).toBe("photo");
    expect(confirmablePurpose({ ...base, personId: ana, scope: { by: "ADMIN" } })).toBe("photo");
    expect(confirmablePurpose({ ...base, personId: bruno, scope: { by: "SELF" } })).toBeNull();
    expect(confirmablePurpose({ ...base, personId: bruno, scope: { by: "ADMIN" } })).toBeNull();
    expect(confirmablePurpose({ ...base, personId: null, scope: { by: "ADMIN" } })).toBeNull();
    // El id de otra persona que empieza igual no alcanza: la clave cierra con la barra.
    expect(
      confirmablePurpose({ ...base, personId: ana.slice(0, 12), scope: { by: "SELF" } }),
    ).toBeNull();
  });

  it("el propósito declarado tiene que coincidir con el de la clave", () => {
    const admin = { personId: ana, scope: { by: "ADMIN" } };
    expect(confirmablePurpose({ ...admin, key: media, purpose: "photo" })).toBeNull();
    expect(confirmablePurpose({ ...admin, key: photo, purpose: "media" })).toBeNull();
    for (const purpose of [undefined, null, "", "MEDIA", "uploads", 1]) {
      expect(confirmablePurpose({ ...admin, key: media, purpose })).toBeNull();
      expect(confirmablePurpose({ ...admin, key: photo, purpose })).toBeNull();
    }
  });

  it("un alcance que falta o no se reconoce no confirma nada, tampoco la foto propia", () => {
    for (const scope of [undefined, null, {}, "ADMIN", { by: "admin" }, { by: "MEMBER" }, []]) {
      expect(confirmablePurpose({ key: media, purpose: "media", personId: ana, scope })).toBeNull();
      expect(confirmablePurpose({ key: photo, purpose: "photo", personId: ana, scope })).toBeNull();
    }
  });
});
