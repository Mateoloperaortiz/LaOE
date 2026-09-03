import { expect, test } from "@playwright/test";
import { sinViolaciones } from "./axe";

// Galería de egresados (ADR-030): el seed sintético trae egresados de varios años con consentimiento.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("la galería de egresados muestra un cartel por año y pasa axe", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("link", { name: "Egresados" }).click();
  await expect(page).toHaveURL(/\/app\/egresados$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Egresados");
  await expect(
    page.getByRole("heading", { level: 2, name: /Egresados 20\d\d/ }).first(),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await sinViolaciones(page);
});
