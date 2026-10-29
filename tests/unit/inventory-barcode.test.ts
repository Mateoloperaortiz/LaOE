import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { toSVG } from "bwip-js/node";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

// Comprueba el intercambio entre las dos librerías reales: etiqueta OE impresa y lector del CML.
// No sustituye las pruebas con cámara, enfoque y papel en un teléfono físico.
describe("etiquetas Code 128 del inventario", () => {
  it.each([
    "OE-I-ABC123DEF456GHI789JKL012",
    "OE-U-ZYX987WVU654TSR321QPO000",
  ])("el lector recupera íntegra la etiqueta sintética %s", async (code) => {
    const svg = toSVG({ bcid: "code128", text: code, scale: 2, height: 12, padding: 4 });
    const { data, info } = await sharp(Buffer.from(svg))
      .flatten({ background: "white" })
      .greyscale()
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const source = new RGBLuminanceSource(new Uint8ClampedArray(data), info.width, info.height);
    const reader = new MultiFormatReader();
    const hints = new Map<DecodeHintType, BarcodeFormat[]>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]],
    ]);
    const decoded = reader.decode(new BinaryBitmap(new HybridBinarizer(source)), hints);
    expect(decoded.getBarcodeFormat()).toBe(BarcodeFormat.CODE_128);
    expect(decoded.getText()).toBe(code);
  });
});
