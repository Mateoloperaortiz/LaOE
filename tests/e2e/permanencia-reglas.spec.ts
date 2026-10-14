import { expect } from "@playwright/test";
import { and, asc, eq, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { committee, person } from "@/modules/people/schema";
import { permanenceTable } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedPermission, seedRule, seedTable } from "../factories";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_CLOSING_TERM, E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

// Tablas de permanencia (ADR-036 regla 3): GH carga la referencia sobre el término de pruebas, crea
// un criterio de comité y bloquea la tabla; el líder edita la suya, no abre un criterio de otra tabla
// (ADR-072) y respeta el bloqueo.

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

  test.beforeEach(async () => {
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
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-710"));
    await page.getByRole("button", { name: tList("T-715")[2] }).click();
    await expect(page.getByText(t("T-735", { n: 9 }))).toBeVisible();
    await expect(page.getByText(t("T-713", { v: 50, n: 45, nominal: 50 }))).toBeVisible();
    await sinViolaciones(page);

    await page.goto(`/admin/permanencia/reglas?termId=${termId}&comite=${slug}&accion=nueva`);
    const panel = page.getByRole("dialog");
    await panel.getByLabel(tList("T-716")[0]).fill("e2e-reuniones");
    await panel.getByLabel(tList("T-716")[1]).fill("e2e-Asistencia a reuniones");
    await panel.getByLabel(tList("T-716")[3]).fill("15");
    await panel.getByLabel(tList("T-716")[5]).selectOption("CHECKIN_RATE");
    await panel.getByRole("button", { name: t("T-253") }).click();
    await expect(page.getByText(t("T-259"))).toBeVisible();
    await expect(page.getByRole("cell", { name: "e2e-Asistencia a reuniones" })).toBeVisible();
    await expect(page.getByText(t("T-713", { v: 15, n: 15, nominal: 60 }))).toBeVisible();

    await page.getByRole("button", { name: tList("T-715")[4], exact: true }).click();
    await expect(
      page.getByText(new RegExp(tList("T-738")[2].split(" {fecha}")[0] ?? "")),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: tList("T-715")[5] })).toBeVisible();
    await sinViolaciones(page);

    await page.getByRole("link", { name: tList("T-715")[3] }).click();
    await expect(page.getByRole("dialog")).toContainText(tList("T-737")[0]);
    expect(name).not.toBe("");
  });

  test("un GAP nuevo trae marcado el GT de macroevento y GH lo puede quitar", async ({ page }) => {
    await page.goto(`/admin/permanencia/reglas?termId=${termId}&accion=nueva`);
    const panel = page.getByRole("dialog");
    await panel.getByLabel(tList("T-716")[0]).fill("e2e-gap-equivalente");
    await panel.getByLabel(tList("T-716")[1]).fill("e2e-GAP con GT");
    await panel.getByLabel(tList("T-716")[3]).fill("5");
    await panel.getByLabel(tList("T-716")[5]).selectOption("GROUP_EVALUATED");
    await panel.getByLabel(tList("T-723")[0]).selectOption("GAP");
    const equivalencia = panel.getByRole("group", { name: t("T-2615") });
    // El propio tipo no se ofrece, y el GT llega marcado porque siempre cumple el GAP (ADR-071).
    await expect(
      equivalencia.getByRole("checkbox", { name: tList("T-725")[2], exact: true }),
    ).toHaveCount(0);
    await expect(equivalencia.getByRole("checkbox", { name: tList("T-725")[1] })).toBeChecked();
    await panel.getByRole("button", { name: t("T-253") }).click();
    await expect(page.getByText(t("T-259"))).toBeVisible();

    const fila = page.getByRole("row", { name: /e2e-GAP con GT/ });
    await fila.getByRole("link", { name: t("T-252") }).click();
    const gt = page
      .getByRole("dialog")
      .getByRole("group", { name: t("T-2615") })
      .getByRole("checkbox", { name: tList("T-725")[1] });
    await expect(gt).toBeChecked();
    await sinViolaciones(page);

    // Quitarla se guarda y se respeta al releer: la marca solo es el punto de partida.
    await gt.uncheck();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: t("T-253") })
      .click();
    await expect(page.getByText(t("T-259"))).toBeVisible();
    await page
      .getByRole("row", { name: /e2e-GAP con GT/ })
      .getByRole("link", { name: t("T-252") })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("group", { name: t("T-2615") })
        .getByRole("checkbox", { name: tList("T-725")[1] }),
    ).not.toBeChecked();
  });
});

test.describe("líder", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  let slug = "";
  let committeeId = "";
  let currentTermId = "";

  test.beforeEach(async () => {
    const db = getDb();
    const [member] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    const home = await firstCommittee();
    const [current] = await db
      .select({ id: term.id })
      .from(term)
      .where(eq(term.code, E2E_TERM.code));
    if (!member || !current) throw new Error("sin miembro o término");
    slug = home.slug;
    committeeId = home.id;
    currentTermId = current.id;
    await seedPermission(member.id, "COMMITTEE_LEADER", home.id);
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
    await expect(page.getByRole("heading", { level: 1 })).toContainText(copyPattern("T-818"));
    await expect(page.getByRole("link", { name: tList("T-715")[0] })).toBeVisible();
    await sinViolaciones(page);

    await page.getByRole("link", { name: tList("T-715")[0] }).click();
    const panel = page.getByRole("dialog");
    await panel.getByLabel(tList("T-716")[0]).fill("e2e-evento");
    await panel.getByLabel(tList("T-716")[1]).fill("e2e-Evento del comité");
    await panel.getByLabel(tList("T-716")[3]).fill("10");
    await panel.getByLabel(tList("T-716")[5]).selectOption("MANUAL");
    await panel.getByRole("button", { name: t("T-253") }).click();
    await expect(page.getByText(t("T-259"))).toBeVisible();
    await expect(page.getByRole("cell", { name: "e2e-Evento del comité" })).toBeVisible();

    // Su criterio abre el editor; uno de la tabla general pedido por la URL no se abre (ADR-072).
    await page
      .getByRole("row", { name: /e2e-Evento del comité/ })
      .getByRole("link", { name: t("T-252") })
      .click();
    await expect(page.getByRole("dialog")).toContainText("e2e-Evento del comité");
    const ajena = {
      id: await seedRule(currentTermId, "e2e-ajena", {
        scope: "GENERAL",
        committeeId: null,
        label: "e2e-Criterio ajeno",
        description: "",
        weight: 1,
        appliesTo: "ALL",
        computation: "MANUAL",
        params: {},
      }),
    };
    await closeDb();
    await page.goto(`/admin/comites/${slug}/permanencia?accion=editar&regla=${ajena.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(copyPattern("T-818"));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("e2e-Criterio ajeno")).toHaveCount(0);

    // GH bloquea la tabla (por SQL, como lo haría desde /admin/permanencia/reglas).
    await seedTable(currentTermId, committeeId, { lockedAt: new Date(), comment: "e2e-bloqueo" });
    await closeDb();
    await page.reload();
    await expect(page.getByText(copyPattern("T-731"))).toBeVisible();
    await expect(page.getByRole("link", { name: tList("T-715")[0] })).toHaveCount(0);

    await page.goto("/admin/permanencia/reglas");
    await expect(page).toHaveURL(/\/app$/);
  });
});
