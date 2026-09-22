import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { copyPattern, itemPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// Tablero del inicio del admin (ADR-037 regla 11): las secciones de T-160 enlazan a sus rutas y cada
// bloque del tablero enlaza a su sección. Los datos varían con el resto de la suite, así que se
// verifica la estructura y no las cifras.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("el inicio del admin muestra el tablero con sus bloques y enlaces", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-236"));

  const navigation = page.locator(".admin-sidebar").getByRole("navigation");
  await expect(navigation.getByRole("link", { name: t("T-1401"), exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await navigation.getByRole("button", { name: tList("T-1400")[1] }).click();
  await expect(
    navigation.getByRole("link", { name: tList("T-908")[2], exact: true }),
  ).toHaveAttribute("href", "/admin/organizaciones");
  const [pendientes, vencidas, solicitudes, respuestas, pipelines, convocatorias, sistemaTitulo] =
    tList("T-1033");
  const bloques: Array<[string, string]> = [
    [pendientes, "/admin/tareas?status=OPEN&assignee=mine"],
    [vencidas, "/admin/tareas?status=OPEN"],
    [solicitudes, "/admin/solicitudes"],
    [respuestas, "/admin/formularios"],
    [pipelines, "/admin/pipelines"],
    [convocatorias, "/admin/convocatorias"],
    [t("T-672"), "/admin/ocasiones?status=OPEN"],
    [sistemaTitulo, "/admin/sistema/jobs"],
  ];
  for (const [titulo, ruta] of bloques) {
    const bloque = page.getByRole("region", { name: titulo, exact: true });
    await expect(bloque.getByRole("heading", { level: 2 })).toHaveText(titulo);
    await expect(bloque.getByRole("link", { name: t("T-1041") })).toHaveAttribute("href", ruta);
  }
  await expect(
    page
      .getByRole("region", { name: solicitudes, exact: true })
      .getByText(new RegExp(`^${itemPattern(t("T-1043"), "", "\\d+").source}$`)),
  ).toBeVisible();
  const sistema = page.getByRole("region", { name: sistemaTitulo, exact: true });
  await expect(
    sistema.getByText(
      new RegExp(`${copyPattern("T-1039").source}|${copyPattern("T-1045").source}`, "i"),
    ),
  ).toBeVisible();
  await expect(
    sistema.getByText(new RegExp(copyPattern("T-1040").source.split(" · ").join("|"), "i")),
  ).toBeVisible();
  await sinViolaciones(page);

  // Cada enlace del tablero abre su sección.
  await page
    .getByRole("region", { name: pipelines, exact: true })
    .getByRole("link", { name: t("T-1041") })
    .click();
  await expect(page).toHaveURL(/\/admin\/pipelines$/);
});
