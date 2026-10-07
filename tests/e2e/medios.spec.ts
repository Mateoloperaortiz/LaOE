import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { closeDb, getDb } from "@/db/client";
import { mediaAsset } from "@/modules/content/schema";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

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
  await page.getByRole("link", { name: t("T-356"), exact: true }).click();
  const subidas = page.waitForResponse(
    (response) => response.url().includes("/api/media/confirm") && response.status() === 201,
  );
  await page
    .getByRole("dialog")
    .getByLabel(t("T-356"))
    .setInputFiles({ name: nombre, mimeType: "image/png", buffer });
  await page
    .getByRole("dialog")
    .locator('button[type="submit"]', { hasText: t("T-356") })
    .click();
  await subidas;
  await expect(page.getByText(t("T-360"))).toBeVisible();

  // Genera las variantes aquí mismo (en local el poller también puede haberlo hecho ya).
  const buscar = () =>
    getDb()
      .select()
      .from(mediaAsset)
      .where(eq(mediaAsset.originalFilename, nombre))
      .orderBy(desc(mediaAsset.createdAt))
      .limit(1);
  const [pendiente] = await buscar();
  expect(pendiente).toBeTruthy();
  // Idempotente: si el poller del dev server ya la procesó, no repite el trabajo.
  const { processMedia } = await import("@/modules/content/domain/media-process");
  await processMedia(pendiente?.id ?? "");
  const [asset] = await buscar();
  await closeDb();
  expect(asset?.status).toBe("READY");
  // `full` es la variante completa, la que se entrega en lugar del original (ADR-114 regla 8).
  expect(Object.keys(asset?.variants ?? {}).sort()).toEqual(["full", "w480", "w960"]);

  await page.reload();
  const fila = page.getByRole("row", { name: new RegExp(nombre) });
  await expect(fila.getByText(tList("T-358")[1])).toBeVisible();
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

test("la imagen y su visibilidad se conservan después de un fallo", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/media/presign", async (route) => {
    attempts += 1;
    await route.fulfill({ status: 503, json: { error: "Subida de prueba interrumpida." } });
  });
  await page.goto("/admin/medios");
  await page.getByRole("link", { name: t("T-356"), exact: true }).click();
  const panel = page.getByRole("dialog");
  const image = await sharp({
    create: { width: 800, height: 800, channels: 3, background: "#94b6f0" },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  await panel
    .getByLabel(t("T-356"))
    .setInputFiles({ name: "conservar.png", mimeType: "image/png", buffer: image });
  expect(attempts).toBe(0);
  await panel.getByLabel(t("T-365")).selectOption("PRIVATE");
  const submit = panel.locator('button[type="submit"]', { hasText: t("T-356") });
  await submit.click();
  await expect(panel.getByRole("alert")).toHaveText("Subida de prueba interrumpida.");
  await expect(panel.getByLabel(t("T-365"))).toHaveValue("PRIVATE");
  expect(
    await panel
      .getByLabel(t("T-356"))
      .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
  ).toBe("conservar.png");
  await submit.click();
  await expect.poll(() => attempts).toBe(2);
  await expect(panel.getByRole("alert")).toBeVisible();
  await sinViolaciones(page);
});
