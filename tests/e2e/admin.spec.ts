import { expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { t, tList } from "@/shared/copy";
import { test } from "./fixtures";
import { E2E_EMAIL } from "./global-setup";
import { pasarStepUp } from "./stepup";

// Sesión de ADMIN guardada por auth.setup.ts: una sola entrada para toda la suite del admin.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

// Sin conexión (ADR-118 regla 20): el formulario del kit sigue ahí con lo escrito y con lo elegido en sus
// listas, que React reinicia cuando la acción termina. Sin red no guarda nada; el reintento manda lo que
// se ve, y el comité queda con sus dos listas (DT-258).
test("el formulario del kit sin conexión conserva lo escrito y lo elegido en sus listas", async ({
  page,
}) => {
  await page.goto("/admin/comites");
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel(t("T-272")).fill("e2e-sin-red");
  await panel.getByLabel(t("T-273")).fill("Comité sin red");
  await panel.getByLabel(t("T-274")).selectOption("ACTIVE");
  await panel.getByLabel(t("T-279")).selectOption("DRAFT");
  await page.context().setOffline(true);
  try {
    await panel.getByRole("button", { name: t("T-253") }).click();
    await expect(panel.getByRole("alert").filter({ hasText: t("T-3252") })).toBeVisible();
    await expect(panel.getByLabel(t("T-272"))).toHaveValue("e2e-sin-red");
    await expect(panel.getByLabel(t("T-273"))).toHaveValue("Comité sin red");
    await expect(panel.getByLabel(t("T-274"))).toHaveValue("ACTIVE");
    await expect(panel.getByLabel(t("T-279"))).toHaveValue("DRAFT");
  } finally {
    await page.context().setOffline(false);
  }
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await page.goto("/admin/comites?q=e2e-sin-red");
  await page
    .getByRole("link", { name: t("T-252") })
    .first()
    .click();
  const saved = page.getByRole("dialog");
  await expect(saved.getByLabel(t("T-272"))).toHaveValue("e2e-sin-red");
  await expect(saved.getByLabel(t("T-274"))).toHaveValue("ACTIVE");
  await expect(saved.getByLabel(t("T-279"))).toHaveValue("DRAFT");
});

// El multiselect del kit y una lista, con los dos rechazos (ADR-118 regla 20, DT-258): primero la acción
// responde un error de validación y después no responde. Lo marcado y lo elegido siguen a la vista las
// dos veces, y el reintento los guarda.
test("el formulario del kit conserva sus casillas y su lista cuando la acción rechaza o no responde, y el reintento las guarda", async ({
  page,
}) => {
  const fields = tList("T-468");
  const statusLabels = tList("T-381");
  await page.goto("/admin/segmentos");
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  const statuses = panel.getByRole("group", { name: fields[2] });
  const active = statuses.getByRole("checkbox", { name: statusLabels[0], exact: true });
  const onLeave = statuses.getByRole("checkbox", { name: statusLabels[1], exact: true });
  const honorary = statuses.getByRole("checkbox", { name: statusLabels[2], exact: true });
  const entry = panel.getByLabel(fields[3] ?? "", { exact: true });
  const expectChosen = async () => {
    await expect(active).toBeChecked();
    await expect(onLeave).not.toBeChecked();
    await expect(honorary).toBeChecked();
    await expect(statuses.getByText(t("T-1429", { n: 2 }))).toBeVisible();
    await expect(entry).toHaveValue("VETERAN");
  };
  await active.check();
  await honorary.check();
  await entry.selectOption("VETERAN");

  // Sin nombre, la acción responde con el error del campo.
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(panel.getByRole("alert").filter({ hasText: t("T-260") })).toBeVisible();
  await expectChosen();

  await panel.getByLabel(fields[0] ?? "", { exact: true }).fill("e2e-listas");
  await page.context().setOffline(true);
  try {
    await panel.getByRole("button", { name: t("T-253") }).click();
    await expect(panel.getByRole("alert").filter({ hasText: t("T-3252") })).toBeVisible();
    await expectChosen();
  } finally {
    await page.context().setOffline(false);
  }

  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await page
    .getByRole("row", { name: /e2e-listas/ })
    .getByRole("link", { name: t("T-252") })
    .click();
  const saved = page.getByRole("dialog");
  await expect(saved.getByLabel(fields[0] ?? "", { exact: true })).toHaveValue("e2e-listas");
  const savedStatuses = saved.getByRole("group", { name: fields[2] });
  await expect(
    savedStatuses.getByRole("checkbox", { name: statusLabels[0], exact: true }),
  ).toBeChecked();
  await expect(
    savedStatuses.getByRole("checkbox", { name: statusLabels[1], exact: true }),
  ).not.toBeChecked();
  await expect(
    savedStatuses.getByRole("checkbox", { name: statusLabels[2], exact: true }),
  ).toBeChecked();
  await expect(saved.getByLabel(fields[3] ?? "", { exact: true })).toHaveValue("VETERAN");
});

// Los otros dos campos del kit que no son texto ni lista (DT-258): una casilla suelta, que React también
// desmarca al reiniciar el formulario, y un número. Mismos dos rechazos y el mismo reintento.
test("el formulario del kit conserva una casilla suelta y un número cuando la acción rechaza o no responde, y el reintento los guarda", async ({
  page,
}) => {
  const fields = tList("T-473");
  await page.goto("/admin/cargos");
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  const leadership = panel.getByRole("checkbox", { name: fields[2], exact: true });
  const mandatory = panel.getByRole("checkbox", { name: fields[3], exact: true });
  const order = panel.getByLabel(fields[5] ?? "", { exact: true });
  const expectChosen = async () => {
    await expect(leadership).toBeChecked();
    await expect(mandatory).not.toBeChecked();
    await expect(order).toHaveValue("42");
  };
  await leadership.check();
  await order.fill("42");

  // Sin código ni nombre, la acción responde con el error de los campos.
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(panel.getByRole("alert").filter({ hasText: t("T-260") })).toBeVisible();
  await expectChosen();

  await panel.getByLabel(fields[0] ?? "", { exact: true }).fill("E2E_CASILLA");
  await panel.getByLabel(fields[1] ?? "", { exact: true }).fill("e2e casilla suelta");
  await page.context().setOffline(true);
  try {
    await panel.getByRole("button", { name: t("T-253") }).click();
    await expect(panel.getByRole("alert").filter({ hasText: t("T-3252") })).toBeVisible();
    await expectChosen();
  } finally {
    await page.context().setOffline(false);
  }

  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await page.goto("/admin/cargos?q=E2E_CASILLA");
  await page
    .getByRole("link", { name: t("T-252") })
    .first()
    .click();
  const saved = page.getByRole("dialog");
  await expect(saved.getByLabel(fields[0] ?? "", { exact: true })).toHaveValue("E2E_CASILLA");
  await expect(saved.getByRole("checkbox", { name: fields[2], exact: true })).toBeChecked();
  await expect(saved.getByRole("checkbox", { name: fields[3], exact: true })).not.toBeChecked();
  await expect(saved.getByLabel(fields[5] ?? "", { exact: true })).toHaveValue("42");
});

test("un ADMIN crea y edita un comité desde el panel y lo exporta", async ({ page }) => {
  await page.goto("/admin/comites");
  const slug = `e2e-${Date.now().toString(36)}`;
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  await expect(
    panel.getByRole("heading", { name: new RegExp(`${t("T-251")} · ${tList("T-261")[1]}`) }),
  ).toBeVisible();
  await panel.getByLabel(t("T-272")).fill(slug);
  await panel.getByLabel(t("T-273")).fill(`Comité ${slug}`);
  await panel.getByLabel(t("T-274")).selectOption("ACTIVE");
  await panel.getByLabel(t("T-279")).selectOption("DRAFT");
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByRole("cell", { name: `Comité ${slug}`, exact: true })).toBeVisible();

  await page.goto(`/admin/comites?q=${slug}`);
  await page
    .getByRole("link", { name: t("T-252") })
    .first()
    .click();
  const editPanel = page.getByRole("dialog");
  await expect(editPanel.getByLabel(t("T-272"))).toHaveValue(slug);
  await editPanel.getByLabel(t("T-273")).fill(`Comité ${slug} editado`);
  await editPanel.getByRole("button", { name: t("T-253") }).click();
  await expect(
    page.getByRole("cell", { name: `Comité ${slug} editado`, exact: true }),
  ).toBeVisible();

  const csv = await page.request.get(`/api/export/comites?q=${slug}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(`${slug},Comité ${slug} editado`);
});

test("la paleta busca comités y personas", async ({ page }) => {
  await page.goto("/admin");
  const input = page.getByRole("searchbox", { name: t("T-264") });
  // El botón (y el atajo ⌘K) solo responden después de hidratar: se reintenta hasta que abra.
  await expect(async () => {
    await page.getByRole("button", { name: t("T-299") }).click();
    await expect(input).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await input.fill("prueba");
  await expect(page.getByRole("link", { name: /Prueba E2E/ })).toBeVisible();
});

test("otorgar un permiso exige step-up y queda en la lista", async ({ page }) => {
  // El OTP del ingreso cuenta como step-up 15 minutos: se envejece para forzar el código nuevo.
  await getDb().execute(
    sql`update session set otp_verified_at = now() - interval '20 minutes' where person_id = (select id from person where email = ${E2E_EMAIL})`,
  );
  await closeDb();

  await page.goto("/admin/permisos");
  await page.getByRole("link", { name: t("T-251") }).click();
  await expect(page).toHaveURL(/\/ingresar\/paso/);
  await pasarStepUp(page);
  await expect(page).toHaveURL(/\/admin\/permisos/);

  const again = page.getByRole("dialog");
  await again.getByLabel(t("T-269")).fill(E2E_EMAIL);
  await again.getByLabel(t("T-270"), { exact: true }).selectOption("BOARD");
  await again.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByRole("cell", { name: tList("T-289")[2] })).toBeVisible();

  const csv = await page.request.get("/api/export/permisos");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(E2E_EMAIL);
});
