import path from "node:path";
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { sinViolaciones } from "./axe";
import { E2E_EMAIL } from "./global-setup";

const CODE = process.env.OTP_FIXED_CODE ?? "123456";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

// "Listo cuando" de la fase 2: un miembro importado entra por OTP y ve su ficha.
test("el asistente importa un roster con step-up y el nuevo miembro entra por OTP", async ({
  page,
}) => {
  // Sube, revisa, aplica con step-up y entra en otro navegador: más de lo que cabe en 30 segundos en dev.
  test.setTimeout(120_000);
  await page.goto("/admin/personas/importar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Importar roster");
  await sinViolaciones(page);
  await page
    .getByLabel("Archivo del roster (CSV o Excel)")
    .setInputFiles(path.join(process.cwd(), "tests/fixtures/roster-e2e.csv"));
  await page.getByRole("button", { name: "Subir y revisar" }).click();
  await expect(page).toHaveURL(/\/admin\/personas\/importar\?job=/);
  await expect(page.getByText("3 personas nuevas, 0 con cambios, 0 sin cambios")).toBeVisible();
  await expect(page.getByRole("cell", { name: "e2e-roster-rosa@eafit.edu.co" })).toBeVisible();
  await sinViolaciones(page);

  // Aplicar exige un código nuevo: se envejece el OTP del ingreso y se limpia el límite por correo.
  await getDb().execute(
    sql`update session set otp_verified_at = now() - interval '20 minutes' where person_id = (select id from person where email = ${E2E_EMAIL})`,
  );
  await getDb().execute(sql`delete from otp_challenge where email = ${E2E_EMAIL}`);
  await closeDb();
  await page.getByRole("button", { name: "Aplicar la importación" }).click();
  await expect(page).toHaveURL(/\/ingresar\/paso/);
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/personas\/importar\?job=/);
  await page.getByRole("button", { name: "Aplicar la importación" }).click();
  await expect(page.getByText("Listo: 3 personas nuevas y 0 actualizadas.")).toBeVisible();

  await page.goto("/admin/personas?q=e2e-roster-rosa");
  await page.getByRole("link", { name: "Rosa Roster" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rosa Roster");
  await expect(page.getByText("PIXEL · Logística")).toBeVisible();
  await expect(page.getByText("+573001234567").first()).toBeVisible();

  // La persona importada entra por OTP y ve su ficha. Se limpian las cookies de esta pestaña (no se
  // cierra la sesión del admin: la comparten las demás pruebas de la suite).
  await page.context().clearCookies();
  await page.goto("/ingresar");
  await page.getByLabel("Correo @eafit.edu.co").fill("e2e-roster-rosa@eafit.edu.co");
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Rosa");
});
