import { expect, type Page, type TestInfo } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";

/**
 * La administración a un ancho y tema: documentos sin desborde ni violaciones de axe, el cajón
 * de navegación en pantallas estrechas y el panel de comité con un nombre extenso. Lo comparten
 * los escenarios de anchos móviles y amplios, en archivos distintos para el reparto E2E (ADR-140).
 */
export async function checkAdminResponsive(
  page: Page,
  testInfo: TestInfo,
  width: number,
  colorScheme: "light" | "dark",
): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme });
  await page.goto("/admin/documentos");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(tList("T-425")[0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath(`documentos-${width}-${colorScheme}.png`),
    fullPage: true,
  });
  await sinViolaciones(page);
  if (width < 1024) {
    const button = page.getByRole("button", { name: t("T-1402"), exact: true });
    await button.click();
    const drawer = page.getByRole("dialog", { name: t("T-236"), exact: true });
    await expect(drawer).toBeVisible();
    await sinViolaciones(page);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(button).toBeFocused();
    await button.click();
    await drawer.getByRole("link", { name: tList("T-334")[0], exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/medios$/);
    await expect(drawer).toBeHidden();
  }
  await page.goto("/admin/comites?nuevo=1");
  const panel = page.getByRole("dialog", { name: copyPattern("T-251") });
  await expect(panel).toBeVisible();
  await panel
    .getByLabel(t("T-273"), { exact: true })
    .fill("Comité de prueba con un nombre extenso para revisar el ancho");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sinViolaciones(page);
  await page.screenshot({
    path: testInfo.outputPath(`panel-${width}-${colorScheme}.png`),
    fullPage: true,
  });
}
