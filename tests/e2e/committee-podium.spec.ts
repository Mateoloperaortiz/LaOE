import { mkdir } from "node:fs/promises";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { committeeParticipation } from "@/modules/participation/schema";
import { committee } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { seedCommittee, seedOccasion, seedTerm } from "../factories";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });

// Snapshots sintéticos para comprobar porcentajes y puestos en la página real.
async function seedRanking(scores: number[]) {
  const db = getDb();
  const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("sin término sintético");
  await db.delete(committeeParticipation).where(eq(committeeParticipation.termId, current.id));
  const names = [
    "ALFA",
    "BETA",
    "GAMMA",
    "DELTA",
    "EPSILON",
    "ZETA",
    "ETA",
    "THETA",
    "IOTA",
    "KAPPA",
    "LAMBDA",
  ];
  const committees = [];
  for (const [i, score] of scores.entries()) {
    const name = names[i];
    if (!name) throw new Error("faltan nombres sintéticos para el ranking");
    const id = await seedCommittee(`e2e-podium-${i}`, name, { publicationStatus: "DRAFT" });
    committees.push({ id, name, score });
  }
  for (const index of [0, 1, 2]) {
    const startsAt = new Date(`${current.startsOn}T12:00:00-05:00`);
    const activity = await seedOccasion(current.id, {
      publicId: `podium000${index}`,
      title: `e2e-podio-actividad-${index}`,
      startsAt,
      checkInOpensAt: startsAt,
      checkInClosesAt: new Date(startsAt.getTime() + 3_600_000),
      status: index === 2 ? "OPEN" : "CLOSED",
      points: index === 0 ? 10 : 100,
    });
    await db.insert(committeeParticipation).values(
      committees.map((item) => ({
        occasionId: activity.id,
        committeeId: item.id,
        termId: current.id,
        eligible: 10_000,
        present: Math.round((item.score + 0.0012) * 10_000),
        rate: item.score + 0.0012,
        smoothedRate: index === 2 ? 1 : item.score,
        frozenAt: index === 2 ? null : startsAt,
      })),
    );
  }
  return { current, committees };
}

test("porcentajes calculados del semestre, top diez, detalle por teclado y cambio de semestre", async ({
  page,
}) => {
  const { current } = await seedRanking([
    0.0418, 0.0143, 0.0127, 0.0116, 0.0107, 0.0096, 0.0076, 0.0067, 0.0056, 0.0052, 0.004,
  ]);
  await page.goto(`/app/gh-points?tablero=comites&semestre=${current.id}`);
  const podium = page.getByRole("region", { name: t("T-2600"), exact: true });
  await expect(podium.getByRole("button", { name: copyPattern("T-2603") })).toHaveCount(10);
  const first = podium.getByRole("group", { name: t("T-2604", { n: 1 }), exact: true });
  const second = podium.getByRole("group", { name: t("T-2604", { n: 2 }), exact: true });
  const third = podium.getByRole("group", { name: t("T-2604", { n: 3 }), exact: true });
  await expect(first).toContainText(/4,18\s*%/);
  await expect(second).toContainText(/1,43\s*%/);
  await expect(third).toContainText(/1,27\s*%/);
  const [one, two, three] = await Promise.all([
    first.boundingBox(),
    second.boundingBox(),
    third.boundingBox(),
  ]);
  expect(
    one && two && three && two.x < one.x && one.x < three.x && one.y < two.y && two.y < three.y,
  ).toBeTruthy();
  const trigger = first.getByRole("button");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(
    podium.getByRole("heading", { name: t("T-2606", { comité: "ALFA", puesto: 1 }) }),
  ).toBeFocused();
  const detail = podium.getByRole("region", { name: t("T-2606", { comité: "ALFA", puesto: 1 }) });
  await expect(detail).toContainText(/4,30\s*%/);
  await expect(detail).toContainText(copyPattern("T-2609", { n: "-0,12" }));
  await expect(detail.locator("dd").last()).toHaveText("2");
  await detail.getByRole("button", { name: t("T-2607") }).click();
  await expect(trigger).toBeFocused();
  await expect(detail).toBeHidden();
  await podium.getByRole("button", { name: copyPattern("T-2603", { comité: "DELTA" }) }).click();
  await expect(
    podium.getByRole("heading", { name: t("T-2606", { comité: "DELTA", puesto: 4 }) }),
  ).toBeFocused();
  await podium.getByText(t("T-2612"), { exact: true }).click();
  await expect(podium.getByText(copyPattern("T-2614"))).toBeVisible();
  const last = podium.getByRole("button", { name: copyPattern("T-2603", { comité: "KAPPA" }) });
  await last.click();
  await podium.getByRole("button", { name: t("T-2607") }).click();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await sinViolaciones(page);
  const emptyTermId = await seedTerm("1900-1");
  await page.reload();
  await page.getByLabel(t("T-550"), { exact: true }).selectOption(emptyTermId);
  await page.getByRole("button", { name: t("T-250"), exact: true }).click();
  await expect(page).toHaveURL(/tablero=comites/);
  await expect(podium).toHaveCount(0);
  await page.getByLabel(t("T-550"), { exact: true }).selectOption(current.id);
  await page.getByRole("button", { name: t("T-250"), exact: true }).click();
  await expect(first).toBeVisible();
  await expect(
    podium.getByRole("heading", { name: t("T-2606", { comité: "DELTA", puesto: 4 }) }),
  ).toHaveCount(0);
});

