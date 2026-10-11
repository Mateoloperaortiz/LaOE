import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { page as contentPage } from "@/modules/content/schema";
import { session } from "@/modules/identity/schema";
import { person } from "@/modules/people/schema";
import { appConfig } from "@/modules/system/schema";
import { t, tList } from "@/shared/copy";
import { seedConfig, seedPage } from "../factories";
import { test } from "./fixtures";
import { E2E_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const PATH = "/admin/sistema/politica";
let originalPage: typeof contentPage.$inferSelect | undefined;
let originalConfig: typeof appConfig.$inferSelect | undefined;
let originalSessions: Array<{ id: string; otpVerifiedAt: Date }> = [];
let policyId: string;

async function currentVersion() {
  const [row] = await getDb()
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, "privacy.policyVersion"));
  return row?.value;
}

test.beforeEach(async () => {
  [originalPage] = await getDb()
    .select()
    .from(contentPage)
    .where(eq(contentPage.slug, "privacidad"));
  [originalConfig] = await getDb()
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, "privacy.policyVersion"));
  const [admin] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_EMAIL));
  if (!admin) throw new Error("ADMIN sintético ausente");
  originalSessions = await getDb()
    .select({ id: session.id, otpVerifiedAt: session.otpVerifiedAt })
    .from(session)
    .where(eq(session.personId, admin.id));
  // Cada caso arranca dentro de la ventana; uno la vence después de abrir el formulario.
  await getDb()
    .update(session)
    .set({ otpVerifiedAt: new Date() })
    .where(eq(session.personId, admin.id));
  await seedConfig("privacy.policyVersion", "pendiente");
  policyId = await seedPage("privacidad", "Privacidad de prueba", {
    body: "",
    status: "DRAFT",
    audience: "PUBLIC",
  });
});

test.afterEach(async () => {
  await drenarOutbox();
  if (originalPage) {
    await getDb().update(contentPage).set(originalPage).where(eq(contentPage.id, policyId));
  } else {
    await getDb().delete(contentPage).where(eq(contentPage.id, policyId));
  }
  if (originalConfig) {
    await getDb()
      .update(appConfig)
      .set(originalConfig)
      .where(eq(appConfig.key, "privacy.policyVersion"));
  } else {
    await getDb().delete(appConfig).where(eq(appConfig.key, "privacy.policyVersion"));
  }
  for (const original of originalSessions) {
    await getDb()
      .update(session)
      .set({ otpVerifiedAt: original.otpVerifiedAt })
      .where(eq(session.id, original.id));
  }
});
test.afterEach(async () => {
  await drenarOutbox();
  await closeDb();
});

test("publica primero, habilita desde el control y vuelve a bloquear de inmediato", async ({
  page,
}) => {
  await page.goto("/admin");
  await page
    .getByRole("navigation", { name: t("T-236") })
    .getByRole("button", { name: tList("T-1400")[6] })
    .click();
  await page
    .getByRole("navigation", { name: t("T-236") })
    .getByRole("link", { name: t("T-1180"), exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-1180"));
  await expect(page.getByLabel(t("T-1182"))).toHaveValue("pendiente");
  await page.getByLabel(t("T-1182")).fill("e2e-politica-ui-v1");
  await page.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(page.getByText(t("T-1187"), { exact: true })).toBeVisible();
  expect(await currentVersion()).toBe("pendiente");

  await page.getByRole("link", { name: t("T-1185") }).click();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "privacidad", exact: true }) });
  await row.getByRole("link", { name: t("T-252"), exact: true }).click();
  const panel = page.getByRole("dialog");
  const text = "Texto sintético para E2E; no representa una política de datos real.";
  await panel.getByLabel(t("T-336")).fill(text);
  await panel.getByLabel(t("T-279")).selectOption("PUBLISHED");
  await panel.getByLabel(t("T-338")).selectOption("PUBLIC");
  await panel.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
  expect(await currentVersion()).toBe("pendiente");
  await page.goto("/privacidad");
  await expect(page.getByText(text, { exact: true })).toBeVisible();

  await page.goto(PATH);
  await page.getByLabel(t("T-1182")).fill("e2e-politica-ui-v1");
  await page.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(
    page.getByText(t("T-1184", { version: "e2e-politica-ui-v1" }), { exact: true }),
  ).toBeVisible();
  expect(await currentVersion()).toBe("e2e-politica-ui-v1");
  await page.goto("/admin/personas/importar");
  await expect(page.getByText(t("T-1179"), { exact: false })).toHaveCount(0);

  await page.goto(PATH);
  await page.getByLabel(t("T-1182")).fill("pendiente");
  await page.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(
    page.getByText(t("T-1184", { version: "pendiente" }), { exact: true }),
  ).toBeVisible();
  expect(await currentVersion()).toBe("pendiente");
  await page.goto("/admin/personas/importar");
  await expect(page.getByText(t("T-1179"), { exact: false })).toBeVisible();
});

test("un formulario abierto no guarda cuando vence el step-up", async ({ page }) => {
  await page.goto(PATH);
  for (const original of originalSessions) {
    await getDb()
      .update(session)
      .set({ otpVerifiedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(session.id, original.id));
  }
  await page.getByLabel(t("T-1182")).fill("e2e-no-se-guarda");
  await page.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(page).toHaveURL(/\/ingresar\/paso\?next=/);
  expect(await currentVersion()).toBe("pendiente");
});

test("un miembro sin ADMIN no abre el control", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
  try {
    const page = await context.newPage();
    await page.goto(PATH);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1, name: t("T-1180") })).toHaveCount(0);
    expect(await currentVersion()).toBe("pendiente");
  } finally {
    await context.close();
  }
});
