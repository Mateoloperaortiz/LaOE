import { expect } from "@playwright/test";
import { closeDb } from "@/db/client";
import { t } from "@/shared/copy";
import { seedCard, seedOrganization, seedPipeline } from "../factories";
import { test } from "./fixtures";
import { expectNoPageJump, holdPost, trackScroll } from "./scroll-observer";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

async function seedLongBoard() {
  const pipeline = await seedPipeline("e2e-Tablero de desplazamiento", "CUSTOM", [
    { name: "Etapa sintética de origen" },
    { name: "Etapa sintética de destino" },
  ]);
  const [origin, destination] = pipeline.stages;
  if (!origin || !destination) throw new Error("Faltan las etapas sintéticas");
  const organizationId = await seedOrganization(
    "Organización sintética de desplazamiento",
    "OTHER",
  );
  let movedCard = { id: "", title: "" };
  for (const [stage, kind] of [
    [origin, "origen"],
    [destination, "destino"],
  ] as const) {
    for (let index = 0; index < 20; index += 1) {
      const title = `Tarjeta sintética ${kind} ${String(index).padStart(2, "0")}`;
      const id = await seedCard(pipeline.id, stage.id, { organizationId }, { title });
      if (stage.id === origin.id && index === 12) movedCard = { id, title };
    }
  }
  await closeDb();
  return { pipelineId: pipeline.id, origin, destination, movedCard };
}

test("arrastrar una tarjeta entre columnas conserva la posición del tablero", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  const { pipelineId, origin, destination, movedCard } = await seedLongBoard();
  const path = `/admin/pipelines/${pipelineId}`;
  await page.goto(path);
  const board = page.getByRole("region", { name: t("T-977"), exact: true });
  const originColumn = board.getByRole("region", { name: origin.name, exact: true });
  const destinationColumn = board.getByRole("region", { name: destination.name, exact: true });
  const card = originColumn.getByRole("listitem").filter({
    has: page.getByRole("link", { name: movedCard.title, exact: true }),
  });
  await expect(originColumn.getByRole("listitem")).toHaveCount(20);
  await expect(destinationColumn.getByRole("listitem")).toHaveCount(20);
  // Centrar contenido real permite arrastrar en horizontal, lejos del borde que hace auto-scroll.
  await card.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }),
  );
  await expect(card).toBeInViewport();
  const sourceBox = await card.boundingBox();
  const targetBox = await destinationColumn.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Faltan las columnas visibles para arrastrar");
  const from = { x: sourceBox.x + sourceBox.width - 16, y: sourceBox.y + sourceBox.height - 12 };
  const to = { x: targetBox.x + targetBox.width / 2, y: from.y };
  expect(from.y).toBeGreaterThan(100);
  expect(from.y).toBeLessThan(620);
  expect(to.x).toBeLessThan(1440);
  expect(to.y).toBeGreaterThan(targetBox.y);
  expect(to.y).toBeLessThan(targetBox.y + targetBox.height);
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(500);
  const marker = crypto.randomUUID();
  await page.evaluate((value) => Reflect.set(window, "__e2eKanbanDocument", value), marker);
  const finish = await trackScroll(page);
  const { started, release } = await holdPost(page, `**${path}*`);
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === path,
  );
  try {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 8, from.y, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.move(to.x + 1, to.y);
    await page.mouse.up();
    await started;
    await expect(board).toHaveAttribute("aria-busy", "true");
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  } finally {
    release();
  }
  expect((await response).status()).toBe(200);
  await expect.poll(() => new URL(page.url()).searchParams.get("movida")).toBe(destination.id);
  await expect(
    destinationColumn.getByRole("link", { name: movedCard.title, exact: true }),
  ).toHaveAttribute("href", `${path}?tarjeta=${movedCard.id}`);
  await expect(originColumn.getByRole("link", { name: movedCard.title, exact: true })).toHaveCount(
    0,
  );
  await expect(originColumn.getByRole("listitem")).toHaveCount(19);
  await expect(destinationColumn.getByRole("listitem")).toHaveCount(21);
  await expect(board).toHaveAttribute("aria-busy", "false");
  expect(await page.evaluate(() => Reflect.get(window, "__e2eKanbanDocument"))).toBe(marker);
  expectNoPageJump(await finish(), before);
});
