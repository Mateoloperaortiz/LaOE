import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { person } from "@/modules/people/schema";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

// Panel de la junta (ADR-036 regla 12): el miembro de pruebas recibe BOARD por SQL solo durante este
// spec, entra derecho al panel sin ver nombres ni correos, descarga el CSV sin step-up y el resto del
// admin lo devuelve a Mi OE.
test.use({ storageState: "tests/e2e/.auth/member.json" });

test.beforeEach(async () => {
  const db = getDb();
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) throw new Error("sin miembro");
  await db.insert(permission).values({ personId: member.id, code: "BOARD" }).onConflictDoNothing();
  await closeDb();
});

test.afterEach(async () => {
  await drenarOutbox();
  const db = getDb();
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (member) {
    await db.delete(permission).where(eq(permission.personId, member.id));
  }
  await closeDb();
});

test("la junta ve agregados sin nombres, exporta el CSV y no entra al resto del admin", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/junta$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Panel de la junta");
  await expect(page.getByText("Retención por semestre")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await expect(page.locator("main")).not.toContainText("Miembro E2E");
  await expect(page.getByRole("link", { name: "Personas", exact: true })).toHaveCount(0);
  // La junta sí emite enlaces de acceso, y su superficie es la jornada (ADR-051, regla 4):
  // la ficha de la persona exige ADMIN. Los grupos de la navegación nacen plegados.
  const navegacion = page.locator(".admin-sidebar nav");
  while (await navegacion.getByRole("button", { expanded: false }).count()) {
    await navegacion.getByRole("button", { expanded: false }).first().click();
  }
  await expect(navegacion.getByRole("link", { name: "Jornada de activación" })).toBeVisible();
  await sinViolaciones(page);

  const csv = await page.request.get("/api/export/junta");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Indicador");
  const forbidden = await page.request.get("/api/export/personas");
  expect(forbidden.status()).toBe(403);

  await page.goto("/admin/personas");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/admin/permanencia/cumplimiento");
  await expect(page).toHaveURL(/\/app$/);
});
