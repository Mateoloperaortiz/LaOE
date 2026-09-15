import { expect } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { E2E_CALENDAR, E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

// Personas (fase 2): alta manual desde el kit, Persona 360 con edición, cambio de estado, nota y tarea;
// desde ADR-056, "dar de alta" desde la cabecera y la condición del semestre desde Membresía.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("un ADMIN crea un prospecto, edita sus datos y lo da de alta desde la cabecera", async ({
  page,
}) => {
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

  // Sin membresía, la cabecera ofrece "Dar de alta" y el bloque de comités dice que falta la membresía.
  const cabecera = page.locator("header").filter({
    has: page.getByRole("heading", { name: `Prospecto E2E ${stamp}`, level: 1 }),
  });
  await expect(cabecera.getByText("Sin membresía: podés darla de alta.")).toBeVisible();
  await cabecera.getByRole("link", { name: "Dar de alta" }).click();
  const alta = page.getByRole("dialog");
  await expect(
    alta.getByText(new RegExp(`Vas a dar de alta a Prospecto E2E ${stamp}`)),
  ).toBeVisible();
  await alta.getByRole("checkbox", { name: "A3", exact: true }).check();
  await alta.getByRole("button", { name: "Dar de alta" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(cabecera.getByText("Miembro", { exact: true })).toBeVisible();
  await expect(cabecera.getByText("Activo", { exact: true })).toBeVisible();
  await expect(cabecera.getByText("A3 · Miembro")).toBeVisible();
  await expect(cabecera.getByRole("link", { name: "Dar de alta" })).toHaveCount(0);
  await expect(cabecera.getByRole("link", { name: "Editar datos" })).toBeVisible();
  await sinViolaciones(page);
});

test("la Persona 360 marca y retira el periodo de prueba del semestre con motivo", async ({
  page,
}) => {
  await page.goto("/admin/personas?q=prueba.e2e");
  await page.getByRole("link", { name: "Prueba E2E" }).click();
  await page.waitForURL(/\/admin\/personas\/[^/?]+$/);
  const personUrl = page.url();
  await page.getByRole("link", { name: "Membresía", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Condición del semestre" })).toBeVisible();

  await page.getByRole("link", { name: "Cambiar condición" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByLabel("Término")).toHaveValue(/.+/);
  await panel.getByLabel("Término").selectOption({ label: E2E_TERM.code });
  await expect(panel.getByLabel("En periodo de prueba")).not.toBeChecked();
  await panel.getByLabel("En periodo de prueba").check();
  await panel.getByLabel("Motivo").fill("Prueba e2e: condición marcada a mano");
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(
    page.getByText(`${E2E_TERM.code} · Prueba e2e: condición marcada a mano`),
  ).toBeVisible();
  await sinViolaciones(page);

  // El evento alimenta la línea de tiempo (crm) y el recálculo de permanencia.
  await drenarOutbox();
  await page.goto(`${personUrl}?pestana=linea`);
  await expect(
    page.getByText(
      `En periodo de prueba en ${E2E_TERM.code}: Prueba e2e: condición marcada a mano`,
    ),
  ).toBeVisible();

  await page.goto(`${personUrl}?pestana=membresia&accion=condicion`);
  const retirar = page.getByRole("dialog");
  await expect(retirar.getByLabel("En periodo de prueba")).toBeChecked();
  await retirar.getByLabel("En periodo de prueba").uncheck();
  await retirar.getByLabel("Motivo").fill("Prueba e2e: condición retirada");
  await retirar.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByText("Prueba e2e: condición marcada a mano")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Cambiar condición" })).toBeVisible();
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

test("la ficha separa cargos vigentes e históricos y agrupa GH dentro de Junta Directiva", async ({
  page,
}) => {
  await page.goto("/admin/personas?q=prueba.e2e");
  await page.getByRole("link", { name: "Prueba E2E" }).click();
  await page.waitForURL(/\/admin\/personas\/[^/?]+$/);
  const personUrl = page.url();
  for (const [kind, semester, title] of [
    ["OTHER", E2E_CALENDAR.previous.code, "Dirección de Publicidad · Evento Histórico"],
    ["GH_HEAD", E2E_TERM.code, ""],
  ] as const) {
    await page.goto(`${personUrl}?pestana=membresia&accion=cargo`);
    const panel = page.getByRole("dialog", { name: "Agregar cargo" });
    await panel.getByLabel("Cargo", { exact: true }).selectOption(kind);
    await panel.getByLabel("Término", { exact: true }).selectOption({ label: semester });
    if (title) await panel.locator('input[name="title"]').fill(title);
    await panel.getByRole("button", { name: "Agregar cargo", exact: true }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
  }
  const header = page.locator("header").filter({ has: page.getByRole("heading", { level: 1 }) });
  await expect(header.getByRole("heading", { name: "Cargos vigentes", exact: true })).toBeVisible();
  await expect(header.getByText("Junta Directiva", { exact: true })).toBeVisible();
  await expect(header.getByText("GH principal", { exact: true })).toBeVisible();
  await expect(header).not.toContainText("Evento Histórico");
  const history = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Historial de cargos", exact: true }) });
  await expect(history.getByText(E2E_CALENDAR.previous.code, { exact: true })).toBeVisible();
  await expect(history.getByText("Evento Histórico", { exact: true })).toBeVisible();
  await expect(history.getByText("Dirección de Publicidad", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Junta y GH");
  await sinViolaciones(page);
  for (const [name, width] of [
    ["desktop", 1280],
    ["mobile", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      header.getByRole("heading", { name: "Cargos vigentes", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`cargos-${name}.png`), fullPage: true });
  }
});
