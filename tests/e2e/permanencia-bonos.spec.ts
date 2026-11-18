import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { person } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { seedRule, seedTerm } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("GH completa dos criterios con un bono y el miembro ve el motivo en Mi OE", async ({
  page,
  browser,
}) => {
  const [member] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) throw new Error("sin miembro E2E");
  const termId = await seedTerm(E2E_TERM.code);
  const barra = "e2e-Barra brava";
  const macro = "e2e-GT Macroeventos";
  await seedRule(termId, "e2e-bono-barra", {
    label: barra,
    weight: 7,
    computation: "CHECKIN_THRESHOLD",
    params: { category: "ATHLETIC_MATCH", minCount: 3 },
  });
  await seedRule(termId, "e2e-bono-macro", {
    label: macro,
    weight: 3,
    computation: "GROUP_EVALUATED",
    params: { groupKind: "GT_MACROEVENT", mode: "FIXED", code: "E2E-BONO" },
  });
  await closeDb();

  await page.goto(`/admin/permanencia/cumplimiento?termId=${termId}`);
  const addBonus = page.getByRole("link", { name: t("T-4860"), exact: true });
  await addBonus.click();
  const panel = page.getByRole("dialog");
  const close = panel.getByRole("button", { name: t("T-291"), exact: true });
  const choosePerson = async () => {
    await panel.getByLabel(t("T-4861")).selectOption(member.id);
    await panel.getByRole("button", { name: t("T-4862") }).click();
  };
  let finish = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const preview = (url: URL) =>
    url.pathname === "/admin/permanencia/cumplimiento" &&
    url.searchParams.get("persona") === member.id;
  await page.route(preview, async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await choosePerson();
    await expect(close).toBeDisabled();
  } finally {
    finish();
  }
  await expect(panel.getByRole("link", { name: t("T-4882") })).toBeVisible();
  await expect(close).toBeEnabled();
  await close.click();
  await expect(panel).toBeHidden();
  await page.unroute(preview);
  await addBonus.click();
  await choosePerson();
  await panel.getByRole("checkbox", { name: new RegExp(barra) }).check();
  await panel.getByRole("checkbox", { name: new RegExp(macro) }).check();
  await expect(panel.getByRole("status")).toHaveText(t("T-4864", { n: 10 }));
  const total = panel.getByRole("textbox", { name: t("T-4868") });
  const reason = "Ayudó a decorar toda la semana";
  await panel.getByLabel(t("T-4869")).fill(reason);
  const save = panel.getByRole("button", { name: t("T-4874") });
  for (const amount of ["5", "12"]) {
    await total.fill(amount);
    await expect(save).toBeDisabled();
    await expect(panel.getByText(t("T-4865", { n: 10 }))).toBeVisible();
  }
  await total.fill("10");
  await sinViolaciones(page);
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: t("T-4875") })).toBeVisible();

  const memberContext = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(`/app/permanencia?semestre=${termId}`);
  for (const [label, value] of [
    [barra, 7],
    [macro, 3],
  ] as const) {
    const criterion = memberPage.getByRole("listitem").filter({ hasText: label });
    await expect(criterion.getByText(t("T-4876", { n: value }))).toBeVisible();
    await expect(criterion.getByText(reason)).toBeVisible();
  }
  await sinViolaciones(memberPage);
  await memberPage.goto(
    `/admin/permanencia/cumplimiento?termId=${termId}&bono=1&persona=${member.id}`,
  );
  await expect(memberPage).toHaveURL(/\/app$/);
});
