import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { seedCommittee, seedCommitteeMembership, seedMembership, seedPerson } from "../factories";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";

async function markDocument(page: Page): Promise<string> {
  const marker = crypto.randomUUID();
  await page.evaluate((value) => Reflect.set(window, "__e2eGetFilterDocument", value), marker);
  return marker;
}

async function expectSameDocument(page: Page, marker: string): Promise<void> {
  expect(await page.evaluate(() => Reflect.get(window, "__e2eGetFilterDocument"))).toBe(marker);
}

test.describe("filtro público", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("limpiar y recorrer el historial sincroniza la búsqueda de comités en móvil", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    const target = "Comité sintético ZafiroEstado";
    const other = "Comité sintético CuarzoEstado";
    await seedCommittee("e2e-estado-zafiro", target);
    await seedCommittee("e2e-estado-cuarzo", other);
    await closeDb();
    await page.goto("/comites");
    const input = page.getByRole("searchbox", { name: t("T-1544"), exact: true });
    const targetResult = page.getByRole("heading", { name: target, exact: true });
    const otherResult = page.getByRole("heading", { name: other, exact: true });
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toBeAttached();
    const marker = await markDocument(page);
    const query = "ZafiroEstado";

    await input.fill(query);
    await page.getByRole("button", { name: t("T-1545"), exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toHaveCount(0);
    await expect(input).toHaveValue(query);
    await expectSameDocument(page, marker);

    await page.getByRole("link", { name: t("T-1474"), exact: true }).click();
    await expect(page).toHaveURL(/\/comites$/);
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toBeAttached();
    await expect(input).toHaveValue("");
    await expectSameDocument(page, marker);

    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toHaveCount(0);
    await expect(input).toHaveValue(query);
    await expectSameDocument(page, marker);

    await page.goForward();
    await expect(page).toHaveURL(/\/comites$/);
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toBeAttached();
    await expect(input).toHaveValue("");
    await expectSameDocument(page, marker);
  });

  test("una búsqueda pendiente bloquea sus controles y permite editar la siguiente al terminar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    const first = { query: "ZafiroPendiente", name: "Comité sintético ZafiroPendiente" };
    const second = { query: "CuarzoSiguiente", name: "Comité sintético CuarzoSiguiente" };
    await seedCommittee("e2e-estado-pendiente", first.name);
    await seedCommittee("e2e-estado-siguiente", second.name);
    await closeDb();
    await page.goto("/comites");
    const search = page.getByRole("search", { name: t("T-1544"), exact: true });
    const form = search.locator("form");
    const input = search.getByRole("searchbox", { name: t("T-1544"), exact: true });
    const submit = search.getByRole("button", { name: t("T-1545"), exact: true });
    const firstResult = page.getByRole("heading", { name: first.name, exact: true });
    const secondResult = page.getByRole("heading", { name: second.name, exact: true });
    const marker = await markDocument(page);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    await page.route("**/comites?*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (
        request.method() === "GET" &&
        request.headers().rsc === "1" &&
        url.searchParams.get("q") === first.query
      ) {
        markStarted();
        await held;
      }
      await route.continue();
    });

    await input.fill(first.query);
    try {
      await submit.click();
      await started;
      await expect(form).toHaveAttribute("aria-busy", "true");
      await expect(input).toBeDisabled();
      await expect(submit).toBeDisabled();
      await expect(input).toHaveValue(first.query);
    } finally {
      release();
    }
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(first.query);
    await expect(firstResult).toBeAttached();
    await expect(secondResult).toHaveCount(0);
    await expect(input).toHaveValue(first.query);
    await expect(input).toBeEnabled();
    await expect(submit).toBeEnabled();
    await expect(form).not.toHaveAttribute("aria-busy", "true");
    await expectSameDocument(page, marker);

    // Ya aplicado el primer resultado, el siguiente borrador pertenece a una transición nueva.
    await input.fill(second.query);
    await expect(input).toHaveValue(second.query);
    await submit.click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(second.query);
    await expect(secondResult).toBeAttached();
    await expect(firstResult).toHaveCount(0);
    await expect(input).toHaveValue(second.query);
    await expect(input).toBeEnabled();
    await expect(submit).toBeEnabled();
    await expectSameDocument(page, marker);
  });
});

test.describe("directorio de miembros", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("limpiar y recorrer el historial sincroniza búsqueda y comité en escritorio", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 720 });
    const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
    if (!current) throw new Error("Falta el semestre sintético");
    const committeeId = await seedCommittee("e2e-estado-directorio", "Comité sintético de estado");
    const target = "Aaaa sintética ZafiroEstado";
    const other = "Aaaa sintética CuarzoEstado";
    for (const [lastName, ownCommittee] of [
      ["ZafiroEstado", true],
      ["CuarzoEstado", false],
    ] as const) {
      const personId = await seedPerson(`e2e-estado-${lastName.toLowerCase()}@example.invalid`, {
        firstName: "Aaaa sintética",
        lastName,
        source: "E2E",
      });
      await seedMembership(personId, current.id);
      if (ownCommittee) await seedCommitteeMembership(personId, committeeId, current.id);
    }
    await closeDb();
    await page.goto("/app/personas");
    const input = page.getByRole("searchbox", { name: t("T-071"), exact: true });
    const committee = page.getByRole("combobox", { name: t("T-372"), exact: true });
    const targetResult = page.getByRole("heading", { name: target, exact: true });
    const otherResult = page.getByRole("heading", { name: other, exact: true });
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toBeAttached();
    const marker = await markDocument(page);
    const query = "ZafiroEstado";

    await input.fill(query);
    await committee.selectOption(committeeId);
    await page.getByRole("button", { name: t("T-250"), exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);
    expect(new URL(page.url()).searchParams.get("comite")).toBe(committeeId);
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toHaveCount(0);
    await expect(input).toHaveValue(query);
    await expect(committee).toHaveValue(committeeId);
    await expectSameDocument(page, marker);

    await page.getByRole("link", { name: t("T-1680"), exact: true }).click();
    await expect(page).toHaveURL(/\/app\/personas$/);
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toBeAttached();
    await expect(input).toHaveValue("");
    await expect(committee).toHaveValue("");
    await expectSameDocument(page, marker);

    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(query);
    expect(new URL(page.url()).searchParams.get("comite")).toBe(committeeId);
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toHaveCount(0);
    await expect(input).toHaveValue(query);
    await expect(committee).toHaveValue(committeeId);
    await expectSameDocument(page, marker);

    await page.goForward();
    await expect(page).toHaveURL(/\/app\/personas$/);
    await expect(targetResult).toBeAttached();
    await expect(otherResult).toBeAttached();
    await expect(input).toHaveValue("");
    await expect(committee).toHaveValue("");
    await expectSameDocument(page, marker);
  });
});
