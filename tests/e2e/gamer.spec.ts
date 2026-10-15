import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { setGamificationEnabledAs } from "@/modules/participation";
import { adjustPointsAs } from "@/modules/participation/domain/commands";
import { creditGame } from "@/modules/participation/domain/ledger";
import { membership, person } from "@/modules/people/schema";
import { lockOpenTermPoints } from "@/modules/terms";
import { t } from "@/shared/copy";
import { APP_TIME_ZONE, addDays, dateKeyIn } from "@/shared/lib/dates-pure";
import { seedWordleGame } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/member.json" });
test.afterAll(closeDb);

async function seedGamerHistory() {
  const [member] = await getDb()
    .select({ personId: person.id, termId: membership.firstTermId })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) throw new Error("Falta la identidad sintética de miembro");
  const today = dateKeyIn(APP_TIME_ZONE, new Date());
  for (const offset of [0, 1, 2]) {
    const runId = await seedWordleGame(member.personId, member.termId, addDays(today, -offset), {
      status: "WON",
    });
    await runCommand({ personId: member.personId, ip: null }, async (ctx) => {
      await lockOpenTermPoints(ctx.tx, member.termId);
      await creditGame(ctx, {
        personId: member.personId,
        termId: member.termId,
        game: "WORDLE",
        runId,
        points: 6,
        reason: "Victoria histórica sintética",
      });
    });
  }
  await adjustPointsAs(
    { personId: member.personId, ip: null },
    {
      personId: member.personId,
      termId: member.termId,
      points: 20,
      reason: "Participación GH sintética",
    },
  );
  return member;
}

test("la historia del semestre vive en gamer, muestra sus hitos y conserva GH separado en móvil y escritorio", async ({
  page,
}) => {
  const member = await seedGamerHistory();
  await setGamificationEnabledAs({ personId: member.personId, ip: null }, true);

  await page.goto("/app/juegos");
  await expect(page.getByRole("heading", { name: t("T-3400"), exact: true })).toBeVisible();
  await expect(page.getByText(t("T-3413", { n: 3 }), { exact: true })).toHaveCount(2);
  await expect(page.getByText(t("T-3421", { n: 3 }), { exact: true })).toBeVisible();
  await expect(page.getByText(t("T-3422", { n: 7 }), { exact: true })).toBeVisible();
  await expect(page.getByText(t("T-3409", { n: 1 }), { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("table").getByRole("row").last()).toContainText("3");
  await sinViolaciones(page);
  await page.screenshot({ path: ".impeccable/review/gamer-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await sinViolaciones(page);
  await page.screenshot({ path: ".impeccable/review/gamer-mobile.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await sinViolaciones(page);

  await page.goto("/app/gh-points");
  await expect(page.getByRole("heading", { name: t("T-081", { n: 20 }) })).toBeVisible();
  await expect(page.getByText("Victoria histórica sintética")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: t("T-3440") })).toBeVisible();
  await page.getByText(t("T-3435"), { exact: true }).click();
  await expect(page.getByText(t("T-3436", { n: 25 }), { exact: true })).toBeVisible();
  await sinViolaciones(page);
});

test("las rachas esperan el lanzamiento y siguen activas después de apagar los retos", async ({
  page,
  browser,
}) => {
  await seedGamerHistory();
  await page.goto("/app/juegos");
  await expect(page.getByText(t("T-3461"), { exact: true })).toBeVisible();
  await expect(page.getByText(t("T-3421", { n: 3 }), { exact: true })).toHaveCount(0);
  await expect(page.getByText(t("T-3413", { n: 3 }), { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table").getByRole("row").last()).toContainText("3");
  await page.screenshot({ path: ".impeccable/review/gamer-prepared-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await sinViolaciones(page);
  await page.screenshot({ path: ".impeccable/review/gamer-prepared-mobile.png", fullPage: true });
  await page.goto("/app/gh-points");
  await expect(page.getByText(t("T-3462"), { exact: true })).toBeVisible();
  await expect(page.getByText(t("T-3449"), { exact: true })).toHaveCount(0);

  const context = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
  const admin = await context.newPage();
  await admin.goto("/admin/gamificacion/limites");
  await expect(admin.getByText(t("T-3464"), { exact: true })).toBeVisible();
  await expect(admin.getByText(t("T-3463"), { exact: true })).toBeVisible();
  await admin.getByLabel(t("T-2552")).check();
  await admin.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(admin.getByText(t("T-2554"), { exact: true })).toBeVisible();

  await page.goto("/app/juegos");
  await expect(page.getByText(t("T-3421", { n: 3 }), { exact: true })).toBeVisible();
  await expect(page.getByText(t("T-3461"), { exact: true })).toHaveCount(0);
  await admin.goto("/admin/gamificacion/limites");
  await admin.getByLabel(t("T-2552")).uncheck();
  await admin.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(admin.getByText(t("T-2554"), { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(t("T-3421", { n: 3 }), { exact: true })).toBeVisible();
  await page.goto("/app/gh-points");
  await expect(page.getByText(t("T-3462"), { exact: true })).toHaveCount(0);
  await expect(page.getByText(t("T-3449"), { exact: true })).toBeVisible();
  await sinViolaciones(page);
});
