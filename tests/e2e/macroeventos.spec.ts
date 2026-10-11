import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { event } from "@/modules/events/schema";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { seedEdition } from "../factories";
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
  await seedEdition(macro.id, "equipo-prueba", "Edición del equipo de prueba", {
    startsAt: new Date(`${withinTermInput()}-05:00`),
  });
  await page.goto("/admin/macroeventos");
  await page.getByRole("link", { name: `${t("T-2346")} · EnFemenino` }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("EnFemenino");
  await expect(page.getByLabel(tList("T-2270")[0], { exact: true }).locator("option")).toHaveCount(
    8,
  );
  await page.getByLabel(tList("T-2270")[0], { exact: true }).selectOption("AGENDA_ACADEMICA");
  await page.getByLabel(tList("T-2270")[1], { exact: true }).selectOption(member.id);
  await page.getByLabel(tList("T-2283")[0]).fill("Aval sintético de GH para esta prueba");
  await page.getByRole("button", { name: t("T-2374"), exact: true }).click();
  await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: member.fullName ?? "" })).toBeVisible();
  await page.getByRole("link", { name: tList("T-2375")[1], exact: true }).click();
  await page.getByRole("button", { name: t("T-2349") }).click();
  await page.getByLabel(tList("T-748")[0], { exact: true }).selectOption(member.id);
  await page.getByLabel(tList("T-2376")[1], { exact: true }).check();
  await page.getByLabel(tList("T-2376")[6], { exact: true }).check();
  await page.getByRole("button", { name: tList("T-748")[0], exact: true }).click();
  await expect(page.getByText(t("T-2370", { n: 1, m: 1 }), { exact: true })).toBeVisible();
  await page.getByText(`${t("T-2360")} · ${member.fullName}`, { exact: true }).click();
  await page.getByLabel(t("T-2360"), { exact: true }).selectOption("INSUFFICIENT");
  await page.getByRole("button", { name: t("T-2362") }).click();
  await expect(page).toHaveURL(/error=/);
  if (!(await page.getByLabel(t("T-2360"), { exact: true }).isVisible())) {
    await page.getByText(`${t("T-2360")} · ${member.fullName}`, { exact: true }).click();
  }
  await page.getByLabel(t("T-2360"), { exact: true }).selectOption("GOOD");
  await page.getByRole("button", { name: t("T-2362") }).click();
  await expect(page.getByText(t("T-2370", { n: 1, m: 0 }), { exact: true })).toBeVisible();
  await page.getByLabel(t("T-2364"), { exact: true }).selectOption(member.id);
  await page.getByLabel(t("T-2365"), { exact: true }).selectOption([member.id]);
  const saveLeads = page.getByRole("button", { name: t("T-2363") });
  await saveLeads.click();
  // Los evaluadores muestran lo que la prueba eligió y la URL ya trae `guardado=1` de la
  // evaluación: ninguno espera la acción. Mientras corre, el botón dice «Procesando…»; clicar GAP
  // en ese hueco cruza la navegación con el redirect de la acción y el router puede quedarse en GT.
  await expect(saveLeads).toBeEnabled();
  await expect(page.getByLabel(t("T-2365"), { exact: true })).toHaveValues([member.id]);
  await page.getByRole("link", { name: tList("T-2375")[2], exact: true }).click();
  await page.getByRole("button", { name: t("T-2385") }).click();
  await page.getByLabel(tList("T-748")[0], { exact: true }).selectOption(member.id);
  await page.getByLabel(tList("T-2376")[2], { exact: true }).check();
  await page.getByLabel(t("T-2381"), { exact: true }).check();
  await page.getByRole("button", { name: tList("T-748")[0], exact: true }).click();
  await expect(page.getByText(t("T-2370", { n: 1, m: 0 }), { exact: true })).toBeVisible();
  const teamUrl = page.url();
  await page.goto(`/admin/personas/${member.id}`);
  await expect(
    page.getByText(`GT · ${tList("T-2376")[1]} · EnFemenino`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`GT · ${tList("T-2376")[6]} · EnFemenino`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`GAP · ${tList("T-2376")[2]} · EnFemenino`, { exact: true }),
  ).toBeVisible();
  await page.goto("/app");
  await page.goto(teamUrl);
  await sinViolaciones(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("combobox", { name: t("T-2344"), exact: true })).toBeVisible();
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
