import { expect } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { CALENDAR_LAYERS } from "@/app/admin/_kit/calendar-grid";
import { closeDb, getDb } from "@/db/client";
import { occasion } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tLabels, tList } from "@/shared/copy";
import { seedOccasion } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// El Panorama por rol, el Calendario con sus capas y la ficha de la persona (ADR-169).

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const [juntaTitulo, ghTitulo, , commsTitulo] = tList("T-4922");
const [calendarioTitulo, , mesLabel, , , , , aplicar] = tList("T-4918");
const capas = tLabels("T-4919", CALENDAR_LAYERS);
const [actividadTitulo, propiedadesTitulo, verLinea] = tList("T-4917");

test.afterAll(async () => {
  await getDb().delete(occasion).where(like(occasion.title, "e2e-Calendario%"));
  await closeDb();
});

test("el Panorama de ADMIN trae los bloques de junta, gestión humana y comunicaciones", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-4929"));
  for (const titulo of [juntaTitulo, ghTitulo, commsTitulo]) {
    await expect(page.getByRole("region", { name: titulo, exact: true })).toBeVisible();
  }
  await expect(
    page
      .getByRole("region", { name: juntaTitulo, exact: true })
      .getByText(tList("T-4923")[0] ?? ""),
  ).toBeVisible();
  await sinViolaciones(page);
});

test("el Calendario muestra lo de hoy por semana y por mes, y apaga una capa", async ({ page }) => {
  const [termRow] = await getDb()
    .select({ id: term.id })
    .from(term)
    .where(eq(term.code, E2E_TERM.code));
  if (!termRow) throw new Error("Falta el semestre sintético");
  await seedOccasion(termRow.id, { title: "e2e-Calendario actividad" });
  await seedOccasion(termRow.id, {
    title: "e2e-Calendario asamblea",
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    points: 0,
  });

  await page.goto("/admin/calendario");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(calendarioTitulo ?? "");
  const hoy = page.locator(".admin-calendar-day[data-hoy='true']");
  await expect(hoy.getByRole("link", { name: /e2e-Calendario actividad/ })).toBeVisible();
  await expect(hoy.getByRole("link", { name: /e2e-Calendario asamblea/ })).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: mesLabel, exact: true }).click();
  await expect(page).toHaveURL(/vista=mes/);
  await expect(page.locator(".admin-calendar-day")).toHaveCount(42);
  await expect(
    page
      .locator(".admin-calendar-day[data-hoy='true']")
      .getByText(/e2e-Calendario|más/)
      .first(),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: capas.ACTIVITY, exact: true }).uncheck();
  await page.getByRole("button", { name: aplicar, exact: true }).click();
  await expect(page).toHaveURL(/capas=/);
  await page.goto(`${page.url().replace("vista=mes", "vista=semana")}`);
  const hoySemana = page.locator(".admin-calendar-day[data-hoy='true']");
  await expect(hoySemana.getByRole("link", { name: /e2e-Calendario asamblea/ })).toBeVisible();
  await expect(hoySemana.getByRole("link", { name: /e2e-Calendario actividad/ })).toHaveCount(0);
});

test("la ficha de la persona abre con su actividad reciente y sus propiedades al lado", async ({
  page,
}) => {
  const [member] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) throw new Error("Falta el miembro sintético");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/admin/personas/${member.id}`);
  await expect(page.getByRole("heading", { name: actividadTitulo, exact: true })).toBeVisible();
  const propiedades = page.getByRole("complementary", { name: propiedadesTitulo, exact: true });
  await expect(propiedades).toBeVisible();
  const actividad = page.getByRole("heading", { name: actividadTitulo, exact: true });
  const [centro, lado] = await Promise.all([actividad.boundingBox(), propiedades.boundingBox()]);
  // Desde 1280 px las propiedades van a la derecha de la actividad.
  expect((lado?.x ?? 0) > (centro?.x ?? 0)).toBe(true);
  await page.getByRole("link", { name: verLinea, exact: true }).click();
  await expect(page).toHaveURL(/pestana=linea/);
});
