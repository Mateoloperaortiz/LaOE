import { mkdir } from "node:fs/promises";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { adjustPointsAs } from "@/modules/participation";
import { committeeParticipation } from "@/modules/participation/schema";
import { listAllCommittees } from "@/modules/people";
import { committeesResource } from "@/modules/people/admin";
import { committee } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
  seedTermStanding,
} from "../factories";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });

// Hechos sintéticos de asistencia y población: la página real calcula el índice combinado.
async function seedRanking(scores: number[]) {
  const db = getDb();
  const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("sin término sintético");
  const actorId = await seedMember("podio-admin@example.test");
  // Los comités del baseline tienen sus propios saldos GH. Esta matriz usa su población sintética.
  for (const existing of await listAllCommittees()) {
    if (existing.status === "INACTIVE") continue;
    if (!committeesResource.update) throw new Error("Falta el comando administrativo del comité");
    await committeesResource.update({ personId: actorId, ip: null }, existing.id, {
      slug: existing.slug,
      name: existing.name,
      status: "INACTIVE",
      deactivatedOn: todayKey(),
      lifecycleReason: "Aislamiento de población sintética del podio",
    });
  }
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
    const personId = await seedMember(`comite-${i}@example.test`);
    await seedCommitteeMembership(personId, id, current.id);
    committees.push({ id, name, score, personId });
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

test("índice combinado del semestre, top diez, detalle por teclado y cambio de semestre", async ({
  page,
}) => {
  const { current } = await seedRanking([
    0.0418, 0.0143, 0.0127, 0.0116, 0.0107, 0.0096, 0.0076, 0.0067, 0.0056, 0.0052, 0.004,
  ]);
  await page.goto(`/app/gh-points?tablero=comites&semestre=${current.id}`);
  const podium = page.getByRole("region", { name: t("T-2600"), exact: true });
  await expect(podium.getByRole("button", { name: copyPattern("T-3556") })).toHaveCount(10);
  const first = podium.getByRole("group", { name: t("T-2604", { n: 1 }), exact: true });
  const second = podium.getByRole("group", { name: t("T-2604", { n: 2 }), exact: true });
  const third = podium.getByRole("group", { name: t("T-2604", { n: 3 }), exact: true });
  await expect(first.getByRole("button")).toHaveAccessibleName(
    t("T-3556", { comité: "ALFA", puesto: 1, puntaje: "50,00" }),
  );
  await expect(second.getByRole("button")).toHaveAccessibleName(
    t("T-3556", { comité: "BETA", puesto: 2, puntaje: "17,11" }),
  );
  await expect(third.getByRole("button")).toHaveAccessibleName(
    t("T-3556", { comité: "GAMMA", puesto: 3, puntaje: "15,19" }),
  );
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
  await expect(detail.getByText(t("T-3560"), { exact: true }).locator("+ dd")).toHaveText("1");
  await expect(detail.getByText(t("T-3559"), { exact: true }).locator("+ dd")).toHaveText("0,00");
  await expect(detail.getByText(t("T-3562"), { exact: true }).locator("+ dd")).toHaveText(
    /4,18\s*%/,
  );
  await detail.getByRole("button", { name: t("T-2607") }).click();
  await expect(trigger).toBeFocused();
  await expect(detail).toBeHidden();
  await podium.getByRole("button", { name: copyPattern("T-3556", { comité: "DELTA" }) }).click();
  await expect(
    podium.getByRole("heading", { name: t("T-2606", { comité: "DELTA", puesto: 4 }) }),
  ).toBeFocused();
  await podium.getByText(t("T-2612"), { exact: true }).click();
  await expect(podium.getByText(t("T-3571"), { exact: true })).toBeVisible();
  const last = podium.getByRole("button", { name: copyPattern("T-3556", { comité: "KAPPA" }) });
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
  if (process.env.PODIUM_REVIEW_DIR) {
    await mkdir(process.env.PODIUM_REVIEW_DIR, { recursive: true });
    await podium.screenshot({
      path: `${process.env.PODIUM_REVIEW_DIR}/empates.png`,
      animations: "disabled",
    });
  }
  const historical = await seedTerm("1901-1");
  await getDb().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, historical));
  const firstCommittee = committees[0];
  if (!firstCommittee) throw new Error("falta comité histórico");
  await seedTermStanding({
    termId: historical,
    topNew: [],
    topVeteran: [],
    topCommittees: [
      {
        rank: 1,
        committeeId: firstCommittee.id,
        name: "Nombre congelado sintético",
        score: 0.0903,
        rawScore: 0.1,
        occasions: 2,
      },
    ],
    stats: { activeMembers: 1, newMembers: 0, occasions: 2, checkIns: 0, pointsAwarded: 0 },
  });
  await page.goto(`/app/gh-points?tablero=comites&semestre=${historical}`);
  await podium.getByText(t("T-2612"), { exact: true }).click();
  await expect(podium.getByText(t("T-3572"), { exact: true })).toBeVisible();
  await podium
    .getByRole("button", {
      name: t("T-2603", {
        comité: "Nombre congelado sintético",
        puesto: 1,
        porcentaje: new Intl.NumberFormat("es-CO", {
          style: "percent",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(0.0903),
      }),
    })
    .click();
  await expect(podium.getByText(t("T-3559"), { exact: true })).toHaveCount(0);
  await expect(podium.getByText(t("T-3555"), { exact: true })).toHaveCount(0);
  if (process.env.PODIUM_REVIEW_DIR) {
    await podium.screenshot({
      path: `${process.env.PODIUM_REVIEW_DIR}/historico.png`,
      animations: "disabled",
    });
  }
});

test("GH cambia el puesto con asistencia igual y el detalle es legible en ambos temas y tamaños", async ({
  page,
}) => {
  const { current, committees } = await seedRanking([0.4, 0.4, 0.4]);
  await page.goto("/app/gh-points?tablero=comites");
  const podium = page.getByRole("region", { name: t("T-2600"), exact: true });
  await expect(
    podium.getByRole("group", { name: t("T-2604", { n: 1 }), exact: true }).getByRole("button"),
  ).toHaveCount(3);
  for (const [index, points] of [30, 60].entries()) {
    const member = committees[index];
    if (!member) throw new Error("falta integrante del comité");
    await adjustPointsAs(
      { personId: member.personId, ip: null },
      { personId: member.personId, termId: current.id, points, reason: "Aporte GH sintético" },
    );
  }
  await page.reload();
  await expect(
    podium.getByRole("group", { name: t("T-2604", { n: 1 }), exact: true }).getByRole("button"),
  ).toHaveAccessibleName(t("T-3556", { comité: "BETA", puesto: 1, puntaje: "100,00" }));
  await expect(
    podium.getByRole("group", { name: t("T-2604", { n: 2 }), exact: true }).getByRole("button"),
  ).toHaveAccessibleName(t("T-3556", { comité: "ALFA", puesto: 2, puntaje: "75,00" }));
  await page.evaluate(() => document.fonts.ready);
  const directory = process.env.PODIUM_REVIEW_DIR;
  if (directory) await mkdir(directory, { recursive: true });
  for (const [width, theme, scale, name] of [
    [1280, "light", "100%", "desktop-light"],
    [1280, "dark", "100%", "desktop-dark"],
    [360, "light", "100%", "mobile-light"],
    [360, "dark", "100%", "mobile-dark"],
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
    await podium.getByRole("button", { name: copyPattern("T-3556", { comité: "ALFA" }) }).click();
    const detail = podium.getByRole("region", { name: t("T-2606", { comité: "ALFA", puesto: 2 }) });
    await expect(detail.getByText(t("T-3559"), { exact: true }).locator("+ dd")).toHaveText(
      "30,00",
    );
    await expect(detail.getByText(t("T-3562"), { exact: true }).locator("+ dd")).toHaveText(
      /40,00\s*%/,
    );
    await sinViolaciones(page);
    if (directory)
      await podium.screenshot({
        path: `${directory}/${name}-detalle.png`,
        animations: "disabled",
        style: "[data-review-overlay] { visibility: hidden !important; }",
      });
    await detail.getByRole("button", { name: t("T-2607") }).click();
  }
});
