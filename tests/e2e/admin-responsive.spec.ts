import { expect, test } from "@playwright/test";
import { sinViolaciones } from "./axe";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("navegación agrupada, destino único y panel accesible", async ({ page }) => {
  await page.goto("/admin/documentos");
  const navigation = page.locator(".admin-sidebar nav");
  while (await navigation.getByRole("button", { expanded: false }).count())
    await navigation.getByRole("button", { expanded: false }).first().click();
  const links = navigation.getByRole("link");
  await expect(links).toHaveCount(38);
  const hrefs = await links.evaluateAll((items) => items.map((item) => item.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(38);
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Documentos");
  await navigation.getByRole("link", { name: "Importar roster", exact: true }).click();
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("Importar roster");
  await page.goto("/admin/comites");
  const opener = page.getByRole("link", { name: "Nuevo", exact: true });
  await opener.click();
  const panel = page.getByRole("dialog", { name: /Nuevo/ });
  await expect(panel).toBeVisible();
  await sinViolaciones(page);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(opener).toBeFocused();
  await page.goto("/admin/comites?editar=no-existe");
  await expect(page.getByRole("button", { name: "Guardar", exact: true })).toHaveCount(0);
});

for (const width of [360, 390, 768, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`administración adaptable ${width}px ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto("/admin/documentos");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Documentos");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`documentos-${width}-${colorScheme}.png`),
        fullPage: true,
      });
      await sinViolaciones(page);
      if (width < 1024) {
        const button = page.getByRole("button", { name: "Menú", exact: true });
        await button.click();
        const drawer = page.getByRole("dialog", { name: "Administración", exact: true });
        await expect(drawer).toBeVisible();
        await sinViolaciones(page);
        await page.keyboard.press("Escape");
        await expect(drawer).toBeHidden();
        await expect(button).toBeFocused();
        await button.click();
        await drawer.getByRole("link", { name: "Medios", exact: true }).click();
        await expect(page).toHaveURL(/\/admin\/medios$/);
        await expect(drawer).toBeHidden();
      }
      await page.goto("/admin/comites?nuevo=1");
      const panel = page.getByRole("dialog", { name: /Nuevo/ });
      await expect(panel).toBeVisible();
      await panel
        .getByLabel("Nombre", { exact: true })
        .fill("Comité de prueba con un nombre extenso para revisar el ancho");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await sinViolaciones(page);
      await page.screenshot({
        path: testInfo.outputPath(`panel-${width}-${colorScheme}.png`),
        fullPage: true,
      });
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
  await expect(page.getByRole("dialog", { name: /Nuevo/ })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const panel = page.getByRole("dialog", { name: /Nuevo/ });
  await panel.getByLabel("Nombre", { exact: true }).fill("Lectura ampliada");
  await panel.getByRole("button", { name: "Guardar", exact: true }).scrollIntoViewIfNeeded();
  await expect(panel.getByRole("button", { name: "Guardar", exact: true })).toBeInViewport();
  await sinViolaciones(page);
  await page.screenshot({ path: testInfo.outputPath("texto-200.png") });
});
