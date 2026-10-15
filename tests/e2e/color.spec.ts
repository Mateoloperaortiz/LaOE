import { expect, type Page } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });

async function capture(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `.impeccable/review/${name}.png`, fullPage: true });
}

async function captureMatrix(page: Page, name: string) {
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await capture(page, `${name}-${width}-${colorScheme}`);
    }
  }
}

test("Juegos presenta Color sin perder los cuatro juegos ni la clasificación", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/app/juegos");
  await expect(page.getByRole("heading", { name: t("T-3488") })).toBeVisible();
  for (const href of ["wordle", "2048", "sudoku", "panal"]) {
    await expect(page.locator(`a[href="/app/juegos/${href}"]`)).toBeVisible();
  }
  await captureMatrix(page, "juegos-hub");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("link", { name: t("T-3400"), exact: true }).click();
  await expect(page.getByRole("heading", { name: t("T-3400"), exact: true })).toBeVisible();
  await page.getByRole("link", { name: t("T-3490"), exact: true }).click();
  await expect(page).toHaveURL(/\/app\/juegos\/color$/);
  await expect(page.getByRole("heading", { name: t("T-3487"), exact: true })).toBeVisible();
  await expect(page.getByText(t("T-3522"), { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: t("T-3498"), exact: true })).toBeVisible();
  await sinViolaciones(page);
  await capture(page, "color-ready-desktop");
});

async function completeColor(page: Page, captureMix: string) {
  const panel = page.locator("#color");
  for (let round = 1; round <= 3; round++) {
    const target = panel.getByRole("img", { name: t("T-3499"), exact: true });
    await expect(target).toBeVisible();
    await expect(panel.getByRole("slider")).toHaveCount(0);
    await expect(target).toHaveCount(0, { timeout: 8_000 });
    for (const label of tList("T-3506")) {
      const slider = panel.getByRole("slider", { name: label, exact: true });
      await slider.focus();
      await slider.press("Home");
      await expect(slider).toHaveValue("0");
    }
    if (round === 1) {
      await sinViolaciones(page);
      await capture(page, captureMix);
    }
    await panel.getByRole("button", { name: t("T-3508"), exact: true }).click();
    if (round < 3) {
      await expect(panel.getByRole("heading", { name: t("T-3510"), exact: true })).toBeFocused();
      await expect(panel.getByRole("img", { name: t("T-3509"), exact: true })).toBeVisible();
      await panel.getByRole("button", { name: t("T-3513"), exact: true }).click();
    }
  }
  await expect(panel.getByRole("heading", { name: t("T-3514"), exact: true })).toBeFocused();
  await expect(panel.getByRole("status", { name: copyPattern("T-3526") })).toHaveText(
    /^\d{1,3},\d%$/,
  );
}

test("completa tres rondas con teclado, ve el promedio y conserva su premio diario al practicar", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/app/gh-points");
  const ghBefore = await page.getByRole("heading", { name: copyPattern("T-081") }).textContent();
  await page.goto("/app/juegos/color");
  const panel = page.locator("#color");
  await panel.getByRole("button", { name: t("T-3498"), exact: true }).click();
  await completeColor(page, "color-mix-desktop");
  const award = panel.getByText(copyPattern("T-3523"));
  await expect(award).toBeVisible();
  const points = Number((await award.textContent())?.match(/\d+/)?.[0]);
  expect(points).toBeGreaterThanOrEqual(1);
  expect(points).toBeLessThanOrEqual(6);
  await expect(panel.getByText(t("T-3524"), { exact: true })).toBeVisible();
  await sinViolaciones(page);
  await captureMatrix(page, "color-final");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sinViolaciones(page);

  await panel.getByRole("button", { name: t("T-3517"), exact: true }).click();
  await completeColor(page, "color-mix-mobile-dark");
  await expect(panel.getByText(t("T-3548"), { exact: true })).toBeVisible();
  await expect(panel.getByText(copyPattern("T-3523"))).toHaveCount(0);

  await page.goto("/app/juegos");
  const ranking = page.getByRole("table", { name: t("T-3425"), exact: true });
  await expect(ranking.getByRole("row").last().getByRole("cell").nth(1)).toHaveText(String(points));
  await expect(page.getByText(t("T-3409", { n: 1 }), { exact: true })).toBeVisible();
  await sinViolaciones(page);
  await capture(page, "juegos-credited-mobile-dark");
  await page.goto("/app/gh-points");
  await expect(page.getByRole("heading", { name: copyPattern("T-081") })).toHaveText(
    ghBefore ?? "",
  );
});
