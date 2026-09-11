import { expect } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.describe("cambio de área con la misma cuenta", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  for (const width of [360, 768, 1024, 1440]) {
    test(`ADMIN pasa entre Mi OE y Administración a ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await page.goto("/admin/personas");
        const member = page.locator(".admin-topbar").getByRole("link", {
          name: "Cambiar a Mi OE (vista de integrante)",
          exact: true,
        });
        await expect(member).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await sinViolaciones(page);
        await page.screenshot({ path: testInfo.outputPath(`admin-${width}-${theme}.png`) });
        await member.click();
        await expect(page).toHaveURL(/\/app$/);
        // El enlace permanece en todas las páginas, incluso fuera de Inicio.
        await page.goto("/app/agenda");
        const admin = page.locator(".member-topbar").getByRole("link", {
          name: "Cambiar a Administración",
          exact: true,
        });
        await expect(admin).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await sinViolaciones(page);
        await page.screenshot({ path: testInfo.outputPath(`mi-oe-${width}-${theme}.png`) });
        await admin.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/\/admin$/);
        await expect(
          page.getByRole("heading", { name: "Administración", exact: true }),
        ).toBeVisible();
      }
    });
  }

  test("los accesos siguen disponibles con texto al 200 %", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/app");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.getByRole("link", { name: "Cambiar a Administración", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .getByRole("link", { name: "Cambiar a Mi OE (vista de integrante)", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app$/);
    const header = page.locator(".member-topbar");
    await header.screenshot({ path: testInfo.outputPath("mi-oe-texto-200.png") });
    expect(await header.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
});

test.describe("integrante sin permisos de gestión", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("no recibe el acceso a Administración ni puede entrar por URL", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: "Cambiar a Administración" })).toHaveCount(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/app$/);
  });
});
