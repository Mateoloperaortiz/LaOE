import { mkdir } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });

test("guarda una semana y responde una propuesta privada con fechas concretas", async ({
  page,
  browser,
}) => {
  await page.goto("/app/disponibilidad");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-4600"));
  const editor = page.getByRole("region", { name: t("T-4601"), exact: true });
  const first = editor.getByRole("button", { name: /^Lunes, 00:00 a 00:30:/ });
  await first.click();
  const saveButton = editor.getByRole("button", { name: t("T-4606"), exact: true });
  await saveButton.scrollIntoViewIfNeeded();
  const scrollBeforeSave = await page.evaluate(() => window.scrollY);
  const [saveRequest] = await Promise.all([
    page.waitForRequest(
      (request) => request.method() === "POST" && request.url().includes("/app/disponibilidad"),
    ),
    saveButton.click(),
  ]);
  await expect(editor.getByText(t("T-4607"), { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBeforeSave);
  await page.reload();
  await expect(first).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("combobox", { name: t("T-4613"), exact: true }).selectOption({ index: 1 });
  await page.getByRole("button", { name: t("T-4649"), exact: true }).click();
  await page.getByText(t("T-4626"), { exact: true }).click();
  await page.getByLabel(t("T-4627"), { exact: true }).fill("Encuentro sintético");
  await page.getByLabel(t("T-4630"), { exact: true }).fill(todayKey());
  await page.getByRole("button", { name: t("T-4630"), exact: true }).click();
  await page.getByRole("button", { name: t("T-4634"), exact: true }).click();
  await expect(page).toHaveURL(/\/app\/disponibilidad\/reuniones\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Encuentro sintético");
  const response = page.getByRole("region", { name: t("T-4644"), exact: true });
  await response.getByRole("button", { name: /08:00 a 08:30:/ }).click();
  await response.getByRole("button", { name: t("T-4606"), exact: true }).click();
  await expect(response.getByText(t("T-4607"), { exact: true })).toBeVisible();

  await inspectLayouts(page, "reunion");

  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const privateResponse = await anonymous.request.get(page.url(), { maxRedirects: 0 });
  expect(privateResponse.status()).toBe(307);
  expect(privateResponse.headers().location).toContain("/ingresar");
  expect(await privateResponse.text()).not.toContain("Encuentro sintético");
  const headers = saveRequest.headers();
  const unauthorizedSave = await anonymous.request.post(saveRequest.url(), {
    headers: {
      "content-type": headers["content-type"] ?? "",
      "next-action": headers["next-action"] ?? "",
      origin: new URL(page.url()).origin,
    },
    data: saveRequest.postDataBuffer() ?? undefined,
    maxRedirects: 0,
  });
  expect(
    unauthorizedSave.headers()["x-action-redirect"] ?? unauthorizedSave.headers().location,
  ).toContain("/ingresar");
  const authenticatedResponse = await page.request.get(page.url());
  expect(authenticatedResponse.headers()["cache-control"]).toContain("no-store");
  await anonymous.close();
});

test("la cuadrícula funciona por teclado y cabe en móvil y escritorio en ambos temas", async ({
  page,
}) => {
  await page.goto("/app/disponibilidad");
  const editor = page.getByRole("region", { name: t("T-4601"), exact: true });
  const first = editor.getByRole("button", { name: /^Lunes, 00:00 a 00:30:/ });
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect(editor.getByRole("button", { name: /^Lunes, 00:30 a 01:00:/ })).toBeFocused();
  await inspectLayouts(page, "semana");
});

async function inspectLayouts(page: Page, surface: string) {
  const dir = process.env.AVAILABILITY_REVIEW_DIR;
  if (dir) await mkdir(dir, { recursive: true });
  for (const width of [390, 1440]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
        window.scrollTo(0, 0);
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await sinViolaciones(page);
      if (dir)
        await page.screenshot({
          path: `${dir}/${surface}-${width}-${theme}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
}
