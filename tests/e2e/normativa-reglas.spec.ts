import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { event } from "@/modules/events/schema";
import { addMacroeventDirector } from "@/modules/people/domain/appointments";
import { getMacroeventGovernance } from "@/modules/people/domain/macroevent-governance";
import { person } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { seedEdition, seedMember, seedTerm } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("verifica los cargos y conserva el corte anual desde la ficha de normativa", async ({
  page,
  browser,
}) => {
  const [macro] = await getDb().select().from(event).where(eq(event.slug, "inventiva"));
  if (!macro) throw new Error("Falta el evento sintético");
  const day = todayKey();
  const year = Number(day.slice(0, 4));
  const termId = await seedTerm();
  const editionId = await seedEdition(macro.id, "normativa-prueba", "Edición normativa de prueba", {
    startsAt: new Date(`${day}T15:00:00Z`),
  });
  const ids = [];
  for (const [index, roleCode] of (["GENERAL", "LOGISTICA"] as const).entries()) {
    const personId = await seedMember(`normativa-cargo-${index}@example.com`);
    await getDb()
      .update(person)
      .set({ firstName: "Integrante", lastName: `normativo ${index}` })
      .where(eq(person.id, personId));
    const appointment = await runCommand(SYSTEM_ACTOR, (ctx) =>
      addMacroeventDirector(
        ctx,
        { termId, editionId, personId, roleCode },
        { reason: "Aval sintético para la prueba" },
      ),
    );
    ids.push(appointment.id);
  }
  await page.goto(`/admin/macroeventos/inventiva/normativa?year=${year}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-4800"));
  await expect(page.getByText(t("T-4817", { n: 2 }))).toBeVisible();
  for (const [index, id] of ids.entries()) {
    const details = page.locator("details").filter({
      has: page.locator("summary").filter({ hasText: `Integrante normativo ${index}` }),
    });
    await details.locator("summary").click();
    await page.locator(`#origin-${id}`).selectOption("ELECTED");
    await page.locator(`#minutes-${id}`).fill("Acta sintética de elección");
    await page.locator(`#requirements-${id}`).check();
    await page.locator(`#experience-${id}`).selectOption("VERIFIED");
    if (index === 0) {
      await page.locator(`#faculty-${id}`).check();
      await page.locator(`#late-${id}`).check();
      await page.locator(`#permission-${id}`).fill("Acta sintética de permiso calificado");
      await page.locator(`#extraordinary-${id}`).check();
      await page.locator(`#plan-${id}`).fill("Plan sintético de elección extraordinaria");
    }
    const [request] = await Promise.all([
      page.waitForRequest(
        (request) => request.method() === "POST" && request.url().includes("/normativa"),
      ),
      details.getByRole("button", { name: t("T-4829"), exact: true }).click(),
    ]);
    await expect(details.locator("summary")).toContainText("Electo por la Asamblea");
    if (index === 0) {
      const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const headers = request.headers();
      const denied = await anonymous.request.post(request.url(), {
        headers: {
          "content-type": headers["content-type"] ?? "",
          "next-action": headers["next-action"] ?? "",
          origin: new URL(page.url()).origin,
        },
        data: request.postDataBuffer() ?? undefined,
        maxRedirects: 0,
      });
      expect(denied.headers()["x-action-redirect"] ?? denied.headers().location).toContain(
        "/ingresar",
      );
      await anonymous.close();
      await page.reload();
      await expect(page.locator(`#late-${id}`)).toBeChecked();
      await expect(page.locator(`#permission-${id}`)).toHaveValue(
        "Acta sintética de permiso calificado",
      );
      await expect(page.locator(`#extraordinary-${id}`)).toBeChecked();
      await expect(page.locator(`#plan-${id}`)).toHaveValue(
        "Plan sintético de elección extraordinaria",
      );
    }
    await expect(details.locator("summary")).toContainText("Electo por la Asamblea");
  }
  await expect(page.getByText(t("T-4815", { n: 2, mínimo: 2 }))).toBeVisible();
  await page.getByLabel(t("T-4831"), { exact: true }).fill(day);
  await page
    .getByLabel(t("T-4833"), { exact: true })
    .fill("Acta sintética del corte posterior a elecciones");
  await page.getByLabel(t("T-4832"), { exact: true }).check();
  await page.getByRole("button", { name: t("T-4830"), exact: true }).click();
  await expect(page.getByRole("heading", { name: "Habilitado", exact: true })).toBeVisible();
  expect((await getMacroeventGovernance(macro.id, year)).review?.electedRoles).toEqual([
    "GENERAL",
    "LOGISTICA",
  ]);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await sinViolaciones(page);
  }
});

test("la revisión institucional y sus acciones exigen ADMIN", async ({ page, browser }) => {
  await page.goto("/admin/macroeventos/inventiva/normativa");
  const context = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
  const member = await context.newPage();
  await member.goto("/admin/macroeventos/inventiva/normativa");
  await expect(member).toHaveURL(/\/app$/);
  await context.close();
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const response = await anonymous.request.get(page.url(), { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/ingresar");
  await anonymous.close();
});
