import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { inventoryItem } from "@/modules/inventory/schema";
import { appointment, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedPerson,
} from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// La Operación de la VP administrativa (ADR-150 reglas 2 y 3, ADR-191 regla 3): el miembro de pruebas
// es VP solo durante la prueba. Entra a la Operación derecho al inventario, sin Personas, crea un
// material, imprime sus etiquetas y habilita el permiso de reservar de una dirección logística.

test.use({ storageState: "tests/e2e/.auth/member.json" });

const marca = randomBytes(3).toString("hex");
let vpId = "";

test.beforeEach(async () => {
  const [member] = await getDb().select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!member || !current) throw new Error("Faltan el miembro y el semestre sintéticos");
  vpId = await seedAppointment(member.id, current.id, "VP_ADMIN");
});

test.afterEach(async () => {
  await getDb()
    .delete(appointment)
    .where(and(eq(appointment.id, vpId)));
  await closeDb();
});

test("la VP crea un material, ve sus etiquetas y no entra a Personas", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/inventario$/);
  await expect(page.getByRole("heading", { level: 1, name: t("T-4303") })).toBeVisible();
  await expect(page.locator('a[href="/admin/personas"]')).toHaveCount(0);

  await page
    .getByRole("link", { name: t("T-4333"), exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/nuevo=1/);
  const nombre = `Parlante sintético ${marca}`;
  await page.getByLabel(t("T-4334"), { exact: true }).fill(nombre);
  await page.getByLabel(t("T-4310"), { exact: true }).fill("2");
  await page.getByLabel(t("T-4311"), { exact: true }).fill("Bodega sintética");
  await page.getByLabel(t("T-4312"), { exact: true }).fill("Caja E2E");
  await page.getByRole("button", { name: t("T-4338"), exact: true }).click();
  await expect(page.getByText(t("T-4302"), { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: nombre })).toBeVisible();
  await expect(page.getByRole("link", { name: nombre })).toBeVisible();
  await sinViolaciones(page);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  const [item] = await getDb().select().from(inventoryItem).where(eq(inventoryItem.name, nombre));
  if (!item) throw new Error("No se guardó el material desde el formulario");
  await page.getByRole("link", { name: t("T-4404"), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/inventario/etiquetas\\?material=${item.id}`));
  await expect(page.getByRole("main").getByRole("img")).toHaveCount(2);
  const src = await page.getByRole("main").getByRole("img").first().getAttribute("src");
  if (!src) throw new Error("Falta la etiqueta");
  const etiqueta = await page.request.get(src);
  expect(etiqueta.status()).toBe(200);
  expect(etiqueta.headers()["content-type"]).toContain("image/svg+xml");
  await sinViolaciones(page);

  await page.goto("/admin/personas");
  await expect(page).not.toHaveURL(/\/admin\/personas$/);
});

test("la VP habilita y quita el permiso de reservar de una dirección logística", async ({
  page,
}) => {
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  const director = await seedPerson(`e2e-logistica-${marca}@eafit.edu.co`, {
    firstName: "Logística",
    lastName: `Sintética ${marca}`,
    source: "E2E",
  });
  await seedMembership(director, current.id);
  const comite = await seedCommittee(`e2e-inventario-${marca}`, `Comité del inventario ${marca}`);
  await seedCommitteeMembership(director, comite, current.id, "LOGISTICA");

  await page.goto("/admin/inventario/logistica");
  const permisos = page.getByRole("table", { name: t("T-4343") });
  const fila = permisos.getByRole("row").filter({ hasText: `Logística Sintética ${marca}` });
  await expect(fila.getByText(t("T-4360"), { exact: true })).toBeVisible();
  await fila.getByRole("button", { name: new RegExp(`^${t("T-4344")}`) }).click();
  await expect(page.getByText(t("T-4302"), { exact: true })).toBeVisible();
  await expect(fila.getByText(t("T-4359"), { exact: true })).toBeVisible();
  await sinViolaciones(page);
  await fila.getByRole("button", { name: new RegExp(`^${t("T-4345")}`) }).click();
  await expect(fila.getByText(t("T-4360"), { exact: true })).toBeVisible();
});
