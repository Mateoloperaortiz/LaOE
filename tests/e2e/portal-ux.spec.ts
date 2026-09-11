import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { pipeline } from "@/modules/crm/schema";
import { form } from "@/modules/forms/schema";
import { committee } from "@/modules/people/schema";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("menú móvil: foco contenido, Escape, retorno y cierre al navegar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Menú", exact: true });
  const menu = page.getByRole("dialog", { name: "Navegación del portal" });
  const header = page.locator(".portal-header");
  expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
    100,
  );
  await expect(header.getByRole("link", { name: "Entrá a Mi OE" })).toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("link", { name: "Inicio", exact: true })).toBeFocused();
  await menu.getByRole("button", { name: "Cerrar menú" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(menu.getByRole("button", { name: /Cambiar a tema/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("button", { name: "Cerrar menú" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("link", { name: "Comités", exact: true }).click();
  await expect(page).toHaveURL(/\/comites$/);
  await expect(menu).not.toBeVisible();
  await trigger.click();
  await expect(menu.locator('[aria-current="page"]')).toHaveText("Comités");
  await sinViolaciones(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(menu).not.toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Navegación del portal" })
      .locator('[aria-current="page"]'),
  ).toHaveText("Comités");
});

test("comités: busca nombre sin tildes y sigla, limpia y conserva la búsqueda al volver", async ({
  page,
}) => {
  const db = getDb();
  const slug = `e2e-explora-${randomBytes(4).toString("hex")}`;
  const name = `Comité de Exploración ${slug}`;
  const [fixture] = await db
    .insert(committee)
    .values({ slug, name, status: "ACTIVE", publicationStatus: "PUBLISHED" })
    .returning();
  if (!fixture) throw new Error("No se creó el comité sintético");
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/comites");
    const search = page.getByRole("search", { name: "Buscá un comité" });
    await search.getByRole("searchbox").fill(`exploracion ${slug}`);
    await search.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/q=exploracion/);
    const result = page.getByRole("list", { name: "Comités" });
    await expect(result.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("status")).toContainText("Comités: 1 de");
    await result.getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await page.goBack();
    await expect(search.getByRole("searchbox")).toHaveValue(`exploracion ${slug}`);
    await search.getByRole("searchbox").fill(slug.toUpperCase());
    await search.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(result.getByRole("listitem")).toHaveCount(1);
    await search.getByRole("searchbox").fill("no-hay-coincidencias-ux-portal");
    await search.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByText(/No encontramos comités con ese nombre o sigla/)).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Comités: 0 de");
    await search.getByRole("link", { name: "Limpiar búsqueda" }).click();
    await expect(page).toHaveURL(/\/comites$/);
    await expect(search.getByRole("searchbox")).toHaveValue("");
    await expect(result.getByRole("link", { name: new RegExp(slug, "i") })).toBeVisible();
    await sinViolaciones(page);
  } finally {
    await db.delete(committee).where(eq(committee.id, fixture.id));
    await closeDb();
  }
});

test("el hero y Unirse reflejan convocatoria cerrada, prospecto y admisión vigente", async ({
  page,
}) => {
  const db = getDb();
  const original = await db
    .select({ id: form.id, updatedAt: form.updatedAt })
    .from(form)
    .where(and(eq(form.status, "OPEN"), eq(form.audience, "PUBLIC")));
  const prefix = `e2e-portal-ux-${randomBytes(4).toString("hex")}`;
  const createdForms: string[] = [];
  let pipelineId: string | undefined;
  try {
    if (original.length)
      await db
        .update(form)
        .set({ status: "CLOSED" })
        .where(
          inArray(
            form.id,
            original.map((item) => item.id),
          ),
        );
    await page.goto("/");
    await expect(
      page.getByRole("main").getByRole("link", { name: "Unite a la OE" }),
    ).toHaveAttribute("href", "/unirse");
    await page.goto("/unirse");
    await expect(page.getByText(/Cuando haya una nueva, vas a encontrarla acá/)).toBeVisible();
    await expect(page.getByText(/Dejanos tu correo/)).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("link", { name: "Ver todos los eventos" }),
    ).toHaveAttribute("href", "/eventos");
    const [prospect] = await db
      .insert(form)
      .values({
        slug: `${prefix}-prospecto`,
        title: "Interés sintético en la OE",
        status: "OPEN",
        actions: { createPerson: true },
      })
      .returning();
    if (!prospect) throw new Error("No se creó el formulario de prospecto");
    createdForms.push(prospect.id);
    await page.reload();
    await expect(page.getByRole("link", { name: "Dejanos tu correo" })).toHaveAttribute(
      "href",
      `/f/${prospect.slug}`,
    );
    const [flow] = await db
      .insert(pipeline)
      .values({ name: prefix, kind: "ADMISSION" })
      .returning();
    if (!flow) throw new Error("No se creó el pipeline de admisión");
    pipelineId = flow.id;
    const [admission] = await db
      .insert(form)
      .values({
        slug: `${prefix}-admision`,
        title: "Admisión sintética a la OE",
        status: "OPEN",
        actions: { createPerson: true, pipelineId },
      })
      .returning();
    if (!admission) throw new Error("No se creó el formulario de admisión");
    createdForms.push(admission.id);
    await page.reload();
    await expect(page.getByRole("link", { name: "Postulate", exact: true })).toHaveAttribute(
      "href",
      `/f/${admission.slug}`,
    );
    await expect(page.getByRole("link", { name: "Dejanos tu correo" })).toHaveCount(0);
    await page.goto("/");
    await expect(
      page.getByRole("main").getByRole("link", { name: "Postulate", exact: true }),
    ).toHaveAttribute("href", `/f/${admission.slug}`);
    // Una ventana vencida no debe ofrecer la admisión aunque su estado siga OPEN.
    await db
      .update(form)
      .set({ closesAt: new Date(Date.now() - 60_000) })
      .where(eq(form.id, admission.id));
    await page.reload();
    await expect(
      page.getByRole("main").getByRole("link", { name: "Unite a la OE" }),
    ).toHaveAttribute("href", "/unirse");
    await sinViolaciones(page);
  } finally {
    if (createdForms.length) await db.delete(form).where(inArray(form.id, createdForms));
    if (pipelineId) await db.delete(pipeline).where(eq(pipeline.id, pipelineId));
    for (const item of original)
      await db
        .update(form)
        .set({ status: "OPEN", updatedAt: item.updatedAt })
        .where(eq(form.id, item.id));
    await closeDb();
  }
});

for (const width of [360, 390, 768, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`portal adaptable: ${width}px ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem("oe-tema", value), theme);
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (width < 640) {
        const hero = page.locator(".portal-hero");
        expect(
          await hero.evaluate((element) => element.getBoundingClientRect().bottom),
        ).toBeLessThan(630);
      }
      await sinViolaciones(page);
      await page.screenshot({
        path: testInfo.outputPath(`portal-inicio-${width}-${theme}.png`),
        fullPage: true,
      });
      await page.screenshot({
        path: testInfo.outputPath(`portal-portada-${width}-${theme}.png`),
      });
      if (width < 1024) {
        await page.getByRole("button", { name: "Menú", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await sinViolaciones(page);
        await page.screenshot({ path: testInfo.outputPath(`portal-menu-${width}-${theme}.png`) });
      }
    });
  }
}

test("portal con texto al 200 % mantiene navegación y búsqueda accesibles", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/comites");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(
    page
      .getByRole("navigation", { name: "Navegación del portal" })
      .getByRole("link", { name: "Comités", exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("sin-resultados-zoom");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Comités: 0 de");
  await sinViolaciones(page);
});
