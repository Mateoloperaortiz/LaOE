import { expect } from "@playwright/test";
import { deleteObject } from "@/shared/adapters/storage";
import { t } from "@/shared/copy";
import { seedSyntheticGallery } from "../factories/gallery";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });

let seeded: Awaited<ReturnType<typeof seedSyntheticGallery>> | null = null;
test.afterEach(async () => {
  await Promise.all(seeded?.keys.map(deleteObject) ?? []);
  seeded = null;
});

test("Fotos abre el visor a demanda, conserva foco y pasa a la siguiente tanda", async ({
  page,
}) => {
  test.setTimeout(90_000);
  seeded = await seedSyntheticGallery({ slug: "dias-2026", photoCount: 50 });
  const largeRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/fotos\/[^/?]+\?w=2400$/.test(request.url())) largeRequests.push(request.url());
  });
  await page.goto("/app/fotos");
  const albums = page.getByRole("tab", { name: t("T-3275"), exact: true });
  const featured = page.getByRole("tab", { name: t("T-3274"), exact: true });
  await featured.focus();
  await page.keyboard.press("ArrowRight");
  await expect(albums).toBeFocused();
  await expect(albums).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: t("T-3285", { album: "Momentos de prueba" }) }).click();
  await expect(
    page.getByRole("button", { name: t("T-3284", { n: 48 }), exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: t("T-3284", { n: 49 }), exact: true })).toHaveCount(
    0,
  );
  expect(largeRequests).toHaveLength(0);
  const last = page.getByRole("button", { name: t("T-3284", { n: 48 }), exact: true });
  await last.click();
  const viewer = page.getByRole("dialog", { name: t("T-3297"), exact: true });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText(t("T-3289", { actual: 48, total: 50 }))).toBeVisible();
  await expect.poll(() => largeRequests.length).toBe(1);
  await expect(viewer.locator("img")).toHaveJSProperty("complete", true);
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText(t("T-3289", { actual: 49, total: 50 }))).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText(t("T-3289", { actual: 50, total: 50 }))).toBeVisible();
  await expect(viewer.getByRole("button", { name: t("T-3288"), exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(last).toBeFocused();
  await expect(
    page.getByRole("button", { name: t("T-3284", { n: 50 }), exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: t("T-3290"), exact: true })).toHaveCount(0);
});

test("Fotos permite reintentar una tanda fallida con las fotos anteriores conservadas", async ({
  page,
}) => {
  test.setTimeout(90_000);
  seeded = await seedSyntheticGallery({ slug: "dias-2026", photoCount: 50 });
  let rejected = false;
  await page.route(
    "**/api/fotos/colecciones/dias-2026/albumes/momentos?pagina=2",
    async (route) => {
      if (!rejected) {
        rejected = true;
        await route.fulfill({ status: 503, body: "" });
      } else await route.continue();
    },
  );
  await page.goto("/app/fotos/dias-2026/momentos");
  await page.getByRole("button", { name: t("T-3290"), exact: true }).click();
  await expect(page.getByText(t("T-3292"), { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: t("T-3284", { n: 48 }), exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: t("T-3293"), exact: true }).click();
  await expect(
    page.getByRole("button", { name: t("T-3284", { n: 50 }), exact: true }),
  ).toBeVisible();
  await expect(page.getByText(t("T-3292"), { exact: true })).toHaveCount(0);
});

test("Fotos conserva proporciones y accesibilidad en escritorio y celular", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  seeded = await seedSyntheticGallery({ slug: "dias-2026", photoCount: 6 });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/app/fotos");
      await expect(page.getByRole("heading", { name: t("T-3270"), level: 1 })).toBeVisible();
      await sinViolaciones(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await page.screenshot({
        path: testInfo.outputPath(`fotos-${width}-${theme}.png`),
        fullPage: true,
      });
    }
    await page.goto("/app/fotos/dias-2026/momentos");
    const first = page.getByRole("button", { name: t("T-3284", { n: 1 }), exact: true });
    const photo = first.locator("img");
    await expect(photo).toHaveJSProperty("complete", true);
    const box = await photo.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(1.5, 2);
    await first.click();
    const viewer = page.getByRole("dialog", { name: t("T-3297"), exact: true });
    await sinViolaciones(page);
    const close = viewer.getByRole("button", { name: t("T-3286"), exact: true });
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(viewer.getByRole("button", { name: t("T-3288"), exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(first).toBeFocused();
  }
});
