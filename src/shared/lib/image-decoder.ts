import sharp from "sharp";
import { tList } from "@/shared/copy";

// El único decodificador de las imágenes que llegan de afuera (ADR-113 regla 4): medios del admin y
// evidencias de retos. Lee la cabecera antes de tocar un píxel, admite solo JPEG, PNG y WebP por el
// contenido (el tipo declarado lo escribe quien sube), rechaza lo que pase del tope de píxeles o del
// presupuesto de memoria y solo codifica reduciendo. El dominio no abre con sharp una imagen ajena
// por su cuenta.

sharp.concurrency(1);

const FORMATS = ["jpeg", "png", "webp"] as const;
type ImageFormat = (typeof FORMATS)[number];

/** Tope de píxeles de la imagen de entrada. Por encima no se decodifica. */
export const IMAGE_MAX_PIXELS = 40_000_000;
/**
 * Presupuesto de memoria de la imagen decodificada, en bytes: lo que ocupa la más grande que el tope
 * de píxeles admite en RGB de 8 bits. El tope de píxeles no ve los canales, la profundidad ni si la
 * imagen se puede leer por franjas, y de eso depende cuánta memoria pide abrirla.
 */
export const IMAGE_MAX_DECODED_BYTES = IMAGE_MAX_PIXELS * 3;
/** Bytes por muestra de las profundidades que traen JPEG, PNG y WebP. Otra no se reconoce. */
const SAMPLE_BYTES: Record<string, number> = { uchar: 1, ushort: 2 };
const WEBP_QUALITY = 82;
/**
 * El lado más largo que admite el formato WebP. Pedir este lado es codificar la imagen entera: la que
 * no llega no se toca, porque nunca se agranda, y la que lo pasa se reduce hasta caber en vez de fallar.
 */
export const IMAGE_MAX_ENCODED_SIDE = 16_383;

/** Por qué no se procesa una imagen. El orden es el de la lista T-3207. */
const MOTIVES = { unreadable: 0, format: 1, pixels: 2, encode: 3, memory: 4 } as const;
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

type ImageHeader = Awaited<ReturnType<typeof readHeader>>;

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
 * Bytes que ocupa la imagen decodificada: ancho × alto × canales × bytes por muestra. Cuenta doble la
 * que libvips no puede leer por franjas y sostiene entera: PNG entrelazado, JPEG progresivo y todo
 * WebP. `null` si la cabecera no dice los canales o trae una profundidad que no se reconoce.
 */
function decodedBytes(metadata: ImageHeader, format: ImageFormat): number | null {
  const { width, height, channels } = metadata;
  const sample = SAMPLE_BYTES[metadata.depth ?? ""];
  if (!width || !height || !channels || !sample) {
    return null;
  }
  // Solo un `false` explícito la deja contar una vez.
  const whole = format === "webp" || metadata.isProgressive !== false;
  return width * height * channels * sample * (whole ? 2 : 1);
}

/**
 * Abre una imagen ajena. Devuelve su formato real y sus dimensiones, y la única puerta para
 * codificarla; lanza `ImageRejectedError` si no es JPEG, PNG o WebP, si no se puede leer, si pasa de
 * `IMAGE_MAX_PIXELS` o si decodificada no cabe en `IMAGE_MAX_DECODED_BYTES`.
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
  const decoded = decodedBytes(metadata, format);
  if (decoded === null) {
    throw new ImageRejectedError(
      "unreadable",
      `canales ${String(metadata.channels)}, profundidad ${String(metadata.depth)}`,
    );
  }
  if (decoded > IMAGE_MAX_DECODED_BYTES) {
    throw new ImageRejectedError("memory", `${width}x${height}, ${decoded} bytes`);
  }
  return { format, width, height, toWebp: (bound) => encodeWebp(bytes, bound) };
}
