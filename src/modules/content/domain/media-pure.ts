import type { MediaVariant, MediaVariants } from "../schema";

// Reglas puras de medios (ADR-022, ADR-033): tipos y tamaños, claves del bucket, variantes.

export const MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MEDIA_MIN_BYTES = 5 * 1024;
export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;
/** La foto propia de Mi OE (ADR-034 regla 8). */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_KEY_PREFIX = "photos/";
const UPLOAD_KEY_PREFIX = "uploads/";
export const UPLOAD_EXPIRY_SECONDS = 600;

/** Lo que el subidor del navegador necesita saber para validar antes de pedir la firma. */
export const MEDIA_LIMITS = {
  types: Object.keys(MEDIA_TYPES),
  minBytes: MEDIA_MIN_BYTES,
  maxBytes: MEDIA_MAX_BYTES,
} as const;

/** Anchos de las variantes WebP; nunca se agranda el original. */
export const VARIANT_WIDTHS = [480, 960, 1600] as const;

export const UPLOAD_KEY_PATTERN =
  /^(uploads\/\d{4}\/\d{2}\/[a-z0-9]{10,40}|photos\/[a-z0-9]{10,40}\/[a-z0-9]{10,40})\.(jpg|png|webp)$/;

/** "media" es la subida del admin; "photo" la foto propia de un miembro (ADR-034 regla 8). */
export type UploadPurpose = "media" | "photo";

/**
 * Quién autorizó la confirmación (ADR-113 regla 5). Lo declara quien llama, que es quien conoce la
 * sesión: `ADMIN` confirma medios y su propia foto; `SELF`, cualquier otra persona, solo su foto.
 */
export type UploadScope = { by: "ADMIN" } | { by: "SELF" };

/** El propósito que dice la clave por su prefijo; null si no tiene la forma de una clave de subida. */
export function keyPurpose(key: string): UploadPurpose | null {
  if (typeof key !== "string" || !UPLOAD_KEY_PATTERN.test(key)) {
    return null;
  }
  return key.startsWith(PHOTO_KEY_PREFIX) ? "photo" : "media";
}

function scopeBy(scope: unknown): UploadScope["by"] | null {
  if (typeof scope !== "object" || scope === null) {
    return null;
  }
  const by = (scope as { by?: unknown }).by;
  return by === "ADMIN" || by === "SELF" ? by : null;
}

/**
 * Qué se puede confirmar con esa clave (ADR-113 regla 5): el propósito, o null si no se confirma.
 * Decide la clave y no lo que se declara. El propósito declarado tiene que coincidir con el prefijo;
 * una foto solo la confirma su dueña, sea quien sea; lo demás es un medio y pide el alcance de ADMIN.
 * Un alcance o un propósito que falta o no se reconoce no confirma nada.
 */
export function confirmablePurpose(input: {
  key: string;
  purpose: unknown;
  scope: unknown;
  personId: string | null;
}): UploadPurpose | null {
  const by = scopeBy(input.scope);
  const purpose = keyPurpose(input.key);
  if (by === null || purpose === null || purpose !== input.purpose) {
    return null;
  }
  if (purpose === "photo") {
    const own =
      input.personId !== null && input.key.startsWith(`${PHOTO_KEY_PREFIX}${input.personId}/`);
    return own ? purpose : null;
  }
  return by === "ADMIN" ? purpose : null;
}

export function isAllowedType(contentType: string): boolean {
  return contentType in MEDIA_TYPES;
}

export function isAllowedSize(byteSize: number, maxBytes = MEDIA_MAX_BYTES): boolean {
  return Number.isInteger(byteSize) && byteSize >= MEDIA_MIN_BYTES && byteSize <= maxBytes;
}

/** `uploads/AAAA/MM/<id>.<ext>`, con el mes de la subida en UTC. */
export function uploadKey(contentType: string, id: string, now = new Date()): string {
  const ext = MEDIA_TYPES[contentType];
  if (!ext) {
    throw new Error(`Tipo no permitido: ${contentType}`);
  }
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${UPLOAD_KEY_PREFIX}${year}/${month}/${id}.${ext}`;
}

/** `photos/<personId>/<id>.<ext>`: la foto propia, siempre privada. */
export function photoKey(personId: string, contentType: string, id: string): string {
  const ext = MEDIA_TYPES[contentType];
  if (!ext) {
    throw new Error(`Tipo no permitido: ${contentType}`);
  }
  return `${PHOTO_KEY_PREFIX}${personId}/${id}.${ext}`;
}

/** Clave determinista: un reintento sobrescribe la variante en vez de dejar huérfanos. */
export function variantKey(assetId: string, width: number): string {
  return `variants/${assetId}/w${width}.webp`;
}

export function variantName(width: number): string {
  return `w${width}`;
}

/** Anchos a generar para un original: solo los que no lo agrandan. */
export function variantWidthsFor(originalWidth: number): number[] {
  return VARIANT_WIDTHS.filter((width) => width <= originalWidth);
}

/**
 * La variante más grande que no supere el ancho pedido; si todas lo superan, la más chica;
 * sin ancho pedido o sin variantes, null (se sirve el original).
 */
export function pickVariant(
  variants: MediaVariants,
  requestedWidth: number | null,
): MediaVariant | null {
  const available = Object.values(variants).sort((a, b) => a.width - b.width);
  if (requestedWidth === null || available.length === 0) {
    return null;
  }
  const fitting = available.filter((variant) => variant.width <= requestedWidth);
  return fitting.at(-1) ?? available[0] ?? null;
}

/** Vigencia de la firma y caché del 302, siempre menor que la firma (ADR-033). */
export const DELIVERY = {
  PUBLIC: { expiresInSeconds: 7 * 24 * 60 * 60, cacheControl: "public, max-age=518400" },
  PRIVATE: { expiresInSeconds: 10 * 60, cacheControl: "private, max-age=300" },
} as const;
