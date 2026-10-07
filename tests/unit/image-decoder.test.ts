import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { tList } from "@/shared/copy";
import { decodeImage, IMAGE_MAX_PIXELS, ImageRejectedError } from "@/shared/lib/image-decoder";

// El decodificador compartido de medios y evidencias (ADR-113 regla 4). Las imágenes se generan acá:
// un solo color pesa poco y ocupa todos sus píxeles al decodificarse.

const motives = tList("T-3207");

function flat(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } },
    // El tope de sharp también frena al que genera: acá se apaga para poder fabricar la enorme.
    limitInputPixels: false,
  });
}

/** El rechazo del decodificador; cualquier otra cosa (que la acepte o que rompa distinto) falla. */
async function rejectionOf(work: Promise<unknown>): Promise<ImageRejectedError> {
  const outcome = await work.then(
    () => null,
    (error: unknown) => error,
  );
  if (outcome instanceof ImageRejectedError) return outcome;
  throw new Error(`Se esperaba un rechazo del decodificador y llegó: ${String(outcome)}`);
}

describe("decodificador de imágenes", () => {
  it("abre JPEG, PNG y WebP y dice su formato real y sus dimensiones", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const image = await decodeImage(await flat(120, 80)[format]().toBuffer());
      expect(image).toMatchObject({ format, width: 120, height: 80 });
    }
  });

  it("rechaza un SVG, un GIF, un TIFF y un AVIF aunque libvips los sepa abrir", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30"/></svg>',
    );
    const others = {
      svg,
      gif: await flat(40, 30).gif().toBuffer(),
      tiff: await flat(40, 30).tiff().toBuffer(),
      heif: await flat(40, 30).avif().toBuffer(),
    };
    for (const [detected, bytes] of Object.entries(others)) {
      const rejection = await rejectionOf(decodeImage(bytes));
      expect(rejection).toMatchObject({ reason: "format", detail: detected, message: motives[1] });
    }
  });

  it("rechaza un archivo que no es una imagen, llegue con el tipo que llegue", async () => {
    const text = Buffer.from("esto no es una imagen ".repeat(400));
    for (const bytes of [text, Buffer.alloc(0)]) {
      const rejection = await rejectionOf(decodeImage(bytes));
      expect(rejection).toMatchObject({ reason: "unreadable", message: motives[0] });
    }
  });

  it("rechaza por píxeles una imagen que pasa del tope, con las dimensiones de su cabecera", async () => {
    const justOver = await flat(8000, 5001).png().toBuffer();
    expect(await rejectionOf(decodeImage(justOver))).toMatchObject({
      reason: "pixels",
      detail: "8000x5001",
      message: motives[2],
    });
    // Pasa también el tope propio de sharp (268 megapíxeles) y sale con el mismo motivo.
    const enormous = await flat(16_400, 16_400).png().toBuffer();
    expect(await rejectionOf(decodeImage(enormous))).toMatchObject({
      reason: "pixels",
      detail: "16400x16400",
    });
  });

  it("el motivo del tope nombra los megapíxeles que el código exige", () => {
    expect(motives[2]).toContain(`${IMAGE_MAX_PIXELS / 1_000_000} megapíxeles`);
  });

  it("abre y codifica una imagen que está justo en el tope", async () => {
    const atLimit = await decodeImage(await flat(8000, 5000).png().toBuffer());
    expect(atLimit.width * atLimit.height).toBe(IMAGE_MAX_PIXELS);
    expect(await atLimit.toWebp({ side: 1000 })).toMatchObject({ width: 1000, height: 625 });
  });

  it("reduce al lado máximo conservando la proporción y nunca agranda", async () => {
    const landscape = await decodeImage(await flat(3000, 2000).jpeg().toBuffer());
    expect(await landscape.toWebp({ side: 1500 })).toMatchObject({ width: 1500, height: 1000 });
    const portrait = await decodeImage(await flat(2000, 3000).jpeg().toBuffer());
    expect(await portrait.toWebp({ side: 1500 })).toMatchObject({ width: 1000, height: 1500 });
    const small = await decodeImage(await flat(300, 200).png().toBuffer());
    expect(await small.toWebp({ side: 1500 })).toMatchObject({ width: 300, height: 200 });
  });

  it("reduce a un ancho conservando la proporción y nunca agranda", async () => {
    const image = await decodeImage(await flat(1200, 800).png().toBuffer());
    expect(await image.toWebp({ width: 480 })).toMatchObject({ width: 480, height: 320 });
    expect(await image.toWebp({ width: 1600 })).toMatchObject({ width: 1200, height: 800 });
  });

  it("codifica a WebP con la orientación EXIF aplicada y sin metadatos", async () => {
    const tagged = await flat(400, 200)
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "prueba" } } })
      .toBuffer();
    expect((await sharp(tagged).metadata()).exif).toBeDefined();

    const image = await decodeImage(tagged);
    // La cabecera dice 400 × 200; con la orientación 6 se ve de pie.
    expect(image).toMatchObject({ format: "jpeg", width: 400, height: 200 });
    const encoded = await image.toWebp({ side: 100 });
    expect(encoded).toMatchObject({ width: 50, height: 100 });
    const meta = await sharp(encoded.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("rechaza al codificar una imagen con la cabecera sana y los datos cortados", async () => {
    const whole = await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: { r: 128, g: 64, b: 32 },
        noise: { type: "gaussian", mean: 128, sigma: 40 },
      },
    })
      .png()
      .toBuffer();
    const image = await decodeImage(whole.subarray(0, Math.floor(whole.length / 2)));
    const rejection = await rejectionOf(image.toWebp({ side: 300 }));
    expect(rejection).toMatchObject({ reason: "encode", message: motives[3] });
  });

  it("un límite de reducción que no es un entero positivo rompe en vez de dejar fallida la imagen", async () => {
    const image = await decodeImage(await flat(300, 200).png().toBuffer());
    for (const bound of [{ side: 0 }, { side: 1.5 }, { side: Number.NaN }, { width: -480 }]) {
      const outcome = await image.toWebp(bound).then(
        () => null,
        (error: unknown) => error,
      );
      expect(outcome).toBeInstanceOf(Error);
      expect(outcome).not.toBeInstanceOf(ImageRejectedError);
    }
  });
});
