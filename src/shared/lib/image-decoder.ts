import sharp from "sharp";
import { tList } from "@/shared/copy";

// El único decodificador de las imágenes que llegan de afuera (ADR-113 regla 4): medios del admin y
// evidencias de retos. Lee la cabecera antes de tocar un píxel, admite solo JPEG, PNG y WebP por el
// contenido (el tipo declarado lo escribe quien sube), rechaza lo que pase del tope de píxeles y
// solo codifica reduciendo. El dominio no abre con sharp una imagen ajena por su cuenta.

sharp.concurrency(1);

const FORMATS = ["jpeg", "png", "webp"] as const;
type ImageFormat = (typeof FORMATS)[number];

/** Tope de píxeles de la imagen de entrada. Por encima no se decodifica. */
export const IMAGE_MAX_PIXELS = 40_000_000;
const WEBP_QUALITY = 82;

/** Por qué no se procesa una imagen. El orden es el de la lista T-3207. */
const MOTIVES = { unreadable: 0, format: 1, pixels: 2, encode: 3 } as const;
type ImageRejection = keyof typeof MOTIVES;

/**
 * La imagen no pasa y volver a intentarlo no cambia nada: quien llama la deja fallida con `message`,
 * que es el motivo del catálogo. `detail` es lo técnico (el formato detectado, las dimensiones o el
 * mensaje de libvips) y va al log.
 */
export class ImageRejectedError extends Error {
  readonly reason: ImageRejection;
  readonly detail: string;

  constructor(reason: ImageRejection, detail: string, options?: ErrorOptions) {
    super(tList("T-3207")[MOTIVES[reason]], options);
    this.name = "ImageRejectedError";
    this.reason = reason;
    this.detail = detail;
  }
}

/** Cómo se reduce antes de codificar: a un ancho o a un lado máximo. Nunca agranda. */
type ImageBound = { width: number } | { side: number };

interface EncodedImage {
  data: Buffer;
  width: number;
  height: number;
}

interface DecodedImage {
  format: ImageFormat;
  /** Dimensiones de la cabecera, antes de aplicar la orientación EXIF. */
  width: number;
  height: number;
  /** Aplica la orientación EXIF, reduce y codifica a WebP sin metadatos. */
  toWebp(bound: ImageBound): Promise<EncodedImage>;
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function encodeWebp(bytes: Uint8Array, bound: ImageBound): Promise<EncodedImage> {
  const limit = "side" in bound ? bound.side : bound.width;
  if (!Number.isInteger(limit) || limit < 1) {
    // Un error de quien llama, no de la imagen: no la deja fallida, rompe.
    throw new Error(`Límite de reducción inválido: ${String(limit)}`);
  }
  const box =
    "side" in bound ? { width: limit, height: limit, fit: "inside" as const } : { width: limit };
  try {
    // El mismo tope, exigido también por libvips al decodificar: es la segunda línea.
    const { data, info } = await sharp(bytes, { limitInputPixels: IMAGE_MAX_PIXELS })
      .rotate() // respeta la orientación EXIF; sin `withMetadata`, el resultado no la lleva
      .resize({ ...box, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (error) {
    throw new ImageRejectedError("encode", detailOf(error), { cause: error });
  }
}

/** Solo la cabecera: no decodifica píxeles. */
async function readHeader(bytes: Uint8Array) {
  try {
    // El tope propio de sharp se apaga acá para que una imagen enorme llegue a la comparación de
    // `decodeImage` y salga con su motivo, y no como ilegible.
    return await sharp(bytes, { limitInputPixels: false }).metadata();
  } catch (error) {
    throw new ImageRejectedError("unreadable", detailOf(error), { cause: error });
  }
}

/**
 * Abre una imagen ajena. Devuelve su formato real y sus dimensiones, y la única puerta para
 * codificarla; lanza `ImageRejectedError` si no es JPEG, PNG o WebP, si no se puede leer o si pasa
 * de `IMAGE_MAX_PIXELS`.
 */
export async function decodeImage(bytes: Uint8Array): Promise<DecodedImage> {
  const metadata = await readHeader(bytes);
  const format = FORMATS.find((allowed) => allowed === metadata.format);
  if (!format) {
    throw new ImageRejectedError("format", metadata.format ?? "desconocido");
  }
  const { width, height } = metadata;
  if (!width || !height) {
    throw new ImageRejectedError("unreadable", "sin dimensiones");
  }
  if (width * height > IMAGE_MAX_PIXELS) {
    throw new ImageRejectedError("pixels", `${width}x${height}`);
  }
  return { format, width, height, toWebp: (bound) => encodeWebp(bytes, bound) };
}
