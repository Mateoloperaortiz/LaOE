import { mkdir } from "node:fs/promises";
import { expect } from "@playwright/test";
import { getDb } from "@/db/client";
import { committee } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });

test("busca sin tildes, conserva los comités propios y permite recuperar la lista", async ({
  page,
}) => {
  await getDb().insert(committee).values({
    slug: "e2e-agora",
    name: "Ágora de prueba",
    status: "ACTIVE",
    presentation: null,
  });
  await page.goto("/app/comites");
  const own = page.getByRole("region", { name: t("T-375"), exact: true });
  const others = page.getByRole("region", { name: t("T-382"), exact: true });
  const ownLinks = await own.getByRole("link").allTextContents();
  expect(ownLinks.length).toBeGreaterThan(0);
  const search = page.getByRole("searchbox", { name: t("T-2597") });
  await search.fill("AGORA");
  await expect(others.getByRole("link")).toHaveCount(1);
  const match = others.getByRole("link", {
    name: t("T-2596", { comité: "Ágora de prueba" }),
    exact: true,
  });
  await expect(match).toBeVisible();
  await expect(match).toContainText(t("T-310"));
  expect(await own.getByRole("link").allTextContents()).toEqual(ownLinks);
  await search.fill("e2e-agora");
  await expect(match).toBeVisible();
  await search.fill("no-existe-este-comite");
  await expect(others.getByRole("link")).toHaveCount(0);
  await expect(others.getByText(copyPattern("T-1550"))).toBeVisible();
  await page.getByRole("button", { name: t("T-1474"), exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(match).toBeVisible();
  await match.click();
  await expect(page).toHaveURL(/\/app\/comites\/e2e-agora$/);
  await expect(page.getByRole("heading", { name: "Ágora de prueba", level: 1 })).toBeVisible();
});

test("directorio legible en escritorio, móvil y ambos temas", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/comites");
  await page.evaluate(() => document.fonts.ready);
  const screenshotDir = process.env.COMMITTEES_REVIEW_DIR;
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  for (const [width, theme, name] of [
    [1440, "light", "desktop"],
    [390, "light", "mobile"],
    [1440, "dark", "desktop-dark"],
    [390, "dark", "mobile-dark"],
    [1979, "light", "user-1979"],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
      window.scrollTo(0, 0);
    }, theme);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-309"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await sinViolaciones(page);
    if (screenshotDir) {
      await page.screenshot({
        path: `${screenshotDir}/${name}.png`,
        fullPage: true,
        animations: "disabled",
      });
      if (name === "desktop")
        await page.screenshot({ path: `${screenshotDir}/preview.png`, animations: "disabled" });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("searchbox")).toBeVisible();
  await sinViolaciones(page);
});

test("nombres extensos y presentaciones largas conservan la acción y el contenido accesible", async ({
  page,
}) => {
  const name = "Comité sintético de Diseño, Ciencias y Comunicación Interdisciplinaria";
  await getDb().insert(committee).values({
    slug: "e2e-contenido-extenso",
    name,
    status: "ACTIVE",
    logoKey: "conexion",
    presentation:
      "Presentación sintética para comprobar cómo se muestran los textos extensos en el directorio. Incluye varias oraciones y palabras de diferente longitud. La ficha completa conserva todo el contenido, mientras la tarjeta muestra solamente un resumen para facilitar la exploración.",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/comites");
  await page.getByRole("searchbox").fill("e2e-contenido-extenso");
  const card = page.getByRole("link", { name: t("T-2596", { comité: name }), exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading")).toHaveText(name);
    await expect(card.getByText(t("T-2595"), { exact: true })).toBeVisible();
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    await sinViolaciones(page);
    if (process.env.COMMITTEES_REVIEW_DIR)
      await page.screenshot({
        path: `${process.env.COMMITTEES_REVIEW_DIR}/long-content-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
  }
});
