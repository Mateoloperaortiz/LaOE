import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { page as contentPage } from "@/modules/content/schema";
import { t, tList } from "@/shared/copy";
import { seedCommittee } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL } from "./global-setup";
import { pasarStepUp } from "./stepup";

const CODE = process.env.OTP_FIXED_CODE ?? "123456";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

// "Listo cuando" de la fase 2: un miembro importado entra por OTP y ve su ficha.
test("el asistente importa un roster con step-up y el nuevo miembro entra por OTP", async ({
  page,
}) => {
  // Sube, revisa, aplica con step-up y entra en otro navegador: más de lo que cabe en 30 segundos en dev.
  test.setTimeout(120_000);
  await page.goto("/admin/personas/importar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(tList("T-509")[1]);
  await sinViolaciones(page);
  await page.getByLabel(t("T-476")).setInputFiles({
    name: "roster-e2e.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      readFileSync("tests/fixtures/roster-e2e.csv", "utf8").replaceAll(
        ";2026-2;",
        `;${E2E_TERM.code};`,
      ),
    ),
  });
  await page.getByRole("button", { name: tList("T-479")[0] }).click();
  await expect(page).toHaveURL(/\/admin\/personas\/importar\?job=/);
  await expect(
    page.getByRole("heading", { level: 2, name: tList("T-1487")[1], exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: tList("T-479")[2] })).toHaveCount(0);
  await page.getByRole("button", { name: t("T-1475") }).click();
  await expect(page).toHaveURL(/paso=revision/);
  await expect(page.getByText(t("T-166", { n: 3, m: 0, k: 0 }))).toBeVisible();
  await expect(page.getByRole("cell", { name: "e2e-roster-rosa@eafit.edu.co" })).toBeVisible();
  await sinViolaciones(page);

  await expect(page.getByRole("button", { name: tList("T-479")[2] })).toHaveCount(0);
  await page.getByRole("link", { name: t("T-1476") }).click();
  await expect(page).toHaveURL(/paso=confirmacion/);
  await expect(
    page.getByRole("heading", { level: 2, name: tList("T-1487")[3], exact: true }),
  ).toBeVisible();

  // Aplicar exige un código nuevo: se envejece el OTP del ingreso y se limpia el límite por correo.
  await getDb().execute(
    sql`update session set otp_verified_at = now() - interval '20 minutes' where person_id = (select id from person where email = ${E2E_EMAIL})`,
  );
  await getDb().execute(sql`delete from otp_challenge where email = ${E2E_EMAIL}`);
  await closeDb();
  await page.getByRole("button", { name: tList("T-479")[2] }).click();
  await expect(page).toHaveURL(/\/ingresar\/paso/);
  await pasarStepUp(page);
  await expect(page).toHaveURL(/\/admin\/personas\/importar\?job=/);
  await page.getByRole("button", { name: tList("T-479")[2] }).click();
  await expect(page.getByText(t("T-487", { n: 3, m: 0 }))).toBeVisible();

  await page.goto("/admin/personas?q=e2e-roster-rosa");
  await page.getByRole("link", { name: "Rosa Roster" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rosa Roster");
  await expect(page.getByText("PIXEL · Logística")).toBeVisible();
  await expect(page.getByText("+573001234567").first()).toBeVisible();
  await page.getByRole("link", { name: tList("T-432")[9], exact: true }).click();
  await expect(page.getByText("000123456", { exact: true })).toBeVisible();
  await expect(page.getByText("000654321", { exact: true })).toBeVisible();
  await expect(page.getByText("29 de febrero de 2004", { exact: true })).toBeVisible();

  // La persona importada entra por OTP y ve su ficha. Se limpian las cookies de esta pestaña (no se
  // cierra la sesión del admin: la comparten las demás pruebas de la suite).
  await page.context().clearCookies();
  // ADR-048: la importación no crea autorizaciones, así que Rosa da la suya al entrar. Para eso la
  // política tiene que estar publicada; se restaura al terminar (el sitemap la espera en borrador).
  const [politicaPrevia] = await getDb()
    .select()
    .from(contentPage)
    .where(eq(contentPage.slug, "privacidad"));
  await getDb()
    .update(contentPage)
    .set({
      body: "Política sintética de la suite.",
      status: "PUBLISHED",
      audience: "PUBLIC",
    })
    .where(eq(contentPage.slug, "privacidad"));
  try {
    await page.goto("/ingresar/codigo");
    await page.getByLabel(t("T-042")).fill("e2e-roster-rosa@eafit.edu.co");
    await page.getByRole("button", { name: t("T-043") }).click();
    await page.getByLabel(t("T-238")).fill(CODE);
    await page.getByRole("button", { name: t("T-046") }).click();
    await expect(page).toHaveURL(/\/autorizacion$/);
    await page.getByRole("button", { name: t("T-2087"), exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      t("T-060", { "nombre preferido": "Rosa" }),
    );
    await page.goto("/app/ajustes#mis-datos");
    await expect(page.getByText("000123456", { exact: true })).toBeVisible();
    await expect(page.getByText("000654321", { exact: true })).toBeVisible();
    await expect(page.getByText("29 de febrero de 2004", { exact: true })).toBeVisible();
  } finally {
    if (politicaPrevia) {
      await getDb()
        .update(contentPage)
        .set(politicaPrevia)
        .where(eq(contentPage.slug, "privacidad"));
    }
    await closeDb();
  }
});

test("la reautenticación conserva una propuesta de líder desmarcada", async ({ page }) => {
  test.setTimeout(90_000);
  const email = "e2e-roster-sin-lider@eafit.edu.co";
  const committeeName = "E2E Roster UI";
  await seedCommittee("e2e-roster-ui", committeeName, { publicationStatus: "DRAFT" });
  const csv = `NOMBRE;APELLIDO;CORREO;COMITES;ENTRADA A LA OE;ESTADO;CARGO\nPrueba;Sin liderazgo;${email};${committeeName};${E2E_TERM.code};Activo;General de ${committeeName}\n`;
  await page.goto("/admin/personas/importar");
  await page.getByLabel(t("T-476")).setInputFiles({
    name: "roster-e2e-sin-lider.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: tList("T-479")[0] }).click();
  await page.getByRole("button", { name: t("T-1475") }).click();
  await page.getByRole("link", { name: t("T-1476") }).click();
  const proposal = page.getByRole("checkbox");
  await expect(proposal).toHaveCount(1);
  await proposal.uncheck();
  await getDb().execute(
    sql`update session set otp_verified_at = now() - interval '20 minutes' where person_id = (select id from person where email = ${E2E_EMAIL})`,
  );
  await getDb().execute(sql`delete from otp_challenge where email = ${E2E_EMAIL}`);
  await closeDb();
  await page.getByRole("button", { name: tList("T-479")[2] }).click();
  await expect(page).toHaveURL(/\/ingresar\/paso/);
  expect(decodeURIComponent(page.url())).not.toContain(email);
  await pasarStepUp(page);
  await expect(page).toHaveURL(/paso=confirmacion/);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("button", { name: tList("T-479")[2] }).click();
  await expect(page.getByText(t("T-487", { n: 1, m: 0 }))).toBeVisible();
  const result = await getDb().execute(
    sql`select count(*)::int as count from permission where person_id = (select id from person where email = ${email}) and code = 'COMMITTEE_LEADER'`,
  );
  expect(result.rows[0]?.count).toBe(0);
  await closeDb();
});
