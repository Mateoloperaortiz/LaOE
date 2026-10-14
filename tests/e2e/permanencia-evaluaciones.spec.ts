import { expect } from "@playwright/test";
import { and, asc, eq, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { committee, person } from "@/modules/people/schema";
import { evaluateAs, grantManualCreditAs } from "@/modules/permanence";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedPermission, seedRule, seedWorkGroup, seedWorkGroupMembership } from "../factories";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
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
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
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

  test.beforeEach(async () => {
    const { admin, member, current } = await ids();
    const groupId = await seedWorkGroup(current.id, "e2e-GAP evaluado", {
      kind: "GAP",
      evaluatorIds: [admin.id],
    });
    await seedWorkGroupMembership(groupId, member.id);
    await closeDb();
  });

  test("evalúa buen desempeño en el GAP desde la bandeja", async ({ page }) => {
    await page.goto("/admin/permanencia/evaluaciones");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-761"));
    const group = page.getByRole("region", { name: "e2e-GAP evaluado" });
    await expect(group).toBeVisible();
    await group.getByRole("button", { name: tList("T-167")[0] }).click();
    await expect(page.getByText(t("T-259"))).toBeVisible();
    await expect(page.getByRole("region", { name: "e2e-GAP evaluado" })).toContainText(
      tList("T-750")[1],
    );
    await sinViolaciones(page);
  });

  test("reconoce un crédito manual desde la Persona 360", async ({ page }) => {
    const { member, current, home } = await ids();
    await seedRule(current.id, "e2e-manual", {
      scope: "COMMITTEE",
      committeeId: home.id,
      label: "e2e-Apoyo especial",
      weight: 6,
      computation: "MANUAL",
      params: {},
      sortOrder: 9,
    });
    await closeDb();
    await page.goto(`/admin/personas/${member.id}?pestana=permanencia&accion=credito`);
    const panel = page.getByRole("dialog");
    await panel
      .getByLabel(tList("T-786")[0])
      .selectOption({ label: `${home.name} · e2e-Apoyo especial · 6` });
    await panel.getByLabel(tList("T-786")[1]).fill("4");
    await panel.getByLabel(tList("T-786")[2]).fill("e2e-Organizó la integración");
    await panel.getByRole("button", { name: tList("T-785")[1] }).click();
    await expect(page.getByText(t("T-259"))).toBeVisible();
    await expect(page.getByText("4 / 6 · e2e-Organizó la integración")).toBeVisible();
    await sinViolaciones(page);
  });
});

test.describe("miembro", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test.beforeEach(async () => {
    const { admin, member, current, home } = await ids();
    const group = { id: await seedWorkGroup(current.id, "e2e-GAP evaluado", { kind: "GAP" }) };
    const rule = {
      id: await seedRule(current.id, "e2e-manual", {
        scope: "COMMITTEE",
        committeeId: home.id,
        label: "e2e-Apoyo especial",
        weight: 6,
        computation: "MANUAL",
      }),
    };
    await seedWorkGroupMembership(group.id, member.id);
    const actor = { personId: admin.id, ip: null };
    await evaluateAs(
      actor,
      { groupId: group.id, personId: member.id, evaluation: "GOOD", note: "" },
      { isAdmin: true },
    );
    await grantManualCreditAs(actor, {
      ruleId: rule.id,
      personId: member.id,
      value: 4,
      reason: "e2e-Organizó la integración",
    });
  });

  test("ve el GAP evaluado con buen desempeño y el crédito en su permanencia", async ({ page }) => {
    // El historial lo materializa evaluation.recorded; CI no arranca jobs de fondo.
    await drenarOutbox();
    await page.goto("/app/permanencia");
    const gap = page.getByRole("listitem").filter({
      hasText: t("T-689", { grupo: "e2e-GAP evaluado", evaluacion: tList("T-750")[1] }),
    });
    await expect(gap.first()).toContainText(t("T-682", { logrado: 5, peso: 5 }));
    await expect(page.getByText(t("T-692", { valor: 4, peso: 6 }))).toBeVisible();
    await expect(
      page
        .getByText(
          tList("T-832")[0]
            .replace(/\{evaluador\}.*$/, "")
            .replace("{grupo}", "e2e-GAP evaluado")
            .trim(),
        )
        .first(),
    ).toBeVisible();
  });
});

test.describe("líder", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  let slug = "";

  test.beforeEach(async () => {
    const { member, home } = await ids();
    slug = home.slug;
    await seedPermission(member.id, "COMMITTEE_LEADER", home.id);
    await closeDb();
  });

  test.afterEach(async () => {
    await drenarOutbox();
    const { member } = await ids();
    const db = getDb();
    await db.delete(permission).where(eq(permission.personId, member.id));
    await closeDb();
  });

  test("pone un puntaje con observación y nombra al destacado del mes", async ({ page }) => {
    await page.goto(`/admin/comites/${slug}/permanencia`);
    await expect(page.getByRole("heading", { name: tList("T-819")[1] })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: "Miembro E2E" }).first();
    await row
      .getByRole("link", { name: t("T-252") })
      .first()
      .click();
    const panel = page.getByRole("dialog");
    await panel.getByLabel(new RegExp(tList("T-773")[0])).fill("3");
    await panel.getByLabel(tList("T-773")[1]).fill("e2e-Faltó a dos reuniones");
    await panel.getByRole("button", { name: t("T-253") }).click();
    await expect(page.getByText(t("T-259"))).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Miembro E2E" }).first()).toContainText(
      "3 /",
    );

    await page.getByRole("link", { name: tList("T-778")[1] }).click();
    const destacado = page.getByRole("dialog");
    await destacado.getByLabel(tList("T-779")[1]).selectOption({ label: "Miembro E2E" });
    await destacado.getByRole("button", { name: tList("T-778")[1] }).click();
    await expect(
      page.getByText(new RegExp(`${copyPattern("T-781").source}|${copyPattern("T-782").source}`)),
    ).toBeVisible();
    await sinViolaciones(page);
  });
});
