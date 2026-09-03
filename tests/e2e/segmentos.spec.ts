import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { sinViolaciones } from "./axe";
import { E2E_EMAIL } from "./global-setup";

const CODE = process.env.OTP_FIXED_CODE ?? "123456";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("un segmento se crea con filtros, cuenta personas y su export exige step-up", async ({
  page,
}) => {
  const stamp = Date.now().toString(36);
  await page.goto("/admin/segmentos");
  await page.getByRole("link", { name: "Nuevo" }).click();
  const panel = page.getByRole("complementary");
  await panel.getByLabel("Nombre", { exact: true }).fill(`e2e-${stamp}`);
  await panel.getByLabel("Estado de membresía").selectOption(["ACTIVE"]);
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(`e2e-${stamp}`) });
  await expect(row).toBeVisible();
  await sinViolaciones(page);
  const href = await row.getByRole("link", { name: "Exportar personas" }).getAttribute("href");
  expect(href).toMatch(/^\/api\/export\/personas\?segmento=/);

  // El OTP del ingreso cuenta como step-up 15 minutos: se envejece para forzar el código nuevo.
  await getDb().execute(
    sql`update session set otp_verified_at = now() - interval '20 minutes' where person_id = (select id from person where email = ${E2E_EMAIL})`,
  );
  // Los límites de OTP por correo (5 cada 15 minutos) no deben depender de las pruebas anteriores.
  await getDb().execute(sql`delete from otp_challenge where email = ${E2E_EMAIL}`);
  await closeDb();
  const blocked = await page.request.get(href ?? "", { maxRedirects: 0 });
  expect(blocked.status()).toBe(302);
  expect(blocked.headers().location).toContain("/ingresar/paso");

  await page.goto(`/ingresar/paso?next=${encodeURIComponent(href ?? "/admin/segmentos")}`);
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin/);
  const csv = await page.request.get(href ?? "");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain(E2E_EMAIL);
});
