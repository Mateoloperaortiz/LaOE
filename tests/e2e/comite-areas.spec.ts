import { expect } from "@playwright/test";
import { and, asc, eq, isNull, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { task } from "@/modules/crm/schema";
import { committee, committeeMembership, membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedCommitteeRole, seedMembership, seedPerson } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_CALENDAR, E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_LEAVE_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

// La dirección del comité por áreas (ADR-058): el miembro de pruebas recibe un cargo de dirección por
// SQL en su comité base y entra al admin recortado a las pestañas de sus capacidades. La base por
// escenario vuelve a la línea base antes de cada caso.
test.use({ storageState: "tests/e2e/.auth/member.json" });

const NEW_EMAIL = "e2e-director-nuevo@eafit.edu.co";
const [personas, actividades, comunicacion, aliados, finanzas] = tList("T-2174");

let slug = "";

/** Da al miembro de pruebas un cargo en su comité base y siembra una persona activa sin comités. */
async function direct(roleCode: string, coDirector = false): Promise<void> {
  const db = getDb();
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  const [home] = await db
    .select({ id: committee.id, slug: committee.slug })
    .from(committee)
    .where(and(eq(committee.status, "ACTIVE"), notLike(committee.slug, "e2e-%")))
    .orderBy(asc(committee.name))
    .limit(1);
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  if (!member || !home || !current) throw new Error("Faltan identidades sintéticas");
  slug = home.slug;
  const [row] = await db
    .select({ id: committeeMembership.id })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, member.id),
        eq(committeeMembership.committeeId, home.id),
        eq(committeeMembership.termId, current.id),
        isNull(committeeMembership.leftAt),
      ),
    );
  if (!row) throw new Error("El miembro de pruebas no está en su comité base");
  await seedCommitteeRole(row.id, roleCode, coDirector);
  const [known] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, NEW_EMAIL));
  if (!known) {
    const nuevo = await seedPerson(NEW_EMAIL, {
      firstName: "Director",
      lastName: "Nuevo",
      source: "E2E",
    });
    await seedMembership(nuevo, current.id);
  }
  await closeDb();
}

test("Gestión Humana ve solo Personas, agrega un miembro y pide un retiro a GH", async ({
  page,
}) => {
  await direct("GESTION_HUMANA");
  await page.goto("/admin");
  await expect(page).toHaveURL(new RegExp(`/admin/comites/${slug}$`));
  await expect(page.getByText(tList("T-651")[0])).toBeVisible();
  const nav = page.locator(".admin-sidebar nav");
  await expect(nav.getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("button", { name: t("T-299") })).toHaveCount(0);
  // La paleta tampoco responde por su ruta: es solo de ADMIN (ADR-072).
  const busqueda = await page.request.get("/api/admin/buscar?q=Licencia");
  expect(busqueda.status()).toBe(403);
  const tabs = page.getByRole("navigation", { name: t("T-1502") });
  await expect(tabs.getByRole("link", { name: personas })).toBeVisible();
  await expect(tabs.getByRole("link", { name: actividades })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: t("T-2145") })).toBeVisible();
  await expect(page.getByText(t("T-2154"))).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await sinViolaciones(page);

  await page.getByRole("link", { name: t("T-2147") }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel(t("T-2148")).fill("Director Nuevo");
  await panel.getByRole("button", { name: t("T-2149") }).click();
  await expect(page.getByRole("dialog").getByText("Director Nuevo")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: t("T-2147") })
    .click();
  await expect(page.getByText(t("T-2161", { nombre: "Director Nuevo" }))).toBeVisible();
  await expect(page.getByRole("row", { name: /Director Nuevo/ })).toBeVisible();

  await page
    .getByRole("row", { name: /Licencia E2E/ })
    .getByRole("link", { name: t("T-2155") })
    .click();
  await page.getByRole("dialog").getByLabel(t("T-2158")).fill("e2e: no volvió a las reuniones");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: t("T-2159") })
    .click();
  await expect(page.getByText(t("T-2160"))).toBeVisible();
  await drenarOutbox();
  const db = getDb();
  const [leaver] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_LEAVE_EMAIL));
  const tasks = leaver ? await db.select().from(task).where(eq(task.personId, leaver.id)) : [];
  await closeDb();
  expect(tasks.map((row) => [row.kind, row.status, row.assigneeId])).toEqual([
    ["COMMITTEE_REMOVAL", "OPEN", null],
  ]);

  await page.goto("/admin/personas");
  await expect(page).toHaveURL(/\/app$/);
});

test("Logística ve Personas y Actividades, sin las otras áreas", async ({ page }) => {
  await direct("LOGISTICA");
  await page.goto("/admin");
  await expect(page).toHaveURL(new RegExp(`/admin/comites/${slug}$`));
  const nav = page.locator(".admin-sidebar nav");
  await expect(nav.getByRole("link")).toHaveCount(1);
  const tabs = page.getByRole("navigation", { name: t("T-1502") });
  await expect(tabs.getByRole("link", { name: actividades })).toBeVisible();
  await expect(tabs.getByRole("link", { name: personas })).toBeVisible();
  for (const name of [comunicacion, aliados, finanzas]) {
    await expect(tabs.getByRole("link", { name })).toHaveCount(0);
  }
  await tabs.getByRole("link", { name: actividades }).click();
  await expect(page.getByRole("link", { name: tList("T-652")[1] })).toBeVisible();
  await tabs.getByRole("link", { name: personas }).click();
  await expect(page.getByRole("heading", { name: t("T-2145") })).toBeVisible();
  await sinViolaciones(page);
});

test("la codirección del General ve las cinco áreas y no deja un cargo obligatorio vacío", async ({
  page,
}) => {
  await direct("GENERAL", true);
  await page.goto("/admin");
  await expect(page).toHaveURL(new RegExp(`/admin/comites/${slug}$`));
  const tabs = page.getByRole("navigation", { name: t("T-1502") });
  for (const name of tList("T-2174")) {
    await expect(tabs.getByRole("link", { name })).toBeVisible();
  }
  const fila = page.getByRole("row", { name: /Licencia E2E/ });
  await fila.getByRole("link", { name: tList("T-2152")[1] }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Financiero", { exact: true }).check();
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(panel.getByRole("alert")).toContainText(tList("T-2281")[2]);
  // La guarda sigue vigente. Para el camino permitido, la misma identidad sintética es veterana.
  const db = getDb();
  const [previous] = await db.select().from(term).where(eq(term.code, E2E_CALENDAR.previous.code));
  const [target] = await db.select().from(person).where(eq(person.email, E2E_LEAVE_EMAIL));
  if (!previous || !target) throw new Error("Faltan identidades sintéticas");
  await db
    .update(membership)
    .set({ firstTermId: previous.id })
    .where(eq(membership.personId, target.id));
  await closeDb();
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByRole("row", { name: /Licencia E2E/ })).toContainText("Financiero");

  await page
    .getByRole("row", { name: /Licencia E2E/ })
    .getByRole("link", { name: tList("T-2152")[1] })
    .click();
  await page.getByRole("dialog").getByLabel("Financiero", { exact: true }).uncheck();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: t("T-253") })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    t("T-2168", { cargo: "Financiero" }),
  );
  await sinViolaciones(page);
});
