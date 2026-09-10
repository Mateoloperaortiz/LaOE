import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { E2E_EMAIL } from "./global-setup";
import { pasarStepUp } from "./stepup";

// Sesión de ADMIN guardada por auth.setup.ts: una sola entrada para toda la suite del admin.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("un ADMIN crea y edita un comité desde el panel y lo exporta", async ({ page }) => {
  await page.goto("/admin/comites");
  const slug = `e2e-${Date.now().toString(36)}`;
  await page.getByRole("link", { name: "Nuevo" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: /Nuevo · Comité/ })).toBeVisible();
  await panel.getByLabel("Sigla").fill(slug);
  await panel.getByLabel("Nombre").fill(`Comité ${slug}`);
  await panel.getByLabel("Estado").selectOption("ACTIVE");
  await panel.getByLabel("Publicación").selectOption("DRAFT");
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByRole("cell", { name: `Comité ${slug}`, exact: true })).toBeVisible();

  await page.goto(`/admin/comites?q=${slug}`);
  await page.getByRole("link", { name: "Editar" }).first().click();
  const editPanel = page.getByRole("dialog");
  await expect(editPanel.getByLabel("Sigla")).toHaveValue(slug);
  await editPanel.getByLabel("Nombre").fill(`Comité ${slug} editado`);
  await editPanel.getByRole("button", { name: "Guardar" }).click();
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
  const input = page.getByRole("searchbox", { name: "Buscá personas o comités" });
  // El botón (y el atajo ⌘K) solo responden después de hidratar: se reintenta hasta que abra.
  await expect(async () => {
    await page.getByRole("button", { name: "Buscar (⌘K)" }).click();
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
  await page.getByRole("link", { name: "Nuevo" }).click();
  await expect(page).toHaveURL(/\/ingresar\/paso/);
  await pasarStepUp(page);
  await expect(page).toHaveURL(/\/admin\/permisos/);

  const again = page.getByRole("dialog");
  await again.getByLabel("Correo de la persona").fill(E2E_EMAIL);
  await again.getByLabel("Permiso", { exact: true }).selectOption("BOARD");
  await again.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Junta" })).toBeVisible();

  const csv = await page.request.get("/api/export/permisos");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(E2E_EMAIL);
});
