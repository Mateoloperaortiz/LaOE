import { expect, test } from "@playwright/test";
import { and, asc, eq, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { committee, person } from "@/modules/people/schema";
import {
  permanenceRule,
  workGroup,
  workGroupEvaluator,
  workGroupMembership,
} from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

// Evaluaciones, puntajes del líder, destacado del mes y créditos (10-verificacion, e2e): el director
// evalúa un GAP y el porcentaje del miembro cambia; el líder pone un puntaje con observación y nombra
// al destacado; GH reconoce un crédito manual desde la Persona 360.

async function ids() {
  const db = getDb();
  const [admin] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_EMAIL));
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  const [home] = await db
    .select({ id: committee.id, slug: committee.slug, name: committee.name })
    .from(committee)
    .where(and(eq(committee.status, "ACTIVE"), notLike(committee.slug, "e2e-%")))
    .orderBy(asc(committee.name))
    .limit(1);
  if (!admin || !member || !current || !home) throw new Error("faltan datos de prueba");
  return { admin, member, current, home };
}

test.describe("director de GH", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test.beforeAll(async () => {
    const { admin, member, current } = await ids();
    const db = getDb();
    let [group] = await db
      .select({ id: workGroup.id })
      .from(workGroup)
      .where(and(eq(workGroup.termId, current.id), eq(workGroup.name, "e2e-GAP evaluado")));
    if (!group) {
      [group] = await db
        .insert(workGroup)
        .values({ termId: current.id, kind: "GAP", name: "e2e-GAP evaluado" })
        .returning({ id: workGroup.id });
    }
    if (!group) throw new Error("sin grupo");
    await db
      .insert(workGroupEvaluator)
      .values({ groupId: group.id, personId: admin.id })
      .onConflictDoNothing();
    await db
      .insert(workGroupMembership)
      .values({ groupId: group.id, personId: member.id })
      .onConflictDoNothing();
    await closeDb();
  });

  test("evalúa buen desempeño en el GAP desde la bandeja", async ({ page }) => {
    await page.goto("/admin/permanencia/evaluaciones");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Evaluaciones de desempeño");
    const group = page.getByRole("region", { name: "e2e-GAP evaluado" });
    await expect(group).toBeVisible();
    await group.getByRole("button", { name: "Buen desempeño" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
    await expect(page.getByRole("region", { name: "e2e-GAP evaluado" })).toContainText(
      "Buen desempeño",
    );
    await sinViolaciones(page);
  });

  test("reconoce un crédito manual desde la Persona 360", async ({ page }) => {
    const { member, current, home } = await ids();
    const db = getDb();
    await db
      .insert(permanenceRule)
      .values({
        termId: current.id,
        scope: "COMMITTEE",
        committeeId: home.id,
        key: "e2e-manual",
        label: "e2e-Apoyo especial",
        weight: 6,
        computation: "MANUAL",
        params: {},
        sortOrder: 9,
      })
      .onConflictDoNothing();
    await closeDb();
    await page.goto(`/admin/personas/${member.id}?pestana=permanencia&accion=credito`);
    const panel = page.getByRole("dialog");
    await panel
      .getByLabel("Criterio")
      .selectOption({ label: `${home.name} · e2e-Apoyo especial · 6` });
    await panel.getByLabel("Valor").fill("4");
    await panel.getByLabel("Motivo").fill("e2e-Organizó la integración");
    await panel.getByRole("button", { name: "Reconocer" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
    await expect(page.getByText("4 / 6 · e2e-Organizó la integración")).toBeVisible();
    await sinViolaciones(page);
  });
});

test.describe("miembro", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("ve el GAP evaluado con buen desempeño y el crédito en su permanencia", async ({ page }) => {
    // El historial lo materializa evaluation.recorded; CI no arranca jobs de fondo.
    await drenarOutbox();
    await page.goto("/app/permanencia");
    const gap = page.getByRole("listitem").filter({ hasText: "e2e-GAP evaluado: Buen desempeño" });
    await expect(gap.first()).toContainText("5 de 5");
    await expect(page.getByText("GH te reconoció 4 de 6.")).toBeVisible();
    await expect(page.getByText(/Buen desempeño en e2e-GAP evaluado/).first()).toBeVisible();
  });
});

test.describe("líder", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  let slug = "";

  test.beforeAll(async () => {
    const { member, home } = await ids();
    slug = home.slug;
    const db = getDb();
    await db
      .insert(permission)
      .values({ personId: member.id, code: "COMMITTEE_LEADER", committeeId: home.id })
      .onConflictDoNothing();
    await closeDb();
  });

  test.afterAll(async () => {
    const { member } = await ids();
    const db = getDb();
    await db.delete(permission).where(eq(permission.personId, member.id));
    await closeDb();
  });

  test("pone un puntaje con observación y nombra al destacado del mes", async ({ page }) => {
    await page.goto(`/admin/comites/${slug}/permanencia`);
    await expect(page.getByRole("heading", { name: "Puntajes" })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "Miembro E2E" }).first();
    await row.getByRole("link", { name: "Editar" }).first().click();
    const panel = page.getByRole("dialog");
    await panel.getByLabel(/Valor/).fill("3");
    await panel.getByLabel("Observación").fill("e2e-Faltó a dos reuniones");
    await panel.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Miembro E2E" }).first()).toContainText(
      "3 /",
    );

    await page.getByRole("link", { name: "Nombrar destacado" }).click();
    const destacado = page.getByRole("dialog");
    await destacado.getByLabel("Persona").selectOption({ label: "Miembro E2E" });
    await destacado.getByRole("button", { name: "Nombrar destacado" }).click();
    await expect(page.getByText(/quedó (como destacado|registrado como destacado)/)).toBeVisible();
    await sinViolaciones(page);
  });
});
