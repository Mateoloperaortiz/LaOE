import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import sharp from "sharp";

// Sube una imagen sintética por la API (presign → bucket → confirm) y drena el outbox para que quede lista.

export async function subirPortada(page: Page, nombre: string): Promise<string> {
  const buffer = await sharp(randomBytes(640 * 360 * 3), {
    raw: { width: 640, height: 360, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const presign = await page.request.post("/api/media/presign", {
    data: {
      filename: nombre,
      contentType: "image/png",
      byteSize: buffer.byteLength,
      visibility: "PUBLIC",
    },
  });
  if (!presign.ok()) {
    throw new Error(`presign ${presign.status()}: ${await presign.text()}`);
  }
  const prepared = (await presign.json()) as {
    key: string;
    url: string;
    fields: Record<string, string>;
  };
  const stored = await page.request.post(prepared.url, {
    multipart: { ...prepared.fields, file: { name: nombre, mimeType: "image/png", buffer } },
  });
  if (!stored.ok()) {
    throw new Error(`bucket ${stored.status()}: ${await stored.text()}`);
  }
  const confirm = await page.request.post("/api/media/confirm", {
    data: { key: prepared.key, filename: nombre, visibility: "PUBLIC" },
  });
  if (!confirm.ok()) {
    throw new Error(`confirm ${confirm.status()}: ${await confirm.text()}`);
  }
  const { id } = (await confirm.json()) as { id: string };
  // Genera las variantes aquí mismo: en CI el poller está apagado y en local puede estar compitiendo.
  const { processMedia } = await import("@/modules/content/domain/media-process");
  await processMedia(id);
  return id;
}
