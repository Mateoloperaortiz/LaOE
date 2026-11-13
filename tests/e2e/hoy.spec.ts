import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// «Hoy» por urgencia (ADR-160 regla 2): lo que sigue va primero, después lo que le toca a la persona, y
// cada pendiente lleva a su pantalla de siempre.

test.use({ storageState: "tests/e2e/.auth/member.json" });

test("«Hoy» abre con lo que sigue y lo que te toca, y un pendiente lleva a su pantalla", async ({
  page,
}) => {
  await page.goto("/app");
  const [loQueSigue, teToca] = tList("T-4890");
  const titulos = await page.getByRole("main").getByRole("heading", { level: 2 }).allTextContents();
  expect(titulos.indexOf(loQueSigue)).toBe(0);
  expect(titulos.indexOf(teToca)).toBe(1);

  const pendientes = page.getByRole("region", { name: teToca, exact: true });
  const [, disponibilidad] = tList("T-4891");
  const marcar = pendientes.getByRole("link", { name: disponibilidad, exact: true });
  await expect(marcar).toBeVisible();
  await sinViolaciones(page);
  await marcar.click();
  await expect(page).toHaveURL(/\/app\/disponibilidad$/);
  expect(t("T-4892", { fecha: "x" })).toContain("x");
});
