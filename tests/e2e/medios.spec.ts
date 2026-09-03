import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { closeDb, getDb } from "@/db/client";
import { mediaAsset } from "@/modules/content/schema";
import { sinViolaciones } from "./axe";

// Criterio de la fase 1 (09-roadmap.md): una portada de 5 MB sube directo al bucket y se sirve por
// redirección prefirmada. El outbox se drena desde la prueba porque en CI el poller está apagado.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("un ADMIN sube una portada de 5 MB directo al bucket y se sirve con 302 al bucket", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const nombre = `e2e-portada-${Date.now().toString(36)}.png`;
  // Ruido sin compresión: 1400 × 1400 × 3 bytes ≈ 5,9 MB de PNG.
  const buffer = await sharp(randomBytes(1400 * 1400 * 3), {
    raw: { width: 1400, height: 1400, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  expect(buffer.byteLength).toBeGreaterThan(5 * 1024 * 1024);

  await page.goto("/admin/medios");
  await sinViolaciones(page);
  const subidas = page.waitForResponse(
    (response) => response.url().includes("/api/media/confirm") && response.status() === 201,
  );
  await page
    .getByLabel("Subir imagen")
    .setInputFiles({ name: nombre, mimeType: "image/png", buffer });
  await subidas;
  await expect(page.getByText("Listo: la imagen queda disponible en unos segundos.")).toBeVisible();

  // Genera las variantes aquí mismo (en local el poller también puede haberlo hecho ya).
  await import("@/jobs/handlers");
  const { drain } = await import("@/jobs/poller");
  await drain(10);
  const [asset] = await getDb()
    .select()
    .from(mediaAsset)
    .where(eq(mediaAsset.originalFilename, nombre))
    .orderBy(desc(mediaAsset.createdAt))
    .limit(1);
  await closeDb();
  expect(asset?.status).toBe("READY");
  expect(Object.keys(asset?.variants ?? {}).sort()).toEqual(["w480", "w960"]);

  await page.reload();
  const fila = page.getByRole("row", { name: new RegExp(nombre) });
  await expect(fila.getByText("Lista")).toBeVisible();
  await expect(fila.getByText("1400 × 1400")).toBeVisible();

  const redirect = await page.request.get(`/api/media/${asset?.id}?w=960`, {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers()["cache-control"]).toBe("public, max-age=518400");
  const location = redirect.headers().location ?? "";
  expect(location).toContain(`variants/${asset?.id}/w960.webp`);
  const imagen = await page.request.get(location);
  expect(imagen.status()).toBe(200);
  expect(imagen.headers()["content-type"]).toBe("image/webp");
});