test("empates en el mismo escalón y un único grupo con nombres extensos", async ({ page }) => {
  const { committees } = await seedRanking([0.02, 0.02, 0.01, 0.001]);
  await page.goto("/app/gh-points?tablero=comites");
  const podium = page.getByRole("region", { name: t("T-2600"), exact: true });
  const first = podium.getByRole("group", { name: t("T-2604", { n: 1 }), exact: true });
  await expect(first.getByRole("button")).toHaveCount(2);
  await expect(first).toContainText(t("T-2605"));
  await expect(podium.getByRole("group", { name: t("T-2604", { n: 2 }), exact: true })).toHaveCount(
    0,
  );
  await expect(
    podium.getByRole("group", { name: t("T-2604", { n: 3 }), exact: true }),
  ).toContainText("GAMMA");
  await getDb().update(committeeParticipation).set({ rate: 0, smoothedRate: 0, present: 0 });
  await getDb()
    .update(committee)
    .set({ name: "Comité sintético de Ciencias, Diseño y Comunicación Interdisciplinaria" })
    .where(eq(committee.id, committees[0]?.id ?? ""));
  await page.reload();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(first.getByRole("button")).toHaveCount(4);
  await expect(podium.getByRole("list")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await sinViolaciones(page);
});

test("podio legible en escritorio, celular, tema oscuro y texto ampliado", async ({ page }) => {
  await seedRanking([
    0.0418, 0.0224, 0.0143, 0.0127, 0.0116, 0.0107, 0.0096, 0.0076, 0.0067, 0.0056,
  ]);
  await page.goto("/app/gh-points?tablero=comites");
  await page.evaluate(() => document.fonts.ready);
  const podium = page.getByRole("region", { name: t("T-2600"), exact: true });
  const directory = process.env.PODIUM_REVIEW_DIR;
  if (directory) await mkdir(directory, { recursive: true });
  for (const [width, theme, scale, name] of [
    [1440, "light", "100%", "desktop"],
    [390, "light", "100%", "mobile"],
    [320, "dark", "100%", "mobile-dark"],
    [390, "light", "200%", "large-text"],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      ({ theme, scale }) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.fontSize = scale;
      },
      { theme, scale },
    );
    await podium.scrollIntoViewIfNeeded();
    expect(await podium.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    await sinViolaciones(page);
    if (directory) {
      // Las barras fijas quedan fuera de la captura del componente, incluso cuando es más alto
      // que el viewport. Siguen presentes durante las comprobaciones de interacción y axe.
      await page.evaluate(() => {
        for (const element of document.querySelectorAll("body *")) {
          if (["fixed", "sticky"].includes(getComputedStyle(element).position)) {
            element.setAttribute("data-review-overlay", "");
          }
        }
      });
      await podium.screenshot({
        path: `${directory}/${name}.png`,
        animations: "disabled",
        style: "[data-review-overlay] { visibility: hidden !important; }",
      });
    }
  }
});
