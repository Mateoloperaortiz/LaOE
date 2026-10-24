import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { checkAdminResponsive } from "./admin-responsive-check";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("navegación agrupada, destino único y panel accesible", async ({ page }) => {
  await page.goto("/admin/documentos");
  const navigation = page.locator(".admin-sidebar nav");
  while (await navigation.getByRole("button", { expanded: false }).count())
    await navigation.getByRole("button", { expanded: false }).first().click();
  const links = navigation.getByRole("link");
  await expect(
    navigation.getByRole("link", { name: tList("T-2200")[0], exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: tList("T-2323")[0], exact: true }),
  ).toBeVisible();
  const hrefs = await links.evaluateAll((items) => items.map((item) => item.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(hrefs.length);
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(navigation.locator('[aria-current="page"]')).toHaveText(tList("T-509")[6]);
  await navigation.getByRole("link", { name: tList("T-509")[1], exact: true }).click();
  await expect(navigation.locator('[aria-current="page"]')).toHaveText(tList("T-509")[1]);
  await page.goto("/admin/comites");
  const opener = page.getByRole("link", { name: t("T-251"), exact: true });
  await opener.click();
  const panel = page.getByRole("dialog", { name: copyPattern("T-251") });
  await expect(panel).toBeVisible();
  await sinViolaciones(page);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(opener).toBeFocused();
  await page.goto("/admin/comites?editar=no-existe");
  await expect(page.getByRole("button", { name: t("T-253"), exact: true })).toHaveCount(0);
});

// Anchos de celular; los amplios viven en admin-responsive-wide para el reparto (ADR-140).
for (const width of [360, 390]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`administración adaptable ${width}px ${colorScheme}`, async ({ page }, testInfo) => {
      await checkAdminResponsive(page, testInfo, width, colorScheme);
    });
  }
}

test("todos los destinos administrativos funcionan en móvil", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/admin");
  const hrefs = await page
    .locator(".admin-sidebar nav a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") as string));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const href of hrefs) {
    const response = await page.goto(href);
    expect(response?.status(), href).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }), href).toHaveCount(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      href,
    ).toBe(true);
    await sinViolaciones(page);
  }
});

test("el texto al 200 % conserva controles y contenido", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/comites?nuevo=1");
  await expect(page.getByRole("dialog", { name: copyPattern("T-251") })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const panel = page.getByRole("dialog", { name: copyPattern("T-251") });
  await panel.getByLabel(t("T-273"), { exact: true }).fill("Lectura ampliada");
  await panel.getByRole("button", { name: t("T-253"), exact: true }).scrollIntoViewIfNeeded();
  await expect(panel.getByRole("button", { name: t("T-253"), exact: true })).toBeInViewport();
  await sinViolaciones(page);
  await page.screenshot({ path: testInfo.outputPath("texto-200.png") });
});
