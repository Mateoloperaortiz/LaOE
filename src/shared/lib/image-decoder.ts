import sharp from "sharp";
import { tList } from "@/shared/copy";

// El único decodificador de las imágenes que llegan de afuera (ADR-113 regla 4): medios del admin y
// evidencias de retos. Lee la cabecera antes de tocar un píxel, admite solo JPEG, PNG y WebP por el
// contenido (el tipo declarado lo escribe quien sube), rechaza lo que pase del tope de píxeles o del
// presupuesto de memoria, solo codifica reduciendo y nunca entrega más píxeles que el tope de salida
// (ADR-119 regla 10). El dominio no abre con sharp una imagen ajena por su cuenta.

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
/**
 * Tope de píxeles de una imagen codificada (ADR-119 regla 10): los de un cuadrado de 2560 de lado, que
 * es lo más que pedían una evidencia y la variante completa. Ninguna codificación sale con más.
 */
export const IMAGE_MAX_OUTPUT_PIXELS = 2560 * 2560;
/** Bytes por muestra de las profundidades que traen JPEG, PNG y WebP. Otra no se reconoce. */
const SAMPLE_BYTES: Record<string, number> = { uchar: 1, ushort: 2 };
const WEBP_QUALITY = 82;

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

interface ImageSize {
  width: number;
  height: number;
}

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

/** La imagen entera con su proporción, reducida a los píxeles del tope de salida. */
function fitToOutputPixels(source: ImageSize): ImageSize {
  const scale = Math.sqrt(IMAGE_MAX_OUTPUT_PIXELS / (source.width * source.height));
  const height = Math.min(Math.max(1, Math.floor(source.height * scale)), IMAGE_MAX_OUTPUT_PIXELS);
  const width = Math.min(
    Math.max(1, Math.floor(source.width * scale)),
    Math.floor(IMAGE_MAX_OUTPUT_PIXELS / height),
  );
  return { width, height };
}

/**
 * La caja en la que se codifica una imagen de tamaño `source` (ya derecha) reducida a `bound`. La
 * imagen se encaja adentro sin agrandarse, así que el ancho por el alto de la caja es lo más que mide
 * el resultado: nunca pasa de `IMAGE_MAX_OUTPUT_PIXELS` (ADR-119 regla 10).
 *  - A un lado: el cuadrado de ese lado.
 *  - A un ancho: ese ancho, o el de la imagen si es más angosta, y lo más alto que el tope deja a ese
 *    ancho. La imagen que cabe sale como salía sin tope.
 *  - A un ancho en el que no cabe (alta y angosta): la imagen entera, con su proporción, reducida a
 *    los píxeles del tope.
 * Un límite que no es un entero positivo, o un lado cuyo cuadrado pasa del tope, es un error de quien
 * llama, no de la imagen: no la deja fallida, rompe.
 */
export function outputBox(source: ImageSize, bound: ImageBound): ImageSize {
  const limit = "side" in bound ? bound.side : bound.width;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Límite de reducción inválido: ${String(limit)}`);
  }
  if ("side" in bound) {
    if (limit * limit > IMAGE_MAX_OUTPUT_PIXELS) {
      throw new Error(`Lado de reducción ${limit}: su cuadrado pasa del tope de píxeles de salida`);
    }
    return { width: limit, height: limit };
  }
  const width = Math.min(limit, source.width);
  const height = Math.floor(IMAGE_MAX_OUTPUT_PIXELS / width);
  // Cabe a ese ancho si su alto proporcional no pasa del de la caja.
  return source.height * width <= height * source.width
    ? { width, height }
    : fitToOutputPixels(source);
}

async function encodeWebp(
  bytes: Uint8Array,
  upright: ImageSize,
  bound: ImageBound,
): Promise<EncodedImage> {
  const box = outputBox(upright, bound);
  try {
    // El mismo tope, exigido también por libvips al decodificar: es la segunda línea.
    const { data, info } = await sharp(bytes, { limitInputPixels: IMAGE_MAX_PIXELS })
      .rotate() // respeta la orientación EXIF; sin `withMetadata`, el resultado no la lleva
      .resize({ ...box, fit: "inside", withoutEnlargement: true })
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
  // Las orientaciones EXIF 5 a 8 giran la imagen un cuarto de vuelta: derecha, mide al revés.
  const upright =
    (metadata.orientation ?? 1) >= 5 ? { width: height, height: width } : { width, height };
  return { format, width, height, toWebp: (bound) => encodeWebp(bytes, upright, bound) };
}
