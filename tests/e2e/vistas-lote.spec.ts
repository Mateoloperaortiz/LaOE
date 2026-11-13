import { expect } from "@playwright/test";
import { inArray, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { task } from "@/modules/crm/schema";
import { savedView } from "@/modules/system/schema";
import { t, tList } from "@/shared/copy";
import { seedTask } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// Vistas guardadas y acciones en lote con vista previa en la tabla del kit (ADR-170).

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const [vistasLabel, , nombreVista, compartirVista, guardarLabel] = tList("T-4930");
const [, , verVistaPrevia] = tList("T-4935");
const [confirmar] = tList("T-4940");

test.afterAll(async () => {
  const db = getDb();
  await db.delete(savedView).where(like(savedView.name, "e2e-Vistas%"));
  await db.delete(task).where(like(task.title, "e2e-Lote%"));
  await closeDb();
});

test("una vista se guarda con sus filtros, se comparte y queda marcada al abrirla", async ({
  page,
}) => {
  await page.goto("/admin/tareas?status=OPEN");
  const menu = page.locator(".admin-views");
  await menu.locator("summary").click();
  await menu.getByRole("textbox", { name: nombreVista, exact: true }).fill("e2e-Vistas abiertas");
  await menu.getByRole("checkbox", { name: compartirVista, exact: true }).check();
  await menu.getByRole("button", { name: guardarLabel, exact: true }).click();
  await expect(page).toHaveURL(/vista=guardada/);
  await expect(page.getByText(t("T-4931"), { exact: true })).toBeVisible();
  await expect(page.locator(".admin-views summary")).toContainText(vistasLabel ?? "");

  await page.goto("/admin/tareas");
  await page.locator(".admin-views summary").click();
  await page.getByRole("link", { name: /e2e-Vistas abiertas/ }).click();
  await expect(page).toHaveURL(/status=OPEN/);
  // La navegación conserva el menú abierto: se abre solo si quedó cerrado.
  const views = page.locator(".admin-views");
  if (!(await views.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await views.locator("summary").click();
  }
  await expect(page.getByRole("link", { name: /e2e-Vistas abiertas/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await sinViolaciones(page);
});

test("el lote muestra la vista previa y marca como hechas las tareas elegidas", async ({
  page,
}) => {
  const ids = [await seedTask("e2e-Lote A"), await seedTask("e2e-Lote B")];
  await page.goto("/admin/tareas?q=e2e-Lote&status=OPEN");
  for (const title of ["e2e-Lote A", "e2e-Lote B"]) {
    await page.getByRole("checkbox", { name: t("T-4936", { fila: title }), exact: true }).check();
  }
  const barra = page.locator(".superficie-flotante");
  await expect(barra).toContainText("2");
  await barra.getByRole("button", { name: verVistaPrevia, exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toContainText(t("T-4939", { n: 2, total: 2 }));
  await panel.getByRole("button", { name: confirmar, exact: true }).click();
  await expect(
    page.getByText(t("T-4941", { hechas: 2, fallidas: 0 }), { exact: true }),
  ).toBeVisible();
  const rows = await getDb()
    .select({ status: task.status })
    .from(task)
    .where(inArray(task.id, ids));
  expect(rows.map((row) => row.status)).toEqual(["DONE", "DONE"]);
});
