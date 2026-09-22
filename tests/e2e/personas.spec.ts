import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { copyPattern } from "../helpers/copy";
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
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel(tList("T-427")[0], { exact: true }).fill("Prospecto");
  await panel.getByLabel(tList("T-427")[1]).fill(`E2E ${stamp}`);
  await panel.getByLabel(tList("T-427")[2]).fill(email);
  await panel.getByLabel(tList("T-427")[7], { exact: true }).selectOption("STUDENT");
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();

  await page.goto(`/admin/personas?q=${encodeURIComponent(email)}`);
  await page.getByRole("link", { name: `Prospecto E2E ${stamp}` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Prospecto E2E ${stamp}`);
  await expect(page.getByText(tList("T-429")[0], { exact: true }).first()).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: tList("T-433")[0] }).click();
  const editar = page.getByRole("dialog");
  await editar.getByLabel(tList("T-427")[4]).fill("300 123 4567");
  await editar.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByText("+573001234567").first()).toBeVisible();

  // Sin membresía, la cabecera ofrece "Dar de alta" y el bloque de comités dice que falta la membresía.
  const cabecera = page.locator("header").filter({
    has: page.getByRole("heading", { name: `Prospecto E2E ${stamp}`, level: 1 }),
  });
  await expect(cabecera.getByText(t("T-1053"))).toBeVisible();
  await cabecera.getByRole("link", { name: t("T-983") }).click();
  const alta = page.getByRole("dialog");
  await expect(
    alta.getByText(copyPattern("T-984", { nombre: `Prospecto E2E ${stamp}` })),
  ).toBeVisible();
  await alta.getByRole("checkbox", { name: "A3", exact: true }).check();
  await alta.getByRole("button", { name: t("T-983") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(cabecera.getByText(tList("T-429")[2], { exact: true })).toBeVisible();
  await expect(cabecera.getByText(tList("T-381")[0], { exact: true })).toBeVisible();
  await expect(cabecera.getByText("A3 · Miembro")).toBeVisible();
  await expect(cabecera.getByRole("link", { name: t("T-983") })).toHaveCount(0);
  await expect(cabecera.getByRole("link", { name: tList("T-433")[0] })).toBeVisible();
  await sinViolaciones(page);
});

test("la Persona 360 marca y retira el periodo de prueba del semestre con motivo", async ({
  page,
}) => {
  await page.goto("/admin/personas?q=prueba.e2e");
  await page.getByRole("link", { name: "Prueba E2E" }).click();
  await page.waitForURL(/\/admin\/personas\/[^/?]+$/);
  const personUrl = page.url();
  await page
    .getByRole("link", { name: tList("T-432")[2], exact: true })
    .last()
    .click();
  await expect(page.getByRole("heading", { name: tList("T-443")[3] })).toBeVisible();

  await page.getByRole("link", { name: t("T-2142") }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByLabel(tList("T-262")[1])).toHaveValue(/.+/);
  await panel.getByLabel(tList("T-262")[1]).selectOption({ label: E2E_TERM.code });
  await expect(panel.getByLabel(tList("T-449")[0])).not.toBeChecked();
  await panel.getByLabel(tList("T-449")[0]).check();
  await panel.getByLabel(t("T-434")).fill("Prueba e2e: condición marcada a mano");
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(
    page.getByText(`${E2E_TERM.code} · Prueba e2e: condición marcada a mano`),
  ).toBeVisible();
  await sinViolaciones(page);

  // El evento alimenta la línea de tiempo (crm) y el recálculo de permanencia.
  await drenarOutbox();
  await page.goto(`${personUrl}?pestana=linea`);
  await expect(
    page.getByText(
      fillCopy(tList("T-832")[7], {
        término: E2E_TERM.code,
        motivo: "Prueba e2e: condición marcada a mano",
      }),
    ),
  ).toBeVisible();

  await page.goto(`${personUrl}?pestana=membresia&accion=condicion`);
  const retirar = page.getByRole("dialog");
  await expect(retirar.getByLabel(tList("T-449")[0])).toBeChecked();
  await retirar.getByLabel(tList("T-449")[0]).uncheck();
  await retirar.getByLabel(t("T-434")).fill("Prueba e2e: condición retirada");
  await retirar.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByText("Prueba e2e: condición marcada a mano")).toHaveCount(0);
  await expect(page.getByRole("link", { name: t("T-2142") })).toBeVisible();
});

test("la Persona 360 cambia el estado, deja una nota y crea una tarea", async ({ page }) => {
  await page.goto("/admin/personas?q=prueba.e2e");
  await page.getByRole("link", { name: "Prueba E2E" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Prueba E2E");

  await page
    .locator("main summary")
    .filter({ hasText: t("T-1500") })
    .click();
  await page.getByRole("link", { name: tList("T-433")[1] }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel(t("T-435")).selectOption("HONORARY");
  await panel.getByLabel(t("T-434")).fill("Prueba e2e: honorario por un momento");
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByText(`${tList("T-381")[0]} → ${tList("T-381")[2]}`).last()).toBeVisible();
  await sinViolaciones(page);

  await page
    .locator("main summary")
    .filter({ hasText: t("T-1500") })
    .click();
  await page.getByRole("link", { name: tList("T-433")[1] }).click();
  const back = page.getByRole("dialog");
  await back.getByLabel(t("T-435")).selectOption("ACTIVE");
  await back.getByLabel(t("T-434")).fill("Prueba e2e: vuelve a activo");
  await back.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(`${tList("T-381")[2]} → ${tList("T-381")[0]}`).last()).toBeVisible();

  const stamp = Date.now().toString(36);
  await page.getByRole("link", { name: tList("T-433")[5] }).click();
  const nota = page.getByRole("dialog");
  await nota.getByLabel(tList("T-433")[5]).fill(`Nota e2e ${stamp} con **énfasis**`);
  await nota.getByRole("button", { name: tList("T-456")[0] }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByText(`Nota e2e ${stamp} con`)).toBeVisible();
  await expect(page.getByRole("link", { name: tList("T-454")[1] })).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: tList("T-433")[6] }).click();
  const tarea = page.getByRole("dialog");
  await tarea.getByLabel(tList("T-459")[0]).fill(`Tarea e2e ${stamp}`);
  await tarea.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByRole("cell", { name: `Tarea e2e ${stamp}` })).toBeVisible();
  await page
    .getByRole("row", { name: new RegExp(`Tarea e2e ${stamp}`) })
    .getByRole("button", { name: t("T-462") })
    .click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
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
    const panel = page.getByRole("dialog", { name: tList("T-447")[0] });
    await panel.getByLabel(t("T-2398"), { exact: true }).selectOption(kind);
    await panel.getByLabel(tList("T-262")[1], { exact: true }).selectOption({ label: semester });
    if (title) await panel.locator('input[name="title"]').fill(title);
    await panel.getByRole("button", { name: tList("T-447")[0], exact: true }).click();
    await expect(page.getByText(t("T-259"))).toBeVisible();
  }
  const header = page.locator("header").filter({ has: page.getByRole("heading", { level: 1 }) });
  await expect(header.getByRole("heading", { name: t("T-374"), exact: true })).toBeVisible();
  await expect(header.getByText(t("T-2394"), { exact: true })).toBeVisible();
  await expect(header.getByText(tList("T-444")[6], { exact: true })).toBeVisible();
  await expect(header).not.toContainText("Evento Histórico");
  const history = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: tList("T-443")[2], exact: true }) });
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
    await expect(header.getByRole("heading", { name: t("T-374"), exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`cargos-${name}.png`), fullPage: true });
  }
});
