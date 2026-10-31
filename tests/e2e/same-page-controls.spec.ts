import { expect } from "@playwright/test";
import { closeDb } from "@/db/client";
import { t, tList } from "@/shared/copy";
import { seedCommittee } from "../factories";
import { test } from "./fixtures";
import { expectNoPageJump, trackScroll } from "./scroll-observer";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

async function seedLongCommitteeList(): Promise<{ id: string; slug: string; name: string }> {
  // El listado conserva sus 25 filas al abrir el editor: la altura viene de comités reales.
  for (let index = 0; index < 24; index += 1) {
    await seedCommittee(
      `e2e-control-fila-${index}`,
      `Comité sintético de navegación ${String(index).padStart(2, "0")}`,
      { publicationStatus: "DRAFT" },
    );
  }
  const slug = "e2e-control-zafirox";
  const name = "Comité sintético ZafiroX";
  const id = await seedCommittee(slug, name, { publicationStatus: "DRAFT" });
  await closeDb();
  return { id, slug, name };
}

for (const scenario of [
  { width: 390, activation: "clic" },
  { width: 1440, activation: "Enter" },
] as const) {
  test(`la paleta abre el editor del mismo listado por ${scenario.activation} sin perder el lugar a ${scenario.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: scenario.width, height: 720 });
    const committee = await seedLongCommitteeList();
    await page.goto("/admin/comites");
    await page.locator(".admin-table-row").last().scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(500);
    const marker = crypto.randomUUID();
    await page.evaluate((value) => Reflect.set(window, "__e2eControlDocument", value), marker);
    const finish = await trackScroll(page);

    const palette = page.getByRole("dialog", { name: t("T-299"), exact: true });
    const input = palette.getByRole("searchbox", { name: t("T-264"), exact: true });
    // El atajo abre desde la fila actual, sin desplazar hasta el botón del encabezado.
    await expect(async () => {
      await page.keyboard.press("Control+k");
      await expect(input).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    const query = "ZafiroX";
    const search = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/admin/buscar" && url.searchParams.get("q") === query;
    });
    await input.fill(query);
    const response = await search;
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({
          id: committee.id,
          title: committee.name,
          href: `/admin/comites?editar=${committee.id}`,
        }),
      ]),
    });
    const result = palette.getByRole("link");
    await expect(result).toHaveCount(1);
    await expect(result).toHaveAttribute("href", `/admin/comites?editar=${committee.id}`);
    if (scenario.activation === "clic") await result.click();
    else await input.press("Enter");

    await expect.poll(() => new URL(page.url()).searchParams.get("editar")).toBe(committee.id);
    const editor = page.getByRole("dialog", {
      name: `${t("T-252")} · ${tList("T-261")[1]}`,
      exact: true,
    });
    await expect(editor.getByLabel(t("T-272"), { exact: true })).toHaveValue(committee.slug);
    await expect(palette).not.toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, "__e2eControlDocument"))).toBe(marker);

    await editor.getByRole("button", { name: t("T-291"), exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect(page).toHaveURL(/\/admin\/comites$/);
    expect(await page.evaluate(() => Reflect.get(window, "__e2eControlDocument"))).toBe(marker);
    expectNoPageJump(await finish(), before);
  });
}
