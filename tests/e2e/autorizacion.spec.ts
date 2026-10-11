import { expect } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { page as contentPage } from "@/modules/content/schema";
import { consent, person } from "@/modules/people/schema";
import { appConfig } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { seedConfig, seedConsent, seedPage } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

// Autorización en el primer ingreso (ADR-048): sin ella Mi OE no se abre, y la persona la da
// leyendo la política publicada.
test.use({ storageState: "tests/e2e/.auth/member.json" });

const CUERPO = "Texto sintético de la política para la suite e2e.";
let originalPage: typeof contentPage.$inferSelect | undefined;
let originalConfig: typeof appConfig.$inferSelect | undefined;
let memberId: string;

async function publicar(status: "PUBLISHED" | "DRAFT"): Promise<void> {
  await seedPage("privacidad", "Tratamiento de datos personales", {
    body: CUERPO,
    status,
    audience: "PUBLIC",
  });
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
  const [member] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) throw new Error("miembro sintético ausente");
  memberId = member.id;
  await seedConfig("privacy.policyVersion", '"prueba-v1"');
  await getDb()
    .delete(consent)
    .where(and(eq(consent.personId, memberId), eq(consent.purpose, "MEMBERSHIP")));
});

test.afterEach(async () => {
  await drenarOutbox();
  if (originalPage) {
    await getDb().update(contentPage).set(originalPage).where(eq(contentPage.slug, "privacidad"));
  }
  if (originalConfig) {
    await getDb()
      .update(appConfig)
      .set({ value: originalConfig.value })
      .where(eq(appConfig.key, "privacy.policyVersion"));
  }
  // La suite entera entra a Mi OE con este miembro: siempre queda con su autorización viva.
  await seedConsent(memberId);
  await closeDb();
});

test("sin autorización, Mi OE lleva a la pantalla y aceptar la registra como propia", async ({
  page,
}) => {
  await publicar("PUBLISHED");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/autorizacion$/);
  await expect(page.getByRole("heading", { level: 1, name: t("T-2085") })).toBeVisible();
  await expect(page.getByText(CUERPO)).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("button", { name: t("T-2087") }).click();
  await expect(page).toHaveURL(/\/app$/);

  const vivos = await getDb()
    .select({ source: consent.source, policyVersion: consent.policyVersion })
    .from(consent)
    .where(
      and(
        eq(consent.personId, memberId),
        eq(consent.purpose, "MEMBERSHIP"),
        isNull(consent.revokedAt),
      ),
    );
  expect(vivos).toEqual([{ source: "SELF", policyVersion: "prueba-v1" }]);
});

test("con la política sin publicar avisa y no ofrece aceptar", async ({ page }) => {
  await publicar("DRAFT");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/autorizacion$/);
  await expect(page.getByText(t("T-2088"))).toBeVisible();
  await expect(page.getByRole("button", { name: t("T-2087") })).toHaveCount(0);
});
