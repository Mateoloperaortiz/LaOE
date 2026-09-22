import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// Galería de egresados (ADR-030): el seed sintético trae egresados de varios años con consentimiento.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("la galería de egresados muestra un cartel por año y pasa axe", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: t("T-1662"), exact: true }).click();
  await page
    .getByRole("dialog", { name: t("T-1660"), exact: true })
    .getByRole("link", { name: tList("T-061")[4], exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/egresados$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-074"));
  await expect(
    page
      .getByRole("heading", {
        level: 2,
        name: new RegExp(fillCopy(tList("T-222")[0], { año: "20\\d\\d" })),
      })
      .first(),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await sinViolaciones(page);
});
