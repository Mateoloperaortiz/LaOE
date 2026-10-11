import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { pipeline } from "@/modules/crm/schema";
import { form } from "@/modules/forms/schema";
import { committee } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { seedCommittee, seedForm, seedPipeline } from "../factories";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("menú móvil: foco contenido, Escape, retorno y cierre al navegar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: t("T-1541"), exact: true });
  const menu = page.getByRole("dialog", { name: t("T-1540") });
  const header = page.locator(".portal-header");
  expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(
    100,
  );
  await expect(header.getByRole("link", { name: t("T-004") })).toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("link", { name: tList("T-038")[0], exact: true })).toBeFocused();
  await menu.getByRole("button", { name: t("T-1542") }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    menu.getByRole("button", {
      name: new RegExp(copyPattern("T-034").source.split(" · ").join("|")),
    }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("button", { name: t("T-1542") })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("link", { name: tList("T-038")[4], exact: true }).click();
  await expect(page).toHaveURL(/\/comites$/);
  await expect(menu).not.toBeVisible();
  await trigger.click();
  await expect(menu.locator('[aria-current="page"]')).toHaveText(tList("T-038")[4]);
  await sinViolaciones(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(menu).not.toBeVisible();
  await expect(
    page.getByRole("navigation", { name: t("T-1540") }).locator('[aria-current="page"]'),
  ).toHaveText(tList("T-038")[4]);
});

test("comités: busca nombre sin tildes y sigla, limpia y conserva la búsqueda al volver", async ({
  page,
}) => {
  const db = getDb();
  const slug = `e2e-explora-${randomBytes(4).toString("hex")}`;
  const name = `Comité de Exploración ${slug}`;
  const fixture = { id: await seedCommittee(slug, name) };
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/comites");
    const search = page.getByRole("search", { name: t("T-1544") });
    await search.getByRole("searchbox").fill(`exploracion ${slug}`);
    await search.getByRole("button", { name: t("T-1545"), exact: true }).click();
    await expect(page).toHaveURL(/q=exploracion/);
    const result = page.getByRole("list", { name: t("T-309") });
    await expect(result.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("status")).toContainText(copyPattern("T-1547", { n: 1 }));
    await result.getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await page.goBack();
    await expect(search.getByRole("searchbox")).toHaveValue(`exploracion ${slug}`);
    await search.getByRole("searchbox").fill(slug.toUpperCase());
    await search.getByRole("button", { name: t("T-1545"), exact: true }).click();
    await expect(result.getByRole("listitem")).toHaveCount(1);
    await search.getByRole("searchbox").fill("no-hay-coincidencias-ux-portal");
    await search.getByRole("button", { name: t("T-1545"), exact: true }).click();
    await expect(page.getByText(copyPattern("T-1550"))).toBeVisible();
    await expect(page.getByRole("status")).toContainText(copyPattern("T-1547", { n: 0 }));
    await search.getByRole("link", { name: t("T-1474") }).click();
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
    await expect(page.getByRole("main").getByRole("link", { name: t("T-1543") })).toHaveAttribute(
      "href",
      "/unirse",
    );
    await page.goto("/unirse");
    await expect(page.getByText(copyPattern("T-1548"))).toBeVisible();
    await expect(page.getByText(copyPattern("T-868"))).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("link", { name: t("T-317") })).toHaveAttribute(
      "href",
      "/eventos",
    );
    const prospectSlug = `${prefix}-prospecto`;
    const prospect = {
      id: await seedForm(prospectSlug, {
        title: "Interés sintético en la OE",
        status: "OPEN",
        actions: { createPerson: true },
      }),
      slug: prospectSlug,
    };
    createdForms.push(prospect.id);
    await page.reload();
    await expect(page.getByRole("link", { name: t("T-868") })).toHaveAttribute(
      "href",
      `/f/${prospect.slug}`,
    );
    pipelineId = (await seedPipeline(prefix, "ADMISSION", [])).id;
    const admissionSlug = `${prefix}-admision`;
    const admission = {
      id: await seedForm(admissionSlug, {
        title: "Admisión sintética a la OE",
        status: "OPEN",
        actions: { createPerson: true, pipelineId },
      }),
      slug: admissionSlug,
    };
    createdForms.push(admission.id);
    await page.reload();
    await expect(page.getByRole("link", { name: t("T-027"), exact: true })).toHaveAttribute(
      "href",
      `/f/${admission.slug}`,
    );
    await expect(page.getByRole("link", { name: t("T-868") })).toHaveCount(0);
    await page.goto("/");
    await expect(
      page.getByRole("main").getByRole("link", { name: t("T-027"), exact: true }),
    ).toHaveAttribute("href", `/f/${admission.slug}`);
    // Una ventana vencida no debe ofrecer la admisión aunque su estado siga OPEN.
    await db
      .update(form)
      .set({ closesAt: new Date(Date.now() - 60_000) })
      .where(eq(form.id, admission.id));
    await page.reload();
    await expect(page.getByRole("main").getByRole("link", { name: t("T-1543") })).toHaveAttribute(
      "href",
      "/unirse",
    );
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
        await page.getByRole("button", { name: t("T-1541"), exact: true }).click();
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
      .getByRole("navigation", { name: t("T-1540") })
      .getByRole("link", { name: tList("T-038")[4], exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("sin-resultados-zoom");
  await page.getByRole("button", { name: t("T-1545"), exact: true }).click();
  await expect(page.getByRole("status")).toContainText(copyPattern("T-1547", { n: 0 }));
  await sinViolaciones(page);
});
