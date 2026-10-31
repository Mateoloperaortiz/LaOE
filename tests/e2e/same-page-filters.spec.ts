import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import {
  seedMembership,
  seedOccasion,
  seedPerson,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { expectNoPageJump, trackScroll } from "./scroll-observer";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const occasionPrefix = "e2e-filtros-ocasion";

async function currentTerm() {
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  return current;
}

async function seedLongOccasions(): Promise<void> {
  const current = await currentTerm();
  const firstDay = new Date(`${current.startsOn}T12:00:00-05:00`).getTime();
  // Dos páginas completas y de igual altura: la posición no depende de filas de relleno.
  for (let index = 0; index < 50; index += 1) {
    const startsAt = new Date(firstDay + index * 60_000);
    await seedOccasion(current.id, {
      title: `${occasionPrefix}-${String(index).padStart(2, "0")}`,
      status: "DRAFT",
      startsAt,
      checkInOpensAt: startsAt,
      checkInClosesAt: new Date(startsAt.getTime() + 3_600_000),
    });
  }
  await closeDb();
}

async function seedLongGroup(): Promise<{ groupId: string; candidate: string; query: string }> {
  const current = await currentTerm();
  const groupId = await seedWorkGroup(current.id, "e2e-Grupo de filtros", { kind: "GAP" });
  for (let index = 0; index < 24; index += 1) {
    const personId = await seedPerson(`e2e-filtros-grupo-${index}@example.invalid`, {
      firstName: "Integrante sintético",
      lastName: String(index).padStart(2, "0"),
      source: "E2E",
    });
    await seedMembership(personId, current.id);
    await seedWorkGroupMembership(groupId, personId);
  }
  const query = "e2eBusqueda";
  const candidate = `Candidata sintética ${query}`;
  const candidateId = await seedPerson("e2e-filtros-candidata@example.invalid", {
    firstName: "Candidata sintética",
    lastName: query,
    source: "E2E",
  });
  await seedMembership(candidateId, current.id);
  await closeDb();
  return { groupId, candidate, query };
}

async function markDocument(page: Page): Promise<string> {
  const marker = crypto.randomUUID();
  await page.evaluate((value) => Reflect.set(window, "__e2eFilterDocument", value), marker);
  return marker;
}

async function expectSameDocument(page: Page, marker: string): Promise<void> {
  expect(await page.evaluate(() => Reflect.get(window, "__e2eFilterDocument"))).toBe(marker);
}

for (const width of [390, 1440]) {
  test(`la paginación inferior conserva la posición y la navegación normal a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    await seedLongOccasions();
    await page.goto(`/admin/ocasiones?q=${occasionPrefix}`);
    await expect(
      page.getByRole("cell", { name: `${occasionPrefix}-49`, exact: true }),
    ).toBeVisible();
    const marker = await markDocument(page);
    const [previous, next] = tList("T-258");
    for (const [label, expectedPage, expectedTitle] of [
      [next, "2", `${occasionPrefix}-24`],
      [previous, null, `${occasionPrefix}-49`],
    ] as const) {
      const link = page
        .locator(".admin-pagination")
        .getByRole("link", { name: label, exact: true });
      await link.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(500);
      const finish = await trackScroll(page);
      await link.click();
      await expect.poll(() => new URL(page.url()).searchParams.get("pagina")).toBe(expectedPage);
      await expect(page.getByRole("cell", { name: expectedTitle, exact: true })).toBeAttached();
      expect(new URL(page.url()).searchParams.get("q")).toBe(occasionPrefix);
      await expectSameDocument(page, marker);
      expectNoPageJump(await finish(), before);
      await expect(page.locator(".admin-pagination")).toBeInViewport();
    }

    // El enlace nativo del shell sigue llevando al ancla y entregándole el foco al contenido.
    const skip = page.getByRole("link", { name: t("T-1404"), exact: true });
    await skip.focus();
    await skip.click();
    await expect(page).toHaveURL(/#admin-content$/);
    await expect(page.locator("#admin-content")).toBeFocused();

    await page.getByRole("link", { name: t("T-2091"), exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test(`buscar, filtrar y limpiar el listado no recarga el documento a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    await seedLongOccasions();
    await page.goto(`/admin/ocasiones?q=${occasionPrefix}&pagina=2`);
    const toolbar = page.locator(".admin-resource-toolbar");
    const marker = await markDocument(page);

    // La barra está arriba: aquí el requisito observable es la navegación sin recargar el documento.
    const query = `${occasionPrefix}-4`;
    await toolbar.getByRole("searchbox", { name: t("T-250"), exact: true }).fill(query);
    await toolbar.getByRole("button", { name: t("T-250"), exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);
    expect(new URL(page.url()).searchParams.has("pagina")).toBe(false);
    await expect(
      page.getByRole("cell", { name: `${occasionPrefix}-49`, exact: true }),
    ).toBeAttached();
    await expect(page.getByRole("cell", { name: `${occasionPrefix}-24`, exact: true })).toHaveCount(
      0,
    );
    await expectSameDocument(page, marker);

    const filters = toolbar.locator("details");
    if (
      !(await filters.evaluate((element) => element instanceof HTMLDetailsElement && element.open))
    )
      await filters.locator("summary").click();
    const status = toolbar.getByLabel(tList("T-570")[2], { exact: true });
    await status.selectOption("CLOSED");
    await toolbar.getByRole("button", { name: t("T-1421"), exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("status")).toBe("CLOSED");
    expect(new URL(page.url()).searchParams.get("q")).toBe(query);
    await expect(page.getByRole("cell", { name: `${occasionPrefix}-49`, exact: true })).toHaveCount(
      0,
    );
    await expectSameDocument(page, marker);

    await toolbar.getByRole("link", { name: t("T-1422"), exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/ocasiones$/);
    await expect(toolbar.getByRole("searchbox")).toHaveValue("");
    await expect(toolbar.getByLabel(tList("T-570")[2], { exact: true })).toHaveValue("");
    await expectSameDocument(page, marker);

    // El CSV conserva el transporte de descarga, sin convertirlo en una ruta del cliente.
    const screen = page.url();
    const download = page.waitForEvent("download");
    await toolbar.getByRole("link", { name: t("T-255"), exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/^ocasiones-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(page.url()).toBe(screen);
    await expectSameDocument(page, marker);
  });

  test(`la búsqueda GET particular bajo los miembros conserva el lugar a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    const { groupId, candidate, query } = await seedLongGroup();
    await page.goto(`/admin/permanencia/grupos/${groupId}`);
    const input = page.getByRole("textbox", { name: tList("T-748")[0], exact: true });
    const form = page.locator("form").filter({ has: input });
    const marker = await markDocument(page);

    for (const value of [query, ""]) {
      await input.fill(value);
      const submit = form.getByRole("button", { name: t("T-250"), exact: true });
      await submit.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(500);
      const finish = await trackScroll(page);
      await submit.click();
      await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(value);
      await expect(input).toHaveJSProperty("defaultValue", value);
      await expect(page.getByText(candidate, { exact: true })).toHaveCount(value ? 1 : 0);
      await expectSameDocument(page, marker);
      expectNoPageJump(await finish(), before);
      await expect(input).toBeInViewport();
    }
  });
}
