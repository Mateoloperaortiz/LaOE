import { expect } from "@playwright/test";
import { closeDb } from "@/db/client";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { subirPortada } from "./media-helper";

// Eventos y ediciones (F1-T4): admin anidado, portal, próximo encuentro e ICS.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("un ADMIN crea una edición con portada y organizadores y el visitante la ve con su imagen", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const marca = Date.now().toString(36);
  const slug = `e2e-${marca}`;
  const nombre = `Edición e2e ${marca}`;
  const portada = `e2e-portada-edicion-${marca}.png`;
  await subirPortada(page, portada);
  await closeDb();

  await page.goto("/admin/eventos");
  await page
    .getByRole("row", { name: /Días EAFIT/ })
    .getByRole("link", { name: copyPattern("T-369") })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `${tList("T-333")[0]} · Días EAFIT`,
  );
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  // El evento viene fijado por la ruta.
  await expect(panel.getByLabel(t("T-347"))).toHaveValue(/.+/);
  await page.getByLabel(t("T-348")).fill(nombre);
  await panel.getByLabel(t("T-349")).fill(slug);
  const year = new Date().getFullYear() + 1;
  await panel.getByLabel(t("T-350")).fill(`${year}-03-10T18:00`);
  await panel.getByLabel(t("T-351")).fill(`${year}-03-10T21:00`);
  await panel.getByLabel(t("T-352")).fill("Auditorio de prueba");
  const opcionPortada = panel.getByLabel(t("T-346")).locator("option", { hasText: portada });
  await panel
    .getByLabel(t("T-346"))
    .selectOption((await opcionPortada.getAttribute("value")) ?? "");
  await panel.getByRole("checkbox", { name: "A3", exact: true }).check();
  await panel.getByRole("checkbox", { name: "AGRO", exact: true }).check();
  await panel.getByLabel(t("T-279")).selectOption("PUBLISHED");
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByRole("cell", { name: nombre, exact: true })).toBeVisible();

  await page.goto(`/eventos/dias-eafit/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
  await expect(page.getByText("Auditorio de prueba")).toBeVisible();
  await expect(page.getByText(t("T-311"))).toBeVisible();
  await expect(page.getByRole("link", { name: /A3/ })).toBeVisible();
  const imagen = page.locator('img[src^="/api/media/"]').first();
  await expect(imagen).toBeVisible();
  await expect
    .poll(async () => imagen.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await sinViolaciones(page);

  await page.goto("/eventos/dias-eafit");
  await expect(page.getByRole("link", { name: new RegExp(nombre) })).toBeVisible();
  await sinViolaciones(page);

  await page.goto("/eventos");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-304"));
  await expect(page.getByRole("link", { name: /Días EAFIT/ })).toBeVisible();
  await sinViolaciones(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: t("T-008") })).toBeVisible();
  await sinViolaciones(page);

  const ics = await page.request.get("/api/ics/publico.ics");
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const cuerpo = await ics.text();
  expect(cuerpo).toContain("BEGIN:VCALENDAR");
  expect(cuerpo.replace(/\r\n /g, "")).toContain(`SUMMARY:Días EAFIT · ${nombre}`);
});
