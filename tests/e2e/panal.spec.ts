import { mkdir } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { getPanalPuzzle, panalPuzzleView } from "@/modules/participation/domain/panal-dictionary";
import {
  hasPanalCheckpoints,
  isPanalPangram,
  panalWordScore,
} from "@/modules/participation/panal-engine";
import { panalGame, pointEntry } from "@/modules/participation/schema";
import { t } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });
test.afterAll(closeDb);

async function start(page: Page) {
  await page.goto("/app/juegos/panal");
  await page.waitForFunction(() => {
    const node = document.querySelector("#panal button");
    return node && Object.keys(node).some((key) => key.startsWith("__reactProps$"));
  });
  await page.getByRole("button", { name: t("T-2725") }).click();
  await expect(page.getByLabel(t("T-2726"), { exact: true })).toBeEnabled();
  const [row] = await getDb().select().from(panalGame);
  if (!row) throw new Error("Falta Panal");
  const puzzle = getPanalPuzzle(row.dictionaryVersion, row.puzzleId);
  if (!puzzle) throw new Error("Falta tablero");
  return puzzle;
}

async function send(page: Page, word: string) {
  await page.getByLabel(t("T-2726"), { exact: true }).fill(word);
  await page.getByRole("button", { name: t("T-2727"), exact: true }).click();
  await expect(page.locator("#panal output")).toContainText(
    t(isPanalPangram(word) ? "T-2744" : "T-2743", { palabra: word, n: panalWordScore(word) }),
  );
}

async function capture(page: Page, name: string) {
  // Axe recorre focos y Playwright desplaza hasta Enviar: una captura completa debe volver al inicio.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    path: `.impeccable/review/panal-checkpoints/${name}.png`,
    fullPage: true,
  });
}

test("biblioteca, teclado, guardado, pangrama y premio único hasta completar", async ({ page }) => {
  await page.goto("/app/juegos");
  await expect(
    page.getByRole("link").filter({ has: page.getByRole("heading", { name: t("T-2722") }) }),
  ).toBeVisible();
  const puzzle = await start(page);
  await page.getByLabel(t("T-2726"), { exact: true }).fill(puzzle.center);
  await page.keyboard.press("Enter");
  await expect(page.locator("#panal output")).toHaveText(t("T-2746"));
  const first = puzzle.words.find(isPanalPangram) ?? "";
  await send(page, first);
  await page.reload();
  await expect(page.getByText(t("T-2733", { n: 1, total: puzzle.words.length }))).toBeVisible();
  await page.getByLabel(t("T-2726"), { exact: true }).fill(first);
  await page.keyboard.press("Enter");
  await expect(page.locator("#panal output")).toHaveText(t("T-2745"));
  let score = panalWordScore(first);
  let found = 1;
  for (const word of puzzle.words.filter((word) => word !== first)) {
    await send(page, word);
    score += panalWordScore(word);
    found += 1;
    if (
      hasPanalCheckpoints(new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)) &&
      found === 5
    ) {
      await expect(page.getByText(t("T-3434"), { exact: true })).toBeVisible();
      await page.getByRole("link", { name: t("T-3007"), exact: true }).click();
      await expect(page).toHaveURL(/\/app\/juegos$/);
      await page.goto("/app/juegos/panal");
      await expect(page.getByText(t("T-3434"), { exact: true })).toBeVisible();
    }
    if (score >= panalPuzzleView(puzzle).geniusScore && score < panalPuzzleView(puzzle).maxScore) {
      await expect(page.getByText(t("T-2741"))).toBeVisible();
    }
  }
  await expect(page.getByText(t("T-2742"))).toBeVisible();
  const credits = await getDb().select().from(pointEntry).where(eq(pointEntry.kind, "PANAL"));
  const [game] = await getDb().select().from(panalGame);
  const checkpointsEnabled = hasPanalCheckpoints(game?.day ?? "");
  expect(credits).toHaveLength(checkpointsEnabled ? 3 : 1);
  expect(credits.reduce((sum, entry) => sum + entry.points, 0)).toBe(6);
});

test("celular, botones, mezclar sin cambiar la central y temas accesibles", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const puzzle = await start(page);
  const hive = page.getByRole("group", { name: t("T-2731") });
  const before = await hive.getByRole("button").allTextContents();
  await page.getByRole("button", { name: t("T-2729") }).click();
  const after = await hive.getByRole("button").allTextContents();
  expect(after[0]).toBe(before[0]);
  expect(after).not.toEqual(before);
  expect(after.toSorted()).toEqual(before.toSorted());
  const word = puzzle.words.find(isPanalPangram) ?? "";
  for (const letter of word) {
    await hive
      .getByRole("button", {
        name: letter === puzzle.center ? t("T-2730", { letra: letter }) : letter,
        exact: true,
      })
      .click();
  }
  await expect(page.getByLabel(t("T-2726"), { exact: true })).toHaveValue(word);
  await page.getByRole("button", { name: t("T-2727"), exact: true }).click();
  await expect(page.getByText(t("T-2733", { n: 1, total: puzzle.words.length }))).toBeVisible();
  const [game] = await getDb().select().from(panalGame);
  if (hasPanalCheckpoints(game?.day ?? "")) {
    for (const additional of puzzle.words.filter((item) => item !== word).slice(0, 4))
      await send(page, additional);
    await expect(page.getByText(t("T-3434"), { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText(t("T-3000"))).toBeVisible();
    await expect(
      page.getByText(t("T-2738", { n: panalPuzzleView(puzzle).geniusScore })),
    ).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await sinViolaciones(page);
  await mkdir(".impeccable/review/panal-checkpoints", { recursive: true });
  await capture(page, "mobile");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await sinViolaciones(page);
  await capture(page, "mobile-dark");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await sinViolaciones(page);
  await capture(page, "desktop");
});

test("un envío sin respuesta se puede reintentar sin perder la palabra", async ({ page }) => {
  const puzzle = await start(page);
  const word = puzzle.words[0] ?? "";
  await page.route("**/app/juegos/panal", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await page.getByLabel(t("T-2726"), { exact: true }).fill(word);
  await page.getByRole("button", { name: t("T-2727"), exact: true }).click();
  await expect(page.locator("#panal output")).toHaveText(t("T-2751"));
  await expect(page.getByLabel(t("T-2726"), { exact: true })).toHaveValue(word);
  await page.unroute("**/app/juegos/panal");
  await page.getByRole("button", { name: t("T-2757") }).click();
  await expect(page.getByText(t("T-2733", { n: 1, total: puzzle.words.length }))).toBeVisible();
  await page.reload();
  await expect(page.getByText(t("T-2733", { n: 1, total: puzzle.words.length }))).toBeVisible();
});
