import { expect } from "@playwright/test";
import { and, asc, eq, isNull, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { task } from "@/modules/crm/schema";
import {
  committee,
  committeeMembership,
  committeeRoleAssignment,
  membership,
  person,
} from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
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
  await db.insert(committeeRoleAssignment).values({
    membershipId: row.id,
    personId: member.id,
    committeeId: home.id,
    termId: current.id,
    roleCode,
    coDirector,
  });
  await db
    .update(committeeMembership)
    .set({ roleCode: coDirector ? "MIEMBRO" : roleCode })
    .where(eq(committeeMembership.id, row.id));
  const [nuevo] = await db
    .insert(person)
    .values({
      email: NEW_EMAIL,
      firstName: "Director",
      lastName: "Nuevo",
      stage: "MEMBER",
      source: "E2E",
    })
    .onConflictDoNothing()
    .returning({ id: person.id });
  if (nuevo) {
    await db
      .insert(membership)
      .values({ personId: nuevo.id, status: "ACTIVE", firstTermId: current.id });
  }
  await closeDb();
}

test("Gestión Humana ve solo Personas, agrega un miembro y pide un retiro a GH", async ({
  page,
}) => {
  await direct("GESTION_HUMANA");
  await page.goto("/admin");
  await expect(page).toHaveURL(new RegExp(`/admin/comites/${slug}$`));
  await expect(page.getByText("Tu comité")).toBeVisible();
  const nav = page.locator(".admin-sidebar nav");
  await expect(nav.getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Buscar (⌘K)" })).toHaveCount(0);
  // La paleta tampoco responde por su ruta: es solo de ADMIN (ADR-072).
  const busqueda = await page.request.get("/api/admin/buscar?q=Licencia");
  expect(busqueda.status()).toBe(403);
  const tabs = page.getByRole("navigation", { name: "Sección" });
  await expect(tabs.getByRole("link", { name: "Personas" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Actividades" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Gestión del roster" })).toBeVisible();
  await expect(page.getByText("Tu cargo lo cambia GH.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await sinViolaciones(page);

  await page.getByRole("link", { name: "Agregar miembro" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Buscá por nombre").fill("Director Nuevo");
  await panel.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("dialog").getByText("Director Nuevo")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Agregar miembro" }).click();
  await expect(page.getByText("Director Nuevo ya hace parte del comité.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Director Nuevo/ })).toBeVisible();

  await page
    .getByRole("row", { name: /Licencia E2E/ })
    .getByRole("link", { name: "Pedir retiro a GH" })
    .click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("e2e: no volvió a las reuniones");
  await page.getByRole("dialog").getByRole("button", { name: "Enviar el pedido" }).click();
  await expect(page.getByText("Listo: GH ya tiene tu pedido.")).toBeVisible();
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
  const tabs = page.getByRole("navigation", { name: "Sección" });
  await expect(tabs.getByRole("link", { name: "Actividades" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Personas" })).toBeVisible();
  for (const name of ["Comunicación", "Aliados", "Finanzas"]) {
    await expect(tabs.getByRole("link", { name })).toHaveCount(0);
  }
  await tabs.getByRole("link", { name: "Actividades" }).click();
  await expect(page.getByRole("link", { name: "Crear serie semanal" })).toBeVisible();
  await tabs.getByRole("link", { name: "Personas" }).click();
  await expect(page.getByRole("heading", { name: "Gestión del roster" })).toBeVisible();
  await sinViolaciones(page);
});

test("la codirección del General ve las cinco áreas y no deja un cargo obligatorio vacío", async ({
  page,
}) => {
  await direct("GENERAL", true);
  await page.goto("/admin");
  await expect(page).toHaveURL(new RegExp(`/admin/comites/${slug}$`));
  const tabs = page.getByRole("navigation", { name: "Sección" });
  for (const name of ["Personas", "Actividades", "Comunicación", "Aliados", "Finanzas"]) {
    await expect(tabs.getByRole("link", { name })).toBeVisible();
  }
  const fila = page.getByRole("row", { name: /Licencia E2E/ });
  await fila.getByRole("link", { name: "Cargos" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Financiero", { exact: true }).check();
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Es nuevo: un cargo de mesa necesita el aval",
  );
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
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Licencia E2E/ })).toContainText("Financiero");

  await page
    .getByRole("row", { name: /Licencia E2E/ })
    .getByRole("link", { name: "Cargos" })
    .click();
  await page.getByRole("dialog").getByLabel("Financiero", { exact: true }).uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("sin Financiero titular");
  await sinViolaciones(page);
});
