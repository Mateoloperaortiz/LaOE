import { expect, test } from "@playwright/test";
import { and, asc, eq, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { committee, person } from "@/modules/people/schema";
import { permanenceTable } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_CLOSING_TERM, E2E_MEMBER_EMAIL } from "./global-setup";

// Tablas de permanencia (ADR-036 regla 3): GH carga la referencia sobre el término de pruebas, crea
// un criterio de comité y bloquea la tabla; el líder edita la suya y respeta el bloqueo.

async function firstCommittee() {
  const db = getDb();
  const [home] = await db
    .select({ id: committee.id, slug: committee.slug, name: committee.name })
    .from(committee)
    .where(and(eq(committee.status, "ACTIVE"), notLike(committee.slug, "e2e-%")))
    .orderBy(asc(committee.name))
    .limit(1);
  if (!home) throw new Error("sin comité");
  return home;
}

test.describe("GH", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  let termId = "";
  let slug = "";
  let name = "";

  test.beforeAll(async () => {
    const db = getDb();
    const [closing] = await db
      .select({ id: term.id })
      .from(term)
      .where(eq(term.code, E2E_CLOSING_TERM));
    if (!closing) throw new Error("sin término de pruebas");
    termId = closing.id;
    const home = await firstCommittee();
    slug = home.slug;
    name = home.name;
    await closeDb();
  });

  test("carga la referencia, crea un criterio de comité y bloquea la tabla", async ({ page }) => {
    await page.goto(`/admin/permanencia/reglas?termId=${termId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tablas de permanencia");
    await page.getByRole("button", { name: "Cargar tabla de referencia" }).click();
    await expect(page.getByText("Tabla de referencia cargada: 9 criterios.")).toBeVisible();
    await expect(page.getByText("Veteranos 50 · Nuevos 45 · nominal 50")).toBeVisible();
    await sinViolaciones(page);

    await page.goto(`/admin/permanencia/reglas?termId=${termId}&comite=${slug}&accion=nueva`);
    const panel = page.getByRole("complementary");
    await panel.getByLabel("Clave").fill("e2e-reuniones");
    await panel.getByLabel("Nombre").fill("e2e-Asistencia a reuniones");
    await panel.getByLabel("Peso").fill("15");
    await panel.getByLabel("Cómo se calcula").selectOption("CHECKIN_RATE");
    await panel.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
    await expect(page.getByRole("cell", { name: "e2e-Asistencia a reuniones" })).toBeVisible();
    await expect(page.getByText("Veteranos 15 · Nuevos 15 · nominal 60")).toBeVisible();

    await page.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(page.getByText(/Bloqueada el/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Desbloquear" })).toBeVisible();
    await sinViolaciones(page);

    await page.getByRole("link", { name: "Vista previa del impacto" }).click();
    await expect(page.getByRole("complementary")).toContainText("Impacto sobre el roster");
    expect(name).not.toBe("");
  });
});

test.describe("líder", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  let slug = "";
  let committeeId = "";
  let currentTermId = "";

  test.beforeAll(async () => {
    const db = getDb();
    const [member] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    const home = await firstCommittee();
    const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
    if (!member || !current) throw new Error("sin miembro o término");
    slug = home.slug;
    committeeId = home.id;
    currentTermId = current.id;
    await db
      .insert(permission)
      .values({ personId: member.id, code: "COMMITTEE_LEADER", committeeId: home.id })
      .onConflictDoNothing();
    await closeDb();
  });

  test.afterAll(async () => {
    const db = getDb();
    const [member] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    if (member) {
      await db.delete(permission).where(eq(permission.personId, member.id));
    }
    await db
      .delete(permanenceTable)
      .where(
        and(
          eq(permanenceTable.termId, currentTermId),
          eq(permanenceTable.committeeId, committeeId),
        ),
      );
    await closeDb();
  });

  test("edita la tabla de su comité y respeta el bloqueo de GH", async ({ page }) => {
    await page.goto(`/admin/comites/${slug}/permanencia`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Permanencia de");
    await expect(page.getByRole("link", { name: "Nuevo criterio" })).toBeVisible();
    await sinViolaciones(page);

    await page.getByRole("link", { name: "Nuevo criterio" }).click();
    const panel = page.getByRole("complementary");
    await panel.getByLabel("Clave").fill("e2e-evento");
    await panel.getByLabel("Nombre").fill("e2e-Evento del comité");
    await panel.getByLabel("Peso").fill("10");
    await panel.getByLabel("Cómo se calcula").selectOption("MANUAL");
    await panel.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
    await expect(page.getByRole("cell", { name: "e2e-Evento del comité" })).toBeVisible();

    // GH bloquea la tabla (por SQL, como lo haría desde /admin/permanencia/reglas).
    const db = getDb();
    await db.insert(permanenceTable).values({
      termId: currentTermId,
      scope: "COMMITTEE",
      committeeId,
      lockedAt: new Date(),
      comment: "e2e-bloqueo",
    });
    await closeDb();
    await page.reload();
    await expect(page.getByText(/GH bloqueó la tabla de/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Nuevo criterio" })).toHaveCount(0);

    await page.goto("/admin/permanencia/reglas");
    await expect(page).toHaveURL(/\/app$/);
  });
});
