import sharp, { type ResizeOptions } from "sharp";
import { describe, expect, it } from "vitest";
import { FULL_VARIANT_MAX_SIDE, VARIANT_WIDTHS } from "@/modules/content/domain/media-pure";
import { tList } from "@/shared/copy";
import {
  decodeImage,
  IMAGE_MAX_DECODED_BYTES,
  IMAGE_MAX_OUTPUT_PIXELS,
  IMAGE_MAX_PIXELS,
  ImageRejectedError,
  outputBox,
} from "@/shared/lib/image-decoder";

// El decodificador compartido de medios y evidencias (ADR-113 regla 4). Las imágenes se generan acá:
// un solo color pesa poco y ocupa todos sus píxeles al decodificarse.

const motives = tList("T-3207");

function flat(width: number, height: number, channels: 3 | 4 = 3) {
  const color = { r: 10, g: 120, b: 200 };
  return sharp({
    create: {
      width,
      height,
      channels,
      background: channels === 4 ? { ...color, alpha: 0.5 } : color,
    },
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

type Maker = (width: number, height: number) => ReturnType<typeof flat>;

/** Imágenes que piden más memoria que sus píxeles, con los bytes por píxel que les cuenta el presupuesto. */
const COSTLY: Array<[string, number, Maker]> = [
  [
    "un PNG entrelazado de 16 bits",
    12,
    (w, h) => flat(w, h).toColourspace("rgb16").png({ progressive: true }),
  ],
  ["un PNG de 16 bits", 6, (w, h) => flat(w, h).toColourspace("rgb16").png()],
  ["un PNG entrelazado", 6, (w, h) => flat(w, h).png({ progressive: true })],
  ["un PNG con transparencia", 4, (w, h) => flat(w, h, 4).png()],
  ["un JPEG progresivo", 6, (w, h) => flat(w, h).jpeg({ progressive: true })],
  ["un WebP", 6, (w, h) => flat(w, h).webp()],
];

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

  it("rechaza por memoria una imagen que pasa el tope de píxeles y decodificada no cabe en el presupuesto", async () => {
    // 40 megapíxeles justos, entrelazada y de 16 bits: un archivo de 1 MB que hay que sostener entero.
    const heavy = await flat(8000, 5000)
      .toColourspace("rgb16")
      .png({ progressive: true })
      .toBuffer();
    expect(heavy.byteLength).toBeLessThan(5 * 1024 * 1024);
    expect(await rejectionOf(decodeImage(heavy))).toMatchObject({
      reason: "memory",
      detail: "8000x5000, 480000000 bytes",
      message: motives[4],
    });
  }, 30_000);

  it.each(COSTLY)(
    "%s cuenta %i bytes por píxel: cabe justo en el presupuesto y un renglón más ya no",
    async (_name, perPixel, make) => {
      const width = 4000;
      const height = IMAGE_MAX_DECODED_BYTES / (perPixel * width);
      expect(await decodeImage(await make(width, height).toBuffer())).toMatchObject({
        width,
        height,
      });
      const over = await rejectionOf(decodeImage(await make(width, height + 1).toBuffer()));
      expect(over).toMatchObject({ reason: "memory", message: motives[4] });
    },
    30_000,
  );

  it("un JPEG y un PNG corrientes de 8 bits siguen pasando hasta el tope de píxeles", async () => {
    for (const format of ["jpeg", "png"] as const) {
      const image = await decodeImage(await flat(8000, 5000)[format]().toBuffer());
      expect(image.width * image.height).toBe(IMAGE_MAX_PIXELS);
    }
  }, 30_000);

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

// El tope de píxeles de salida (ADR-119 regla 10). Reducir a un ancho no acota el alto: una imagen
// alta y angosta salía casi entera (DT-107). Se prueba por dimensiones, no por memoria medida.
describe("tope de píxeles de salida", () => {
  /** Toda codificación que la casa pide: la escalera de anchos, y el lado de la completa y de una evidencia. */
  const BOUNDS = [
    ...VARIANT_WIDTHS.map((width) => ({ width })),
    { side: FULL_VARIANT_MAX_SIDE },
  ] as const;

  const pixels = (image: { width: number; height: number }) => image.width * image.height;

  it("una imagen de 1600 × 16.000 no sale con más píxeles que el tope en ninguna codificación", async () => {
    // 25,6 megapíxeles en medio mega: pasa el tope de entrada y el presupuesto de memoria.
    const tall = await decodeImage(await flat(1600, 16_000, 4).png().toBuffer());
    const encoded = [];
    for (const bound of BOUNDS) {
      encoded.push({ bound, ...(await tall.toWebp(bound)) });
    }

    expect(encoded.map((image) => [image.bound, pixels(image) <= IMAGE_MAX_OUTPUT_PIXELS])).toEqual(
      BOUNDS.map((bound) => [bound, true]),
    );
    // Lo que ya cabía sale como salía: el ancho de 480 y la completa, que acota el lado.
    expect(encoded[0]).toMatchObject({ width: 480, height: 4800 });
    expect(encoded[3]).toMatchObject({ width: 256, height: 2560 });
    // Las de 960 y 1600 salen enteras, con su proporción de 1 a 10 y los píxeles del tope.
    for (const reduced of encoded.slice(1, 3)) {
      expect(reduced).toMatchObject({ width: 809, height: 8090 });
    }
  }, 60_000);

  it("una imagen acostada por su orientación EXIF se mide derecha", async () => {
    // 16.000 × 1600 con orientación 6: derecha es de 1600 × 16.000, la misma de arriba.
    const turned = await decodeImage(
      await flat(16_000, 1600).withMetadata({ orientation: 6 }).jpeg().toBuffer(),
    );
    expect(turned).toMatchObject({ width: 16_000, height: 1600 });

    expect(await turned.toWebp({ width: 1600 })).toMatchObject({ width: 809, height: 8090 });
    expect(await turned.toWebp({ width: 480 })).toMatchObject({ width: 480, height: 4800 });
  }, 60_000);

  it("la caja de salida nunca mide más píxeles que el tope, sea cual sea la imagen", () => {
    const sides = [1, 2, 37, 480, 809, 1600, 2560, 4096, 6324, 16_383, 40_000_000];
    const bounds = [...BOUNDS, { width: 1 }, { width: 2561 }, { width: 40_000_000 }, { side: 1 }];
    const over: string[] = [];
    for (const width of sides) {
      for (const height of sides) {
        for (const bound of bounds) {
          const box = outputBox({ width, height }, bound);
          const whole = Number.isInteger(box.width) && Number.isInteger(box.height);
          if (!whole || box.width < 1 || box.height < 1 || pixels(box) > IMAGE_MAX_OUTPUT_PIXELS) {
            over.push(`${width}x${height} a ${JSON.stringify(bound)}: ${box.width}x${box.height}`);
          }
        }
      }
    }
    expect(over).toEqual([]);
  });

  it("la caja no aprieta a una imagen común: a cada ancho de la escalera le sobra alto", () => {
    // Hasta 1 de ancho por 2,56 de alto en el ancho mayor: una foto vertical de 9 por 16 y la
    // captura de un celular de 9 por 21 caben.
    expect(outputBox({ width: 3000, height: 4000 }, { width: 1600 })).toEqual({
      width: 1600,
      height: 4096,
    });
    expect(outputBox({ width: 1080, height: 2520 }, { width: 960 })).toEqual({
      width: 960,
      height: 6826,
    });
    // Más angosta que el ancho pedido: no se agranda, y la caja es la de su propio ancho.
    expect(outputBox({ width: 300, height: 200 }, { width: 480 })).toEqual({
      width: 300,
      height: 21_845,
    });
    // Alta y angosta: no cabe a ese ancho y se reduce entera.
    expect(outputBox({ width: 1600, height: 16_000 }, { width: 1600 })).toEqual({
      width: 809,
      height: 8095,
    });
    expect(outputBox({ width: 500, height: 16_000 }, { width: 1600 })).toEqual({
      width: 452,
      height: 14_481,
    });
  });

  it("una imagen que cabe sale byte a byte como salía antes del tope", async () => {
    // La referencia es la codificación de antes de ADR-119 regla 10, escrita acá tal cual.
    const before = (bytes: Buffer, resize: ResizeOptions) =>
      sharp(bytes)
        .rotate()
        .resize({ ...resize, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    const noise = (width: number, height: number) =>
      sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
          noise: { type: "gaussian", mean: 128, sigma: 40 },
        },
      });
    // Entre todas cruzan cada escalón: la primera pasa del lado de la completa y del ancho mayor.
    const commons: Array<[string, Buffer]> = [
      ["JPEG apaisado de 2700 × 1800", await noise(2700, 1800).jpeg().toBuffer()],
      ["JPEG vertical de 1201 × 1601", await noise(1201, 1601).jpeg().toBuffer()],
      ["PNG de captura de 540 × 1170", await noise(540, 1170).png().toBuffer()],
      ["WebP de 1000 × 563", await noise(1000, 563).webp().toBuffer()],
      ["PNG pequeño de 300 × 200", await noise(300, 200).png().toBuffer()],
      [
        "JPEG girado por EXIF de 1000 × 750",
        await noise(1000, 750).withMetadata({ orientation: 8 }).jpeg().toBuffer(),
      ],
    ];

    const different: string[] = [];
    for (const [name, bytes] of commons) {
      const image = await decodeImage(bytes);
      for (const bound of BOUNDS) {
        const expected = await before(
          bytes,
          "side" in bound
            ? { width: bound.side, height: bound.side, fit: "inside" }
            : { width: bound.width },
        );
        const encoded = await image.toWebp(bound);
        if (!encoded.data.equals(expected)) {
          different.push(`${name} a ${JSON.stringify(bound)}`);
        }
      }
    }
    expect(different).toEqual([]);
  }, 60_000);

  it("un lado cuyo cuadrado pasa del tope rompe en vez de dejar fallida la imagen", async () => {
    const image = await decodeImage(await flat(300, 200).png().toBuffer());
    const outcome = await image.toWebp({ side: 2561 }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).not.toBeInstanceOf(ImageRejectedError);
  });
});
