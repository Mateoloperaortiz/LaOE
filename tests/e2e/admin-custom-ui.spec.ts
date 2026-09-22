import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("la Persona 360 permite cambiar de sección en móvil y cerrar acciones con Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/personas?q=prueba.e2e");
  await page.getByRole("link", { name: "Prueba E2E", exact: true }).click();
  await page.getByLabel(t("T-1502"), { exact: true }).selectOption("tareas");
  await expect(page).toHaveURL(/pestana=tareas/);
  await page.getByLabel(t("T-1502"), { exact: true }).selectOption("resumen");
  await expect(page).toHaveURL(/pestana=resumen/);

  const more = page.locator("main summary").filter({ hasText: t("T-1500") });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: tList("T-433")[1] })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: tList("T-433")[1] })).toBeHidden();
  await expect(more).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sinViolaciones(page);
});

test("las matrices de junta se recorren con teclado sin desbordar la página móvil", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/junta");
  const matrix = page.locator(".admin-matrix").first();
  await expect(matrix).toBeVisible();
  await expect(matrix).toHaveAttribute("aria-label", /.+/);
  await matrix.focus();
  await expect(matrix).toBeFocused();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sinViolaciones(page);
});

test("guardar datos mantiene los campos bloqueados hasta recibir la respuesta", async ({
  page,
}) => {
  await page.goto("/admin/personas?q=prueba.e2e");
  await page.getByRole("link", { name: "Prueba E2E", exact: true }).click();
  await page.getByRole("link", { name: tList("T-433")[0] }).click();
  const panel = page.getByRole("dialog");
  const phone = panel.getByLabel(tList("T-427")[4]);
  await expect(phone).toBeEnabled();
  let releaseRequest = () => {};
  const waitForRelease = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let markRequestStarted = () => {};
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  await page.route("**/admin/personas/*", async (route) => {
    if (route.request().method() === "POST") {
      markRequestStarted();
      await waitForRelease;
    }
    await route.continue();
  });
  const save = panel.getByRole("button", { name: t("T-253"), exact: true }).click();
  await requestStarted;
  try {
    await expect(phone).toBeDisabled();
    await expect(panel.getByRole("button", { name: t("T-1501") })).toBeDisabled();
  } finally {
    releaseRequest();
  }
  await save;
  await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
});

test("un error de validación en la ficha conserva lo que se estaba editando", async ({ page }) => {
  await page.goto("/admin/personas?q=prueba.e2e");
  await page.getByRole("link", { name: "Prueba E2E", exact: true }).click();
  await page.getByRole("link", { name: tList("T-433")[0] }).click();
  const panel = page.getByRole("dialog");
  const name = "Nombre de prueba demasiado largo ".repeat(15);
  await panel.getByLabel(tList("T-427")[0], { exact: true }).fill(name);
  await panel.getByLabel(tList("T-427")[4]).fill("+573001234567");
  await panel.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.getByLabel(tList("T-427")[0], { exact: true })).toHaveValue(name);
  await expect(panel.getByLabel(tList("T-427")[4])).toHaveValue("+573001234567");
});
