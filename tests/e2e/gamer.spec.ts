import { expect, type Page } from "@playwright/test";
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
import { seedMembership, seedPerson, seedWordleGame } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/member.json" });
test.afterAll(closeDb);

async function seedGamerCredits(personId: string, termId: string, days: number, answer = "PRUEB") {
  const today = dateKeyIn(APP_TIME_ZONE, new Date());
  for (let offset = 0; offset < days; offset += 1) {
    const runId = await seedWordleGame(personId, termId, addDays(today, -offset), {
      status: "WON",
      answer,
    });
    await runCommand({ personId, ip: null }, async (ctx) => {
      await lockOpenTermPoints(ctx.tx, termId);
      await creditGame(ctx, {
        personId,
        termId,
        game: "WORDLE",
        runId,
        points: 6,
        reason: "Victoria histórica sintética",
      });
    });
  }
}

async function seedPodiumPeer(
  termId: string,
  suffix: string,
  days: number,
  answer: string,
  longName = false,
) {
  const personId = await seedPerson(`podio-${suffix}@example.test`, {
    firstName: longName ? "Persona sintética con nombre compuesto extenso" : `Persona ${suffix}`,
    lastName: "de prueba del podio",
  });
  await seedMembership(personId, termId);
  await seedGamerCredits(personId, termId, days, answer);
}

async function seedGamerHistory() {
  const [member] = await getDb()
    .select({ personId: person.id, termId: membership.firstTermId })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) throw new Error("Falta la identidad sintética de miembro");
  await seedGamerCredits(member.personId, member.termId, 3);
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
  const ranking = page.getByRole("table", { name: t("T-3425") });
  await expect(ranking.getByRole("row")).toHaveCount(2);
  await expect(ranking.getByRole("columnheader", { name: t("T-3477") })).toBeVisible();
  await expect(ranking.getByRole("row").last().getByRole("cell").nth(1)).toHaveText("18");
  await expect(ranking.getByRole("row").last().getByRole("cell").nth(2)).toHaveText("3");
  await expect(
    page.getByRole("region", { name: t("T-3400"), exact: true }).getByText("18", { exact: true }),
  ).toBeVisible();
  await sinViolaciones(page);
  await page.screenshot({ path: ".impeccable/review/podio-gamer/uno-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await sinViolaciones(page);
  await page.screenshot({ path: ".impeccable/review/podio-gamer/uno-mobile.png", fullPage: true });
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
  const ranking = page.getByRole("table", { name: t("T-3425") });
  await expect(ranking.getByRole("row").last().getByRole("cell").nth(1)).toHaveText("18");
  await expect(ranking.getByRole("row").last().getByRole("cell").nth(2)).toHaveText("3");
  await page.screenshot({
    path: ".impeccable/review/podio-gamer/preparado-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await sinViolaciones(page);
  await page.screenshot({
    path: ".impeccable/review/podio-gamer/preparado-mobile.png",
    fullPage: true,
  });
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

async function capturePodium(
  page: Page,
  name: string,
  width: number,
  colorScheme: "light" | "dark",
) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await sinViolaciones(page);
  await page.screenshot({ path: `.impeccable/review/podio-gamer/${name}.png`, fullPage: true });
  if (name === "tres-1280-light" || name === "tres-360-light") {
    await page
      .getByRole("region", { name: t("T-3549"), exact: true })
      .screenshot({ path: `.impeccable/review/podio-gamer/${name}-podio.png` });
  }
}

test("el podio conserva puestos reales, todos los empatados visibles y la clasificación completa", async ({
  page,
}) => {
  await page.goto("/app/juegos");
  await expect(page.getByRole("region", { name: t("T-3549"), exact: true })).toHaveCount(0);
  await capturePodium(page, "vacio-desktop", 1280, "light");

  const member = await seedGamerHistory();
  await seedPodiumPeer(member.termId, "segundo", 2, "CASAS");
  await page.reload();
  const podium = page.getByRole("region", { name: t("T-3549"), exact: true });
  const positions = podium.getByRole("heading", { level: 4 });
  await expect(positions).toHaveCount(2);
  await expect(
    podium.getByRole("heading", { name: t("T-3407", { n: 3 }), exact: true }),
  ).toHaveCount(0);
  await capturePodium(page, "dos-mobile", 360, "light");

  await seedPodiumPeer(member.termId, "tercero", 1, "PERRO");
  await page.reload();
  await expect(positions).toHaveCount(3);
  await expect(positions.nth(0)).toHaveAccessibleName(t("T-3407", { n: 1 }));
  await expect(positions.nth(1)).toHaveAccessibleName(t("T-3407", { n: 2 }));
  await expect(positions.nth(2)).toHaveAccessibleName(t("T-3407", { n: 3 }));
  await expect(podium.locator('[aria-current="true"]')).toHaveCount(1);
  const schemes: ("light" | "dark")[] = ["light", "dark"];
  for (const width of [1280, 360]) {
    for (const scheme of schemes) {
      await capturePodium(page, `tres-${width}-${scheme}`, width, scheme);
    }
  }

  await seedPodiumPeer(member.termId, "empate", 3, "LUNES", true);
  await page.reload();
  await expect(positions).toHaveCount(2);
  await expect(positions.nth(0)).toHaveAccessibleName(t("T-3407", { n: 1 }));
  await expect(positions.nth(1)).toHaveAccessibleName(t("T-3407", { n: 3 }));
  await expect(
    podium.getByRole("list", { name: t("T-3407", { n: 1 }), exact: true }).getByRole("listitem"),
  ).toHaveCount(2);
  await expect(
    podium.getByText("Persona sintética con nombre compuesto extenso de prueba del podio"),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: t("T-3425") }).getByRole("row")).toHaveCount(5);
  await capturePodium(page, "empate-desktop", 1280, "dark");
  await capturePodium(page, "empate-mobile", 360, "light");

  const answers = ["CANTO", "NUBES", "PAPEL", "RADIO", "MARCA", "TARDE", "FUEGO", "LIBRO"];
  for (const [i, answer] of answers.entries()) {
    await seedPodiumPeer(member.termId, `empate-${i}`, 3, answer);
  }
  await page.reload();
  await expect(positions).toHaveCount(1);
  await expect(positions).toHaveAccessibleName(t("T-3407", { n: 1 }));
  await expect(
    podium.getByRole("list", { name: t("T-3407", { n: 1 }), exact: true }).getByRole("listitem"),
  ).toHaveCount(10);
  await expect(podium.getByText(t("T-3551"), { exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: t("T-3425") }).getByRole("row")).toHaveCount(11);
  await capturePodium(page, "diez-desktop", 1280, "light");
  await capturePodium(page, "diez-mobile", 360, "dark");
});
