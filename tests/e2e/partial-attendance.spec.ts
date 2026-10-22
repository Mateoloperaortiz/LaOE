import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedOccasion } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/admin.json" });
test.afterEach(closeDb);

for (const scenario of [
  { name: "en el plazo ordinario", list: "FIRST", listLabel: "Lista 1", daysAgo: 1 },
  {
    name: "con presentación y aprobación fuera de plazo",
    list: "SECOND",
    listLabel: "Lista 2",
    daysAgo: 8,
  },
] as const) {
  test(`la consola registra una parcial y el miembro la justifica ${scenario.name} sin perder su asistencia`, async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const [current] = await getDb()
      .select({ id: term.id })
      .from(term)
      .where(eq(term.code, E2E_TERM.code));
    if (!current || !baseURL) throw new Error("Falta el entorno sintético E2E");
    const title = `e2e-Asamblea parcial ${scenario.list}`;
    const startsAt = new Date(Date.now() - scenario.daysAgo * 86_400_000);
    const assembly = await seedOccasion(current.id, {
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      title,
      points: 0,
      status: "CLOSED",
      startsAt,
      checkInOpensAt: new Date(startsAt.getTime() - 3_600_000),
      checkInClosesAt: new Date(startsAt.getTime() + 3_600_000),
    });
    const reason = `Evaluación académica durante la parte faltante ${scenario.list}.`;
    const partialLabel = `Parcial · ${scenario.listLabel}`;

    await page.goto(`/admin/ocasiones/${assembly.id}?q=${encodeURIComponent("Miembro E2E")}`);
    const candidate = page.getByRole("listitem").filter({ hasText: "Miembro E2E" });
    await candidate.getByRole("combobox", { name: t("T-3577") }).selectOption(scenario.list);
    await candidate.getByRole("button", { name: tList("T-598")[1], exact: true }).click();
    await expect(page).toHaveURL(/guardado=1/);
    await page
      .locator("summary")
      .filter({ hasText: t("T-594") })
      .click();
    const registered = page.getByRole("row").filter({ hasText: "Miembro E2E" });
    await expect(registered.getByRole("cell", { name: partialLabel })).toBeVisible();
    await expect(
      registered.getByRole("cell", { name: "Sin presentar", exact: true }),
    ).toBeVisible();
    await sinViolaciones(page);

    const memberContext = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/member.json",
      viewport: { width: 390, height: 844 },
    });
    try {
      const memberPage = await memberContext.newPage();
      await memberPage.goto(`/a/${assembly.publicId}?r=registrado`);
      await expect(memberPage.getByText(t("T-3583", { lista: scenario.listLabel }))).toBeVisible();
      await expect(memberPage.getByText(t("T-037"), { exact: true })).toHaveCount(0);
      await memberPage.screenshot({
        path: test.info().outputPath(`parcial-${scenario.list}-miembro.png`),
        fullPage: true,
      });
      await memberPage.getByRole("link", { name: t("T-3584"), exact: true }).click();
      const form = memberPage.getByRole("form", { name: t("T-1593") });
      await expect(form.locator('[name="occasionId"]')).toHaveValue(assembly.id);
      await form.locator('[name="cause"]').selectOption("ACADEMIC");
      await form.getByLabel(t("T-880"), { exact: true }).fill(reason);
      if (scenario.daysAgo > 3) await form.locator('[name="lateSubmission"]').check();
      await form.getByRole("button", { name: t("T-893"), exact: true }).click();
      await expect(memberPage).toHaveURL(/enviada=1/);
      await expect(memberPage.getByRole("listitem").filter({ hasText: reason })).toContainText(
        tList("T-876")[0],
      );
      await sinViolaciones(memberPage);

      await page.goto(`/admin/ocasiones/${assembly.id}?estado=APPROVED`);
      const pending = page.getByRole("row").filter({ hasText: "Miembro E2E" });
      await expect(pending.getByRole("cell", { name: partialLabel })).toBeVisible();
      await expect(
        pending.getByRole("cell", { name: "Pendiente de revisión", exact: true }),
      ).toBeVisible();
      await page.goto("/admin/solicitudes?tipo=EXCUSE");
      const submitted = page
        .getByRole("row")
        .filter({ hasText: title })
        .filter({ hasText: "Miembro E2E" });
      await submitted.getByRole("link", { name: "Miembro E2E", exact: true }).click();
      const panel = page.getByRole("dialog");
      if (scenario.daysAgo === 1) {
        await panel
          .getByLabel(t("T-1002"), { exact: true })
          .fill("Adjuntá el soporte de la evaluación académica.");
        await panel.getByRole("button", { name: tList("T-1001")[1], exact: true }).click();
        await expect(
          page.getByText(t("T-1008", { estado: tList("T-876")[2].toLowerCase() })),
        ).toBeVisible();
        await memberPage.goto(`/a/${assembly.publicId}?r=puntos`);
        await expect(memberPage.getByText("Excusa: Rechazada", { exact: true })).toBeVisible();
        await expect(
          memberPage.getByText(t("T-3583", { lista: scenario.listLabel })),
        ).toBeVisible();
        await memberPage.getByRole("link", { name: t("T-3584"), exact: true }).click();
        const retry = memberPage.getByRole("form", { name: t("T-1593") });
        await expect(retry.locator('[name="occasionId"]')).toHaveValue(assembly.id);
        await retry.locator('[name="cause"]').selectOption("ACADEMIC");
        await retry.getByLabel(t("T-880"), { exact: true }).fill(`${reason} Soporte corregido.`);
        await retry.getByRole("button", { name: t("T-893"), exact: true }).click();
        await expect(memberPage).toHaveURL(/enviada=1/);
        await page.goto("/admin/solicitudes?tipo=EXCUSE");
        await submitted.getByRole("link", { name: "Miembro E2E", exact: true }).click();
      }
      if (scenario.daysAgo > 3) {
        await panel
          .getByLabel(t("T-3596"), { exact: true })
          .fill("Se acepta la presentación tardía con soporte académico.");
      }
      await panel.getByRole("button", { name: tList("T-1001")[0], exact: true }).click();
      await expect(
        page.getByText(t("T-1008", { estado: tList("T-876")[1].toLowerCase() })),
      ).toBeVisible();

      await page.goto(`/admin/ocasiones/${assembly.id}?estado=EXCUSED`);
      const excused = page.getByRole("row").filter({ hasText: "Miembro E2E" });
      await expect(excused.getByRole("cell", { name: partialLabel })).toBeVisible();
      await expect(excused.getByRole("cell", { name: "Aprobada", exact: true })).toBeVisible();
      await expect(excused.getByText(t("T-3588"), { exact: true })).toHaveCount(0);
      const recent = page.getByRole("region", { name: t("T-603"), exact: true });
      await expect(recent).toContainText("Excusado");
      await expect(recent).not.toContainText("EXCUSED");
      await expect(recent).toContainText(scenario.listLabel);
      await page.screenshot({
        path: test.info().outputPath(`parcial-${scenario.list}-consola.png`),
        fullPage: true,
      });
      await sinViolaciones(page);
      if (scenario.list === "FIRST") {
        await page.setViewportSize({ width: 390, height: 844 });
        expect(
          await excused.evaluate((row) => row.getBoundingClientRect().right),
        ).toBeLessThanOrEqual(390);
        await page.screenshot({
          path: test.info().outputPath("parcial-FIRST-consola-movil.png"),
          fullPage: true,
        });
        await sinViolaciones(page);
      }
      await memberPage.goto(`/a/${assembly.publicId}?r=registrado`);
      await expect(memberPage.getByText(t("T-3585", { lista: scenario.listLabel }))).toBeVisible();
      await expect(memberPage.getByRole("link", { name: t("T-3584"), exact: true })).toHaveCount(0);
      await memberPage.goto("/app/solicitudes?tipo=excusa");
      await expect(
        memberPage.locator(`select[name="occasionId"] option[value="${assembly.id}"]`),
      ).toHaveCount(0);
      await sinViolaciones(memberPage);
    } finally {
      await memberContext.close();
    }
  });
}
