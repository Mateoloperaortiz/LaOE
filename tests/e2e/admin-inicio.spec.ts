import { expect, test } from "@playwright/test";
import { sinViolaciones } from "./axe";

// Tablero del inicio del admin (ADR-037 regla 11): las secciones de T-160 enlazan a sus rutas y cada
// bloque del tablero enlaza a su sección. Los datos varían con el resto de la suite, así que se
// verifica la estructura y no las cifras.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("el inicio del admin muestra el tablero con sus bloques y enlaces", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Administración");

  const navigation = page.locator(".admin-sidebar").getByRole("navigation");
  await expect(navigation.getByRole("link", { name: "Inicio", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await navigation.getByRole("button", { name: "Gestión" }).click();
  await expect(
    navigation.getByRole("link", { name: "Organizaciones", exact: true }),
  ).toHaveAttribute("href", "/admin/organizaciones");
  const bloques: Array<[string, string]> = [
    ["Tus pendientes", "/admin/tareas?status=OPEN&assignee=mine"],
    ["Vencidas del equipo", "/admin/tareas?status=OPEN"],
    ["Solicitudes pendientes", "/admin/solicitudes"],
    ["Respuestas de la última semana", "/admin/formularios"],
    ["Pipelines", "/admin/pipelines"],
    ["Convocatorias abiertas", "/admin/convocatorias"],
    ["Ocasiones abiertas", "/admin/ocasiones?status=OPEN"],
    ["Sistema", "/admin/sistema/jobs"],
  ];
  for (const [titulo, ruta] of bloques) {
    const bloque = page.getByRole("region", { name: titulo, exact: true });
    await expect(bloque.getByRole("heading", { level: 2 })).toHaveText(titulo);
    await expect(bloque.getByRole("link", { name: "Ver todas" })).toHaveAttribute("href", ruta);
  }
  await expect(
    page
      .getByRole("region", { name: "Solicitudes pendientes", exact: true })
      .getByText(/^\d+ pendientes$/),
  ).toBeVisible();
  const sistema = page.getByRole("region", { name: "Sistema", exact: true });
  await expect(sistema.getByText(/trabajos con error/i)).toBeVisible();
  await expect(sistema.getByText(/copia/i)).toBeVisible();
  await sinViolaciones(page);

  // Cada enlace del tablero abre su sección.
  await page
    .getByRole("region", { name: "Pipelines", exact: true })
    .getByRole("link", { name: "Ver todas" })
    .click();
  await expect(page).toHaveURL(/\/admin\/pipelines$/);
});
