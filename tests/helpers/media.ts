import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { expect } from "vitest";

/** Un PNG de ruido sin comprimir: pesa lo que mide, así pasa el mínimo de bytes de un medio. */
export async function noisePng(width: number, height: number): Promise<Buffer> {
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

/**
 * Sube un archivo al bucket como hace el navegador: el POST prefirmado que devolvió `prepareUpload`,
 * con sus campos y el archivo al final. No confirma la subida: eso lo decide cada prueba.
 */
export async function uploadAsBrowser(
  prepared: { url: string; fields: Record<string, string> },
  file: { bytes: Buffer | string; contentType: string; filename: string },
): Promise<void> {
  const form = new FormData();
  for (const [name, value] of Object.entries(prepared.fields)) {
    form.append(name, value);
  }
  const part = typeof file.bytes === "string" ? file.bytes : Uint8Array.from(file.bytes);
  form.append("file", new Blob([part], { type: file.contentType }), file.filename);
  const response = await fetch(prepared.url, { method: "POST", body: form });
  expect([200, 201, 204]).toContain(response.status);
}
