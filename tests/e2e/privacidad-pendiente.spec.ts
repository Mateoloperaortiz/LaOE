import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { form, formSubmission } from "@/modules/forms/schema";
import { person } from "@/modules/people/schema";
import { appConfig } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

test.use({ storageState: "tests/e2e/.auth/member.json" });

let originalVersion: unknown;
let formId: string;
const slug = "e2e-politica-pendiente";

async function policy(value: unknown) {
  await getDb().update(appConfig).set({ value }).where(eq(appConfig.key, "privacy.policyVersion"));
}

test.beforeEach(async () => {
  const [config] = await getDb()
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, "privacy.policyVersion"));
  originalVersion = config?.value ?? "prueba-v1";
  const [created] = await getDb()
    .insert(form)
    .values({
      slug,
      title: "Política de prueba E2E",
      audience: "PUBLIC",
      status: "OPEN",
      consentRequired: true,
      fields: [],
      actions: { createPerson: true },
    })
    .onConflictDoUpdate({ target: form.slug, set: { status: "OPEN" } })
    .returning({ id: form.id });
  if (!created) throw new Error("formulario de prueba");
  formId = created.id;
});
test.afterEach(async () => {
  await drenarOutbox();
  return policy(originalVersion);
});
test.afterEach(async () => {
  await drenarOutbox();
  await getDb().delete(form).where(eq(form.id, formId));
  await closeDb();
});

test("la política pendiente mantiene Mi OE y deshabilita nuevas autorizaciones y formularios", async ({
  page,
}) => {
  await policy("pendiente");
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Miembro");
  await page.goto("/app/ajustes#consentimientos");
  const consents = page.locator("#consentimientos");
  await expect(consents.getByText(t("T-1178"), { exact: false })).toBeVisible();
  const grants = consents.getByRole("button", { name: "Autorizar", exact: true });
  expect(await grants.count()).toBeGreaterThan(0);
  for (const button of await grants.all()) await expect(button).toBeDisabled();
  for (const button of await consents
    .getByRole("button", { name: "Retirar la autorización", exact: true })
    .all())
    await expect(button).toBeEnabled();
  await page.goto(`/f/${slug}`);
  await expect(page.getByText(t("T-1178"), { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: t("T-852"), exact: true })).toHaveCount(0);
  await policy("prueba-v2");
  await page.reload();
  await expect(page.getByRole("button", { name: t("T-852"), exact: true })).toBeVisible();
});

test("una página abierta antes de bloquear la política no puede guardar una aceptación", async ({
  page,
}) => {
  await policy("prueba-v1");
  await page.goto(`/f/${slug}`);
  const email = "e2e-politica-bloqueada@example.com";
  await page.getByRole("textbox", { name: "Nombre", exact: true }).fill("Persona");
  await page.getByRole("textbox", { name: "Apellido", exact: true }).fill("Sintética");
  await page.getByRole("textbox", { name: "Correo", exact: true }).fill(email);
  await page.getByRole("checkbox").check();
  await policy("pendiente");
  await page.getByRole("button", { name: t("T-852"), exact: true }).click();
  await expect(page.getByText(t("T-1178"), { exact: false })).toBeVisible();
  expect(
    await getDb().select().from(formSubmission).where(eq(formSubmission.formId, formId)),
  ).toHaveLength(0);
  expect(await getDb().select().from(person).where(eq(person.email, email))).toHaveLength(0);
});
