import { expect } from "@playwright/test";
import { and, asc, eq, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { committee, person } from "@/modules/people/schema";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

// Vista de líder (ADR-035 regla 15): el miembro de pruebas recibe COMMITTEE_LEADER de su comité por
// SQL (el global-setup lo revoca en cada corrida), entra al admin recortado y crea la serie semanal.
test.use({ storageState: "tests/e2e/.auth/member.json" });

let slug = "";
let name = "";

test.beforeEach(async () => {
  const db = getDb();
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  const [home] = await db
    .select({ id: committee.id, slug: committee.slug, name: committee.name })
    .from(committee)
    .where(and(eq(committee.status, "ACTIVE"), notLike(committee.slug, "e2e-%")))
    .orderBy(asc(committee.name))
    .limit(1);
  if (!member || !home) throw new Error("sin miembro o comité");
  slug = home.slug;
  name = home.name;
  await db
    .insert(permission)
    .values({ personId: member.id, code: "COMMITTEE_LEADER", committeeId: home.id })
    .onConflictDoNothing();
  await closeDb();
});

// El permiso es solo de este spec: se revoca al terminar para que el miembro siga sin permisos.
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

test("el líder entra a su comité, crea la serie semanal y no ve el resto del admin", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(new RegExp(`/admin/comites/${slug}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("Tu comité")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await sinViolaciones(page);

  // Las ocasiones viven en el área Actividades de la vista por áreas (ADR-058).
  await page.getByRole("link", { name: "Actividades" }).click();
  await page.getByRole("link", { name: "Crear serie semanal" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Título").fill("e2e-Reunión semanal");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  await panel.getByLabel("Primera reunión").fill(today);
  await panel.getByLabel("Hora").fill("18:00");
  await panel.getByRole("button", { name: "Crear serie semanal" }).click();
  await expect(page.getByText(/reuniones creadas hasta el/)).toBeVisible();
  await expect(page.getByRole("link", { name: "e2e-Reunión semanal" }).first()).toBeVisible();

  await page.getByRole("link", { name: "e2e-Reunión semanal" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Consola · e2e-Reunión semanal",
  );
  await expect(page.getByRole("link", { name: "Modo anfitrión" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprobar todos los pendientes" })).toHaveCount(0);
  await sinViolaciones(page);

  await page.goto("/admin/personas");
  await expect(page).toHaveURL(/\/app$/);
});
