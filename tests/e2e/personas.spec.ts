import { expect } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// Personas (fase 2): alta manual desde el kit, Persona 360 con edición, cambio de estado, nota y tarea.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("un ADMIN da de alta a un prospecto y edita sus datos en la Persona 360", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const email = `e2e-${stamp}@eafit.edu.co`;
  await page.goto("/admin/personas");
  await page.getByRole("link", { name: "Nuevo" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Nombre", { exact: true }).fill("Prospecto");
  await panel.getByLabel("Apellido").fill(`E2E ${stamp}`);
  await panel.getByLabel("Correo institucional").fill(email);
  await panel.getByLabel("Tipo", { exact: true }).selectOption("STUDENT");
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();

  await page.goto(`/admin/personas?q=${encodeURIComponent(email)}`);
  await page.getByRole("link", { name: `Prospecto E2E ${stamp}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Prospecto E2E ${stamp}`);
  await expect(page.getByText("Prospecto", { exact: true }).first()).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: "Editar datos" }).click();
  const editar = page.getByRole("dialog");
  await editar.getByLabel("Celular").fill("300 123 4567");
  await editar.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByText("+573001234567").first()).toBeVisible();
});

test("la Persona 360 cambia el estado, deja una nota y crea una tarea", async ({ page }) => {
  await page.goto("/admin/personas?q=prueba.e2e");
  await page.getByRole("link", { name: "Prueba E2E" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Prueba E2E");

  await page.locator("main summary").filter({ hasText: "Más acciones" }).click();
  await page.getByRole("link", { name: "Cambiar estado" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Estado nuevo").selectOption("HONORARY");
  await panel.getByLabel("Motivo").fill("Prueba e2e: honorario por un momento");
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByText("Activo → Honorario").last()).toBeVisible();
  await sinViolaciones(page);

  await page.locator("main summary").filter({ hasText: "Más acciones" }).click();
  await page.getByRole("link", { name: "Cambiar estado" }).click();
  const back = page.getByRole("dialog");
  await back.getByLabel("Estado nuevo").selectOption("ACTIVE");
  await back.getByLabel("Motivo").fill("Prueba e2e: vuelve a activo");
  await back.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Honorario → Activo").last()).toBeVisible();

  const stamp = Date.now().toString(36);
  await page.getByRole("link", { name: "Nueva nota" }).click();
  const nota = page.getByRole("dialog");
  await nota.getByLabel("Nueva nota").fill(`Nota e2e ${stamp} con **énfasis**`);
  await nota.getByRole("button", { name: "Guardar nota" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByText(`Nota e2e ${stamp} con`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Notas" })).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: "Nueva tarea" }).click();
  const tarea = page.getByRole("dialog");
  await tarea.getByLabel("Título").fill(`Tarea e2e ${stamp}`);
  await tarea.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByRole("cell", { name: `Tarea e2e ${stamp}` })).toBeVisible();
  await page
    .getByRole("row", { name: new RegExp(`Tarea e2e ${stamp}`) })
    .getByRole("button", { name: "Marcar hecha" })
    .click();
  await expect(page.getByText("Guardado.")).toBeVisible();
});
