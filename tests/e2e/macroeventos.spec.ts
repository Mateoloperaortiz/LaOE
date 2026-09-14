import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { event, eventEdition } from "@/modules/events/schema";
import { person } from "@/modules/people/schema";
import { sinViolaciones } from "./axe";
import { withinTermInput } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("mesa, GT y evaluación del macroevento desde una ficha", async ({ page }) => {
  const db = getDb();
  const [macro] = await db.select().from(event).where(eq(event.slug, "enfemenino"));
  const [member] = await db.select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!macro || !member) throw new Error("Faltan datos sintéticos");
  await db.insert(eventEdition).values({
    eventId: macro.id,
    slug: "equipo-prueba",
    name: "Edición del equipo de prueba",
    startsAt: new Date(`${withinTermInput()}-05:00`),
  });
  await page.goto("/admin/macroeventos");
  await page.getByRole("link", { name: "Gestionar macroevento · EnFemenino" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("EnFemenino");
  await expect(page.getByLabel("Cargo", { exact: true }).locator("option")).toHaveCount(8);
  await page.getByLabel("Cargo", { exact: true }).selectOption("AGENDA_ACADEMICA");
  await page.getByLabel("Persona", { exact: true }).selectOption(member.id);
  await page
    .getByLabel("Excepción registrada (motivo)")
    .fill("Aval sintético de GH para esta prueba");
  await page.getByRole("button", { name: "Nombrar dirección", exact: true }).click();
  await expect(page.getByText("Guardado.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: member.fullName ?? "" })).toBeVisible();
  await page.getByRole("link", { name: "Equipo del GT", exact: true }).click();
  await page.getByRole("button", { name: "Preparar GT del semestre" }).click();
  await page.getByLabel("Agregar miembro", { exact: true }).selectOption(member.id);
  await page.getByRole("button", { name: "Agregar miembro", exact: true }).click();
  await expect(
    page.getByText("Integrantes: 1 · Evaluaciones pendientes: 1", { exact: true }),
  ).toBeVisible();
  await page.getByText(`Evaluar desempeño · ${member.fullName}`, { exact: true }).click();
  await page.getByLabel("Evaluar desempeño", { exact: true }).selectOption("INSUFFICIENT");
  await page.getByRole("button", { name: "Guardar evaluación" }).click();
  await expect(page).toHaveURL(/error=/);
  if (!(await page.getByLabel("Evaluar desempeño", { exact: true }).isVisible())) {
    await page.getByText(`Evaluar desempeño · ${member.fullName}`, { exact: true }).click();
  }
  await page.getByLabel("Evaluar desempeño", { exact: true }).selectOption("GOOD");
  await page.getByRole("button", { name: "Guardar evaluación" }).click();
  await expect(
    page.getByText("Integrantes: 1 · Evaluaciones pendientes: 0", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Líder del GT", { exact: true }).selectOption(member.id);
  await page.getByLabel("Evaluadores de GH", { exact: true }).selectOption([member.id]);
  await page.getByRole("button", { name: "Guardar responsables y edición" }).click();
  await expect(page.getByLabel("Evaluadores de GH", { exact: true })).toHaveValues([member.id]);
  await sinViolaciones(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("combobox", { name: "Macroeventos", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sinViolaciones(page);
});

test("catálogos por macroevento y acceso reservado a ADMIN", async ({ page, browser }) => {
  for (const [slug, count] of [
    ["inventiva", 6],
    ["enfemenino", 7],
    ["dias-eafit", 9],
  ] as const) {
    await page.goto(`/admin/macroeventos/${slug}`);
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(count);
  }
  const context = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
  const memberPage = await context.newPage();
  await memberPage.goto("/admin/macroeventos/inventiva");
  await expect(memberPage).toHaveURL(/\/app$/);
  await context.close();
});
