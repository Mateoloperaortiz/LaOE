import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { closeDb, getDb } from "@/db/client";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import {
  seedMediaAsset,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

/** Registra también un salto que se corrija antes de comprobar la posición final. */
async function trackScroll(page: Page): Promise<() => Promise<number[]>> {
  const capture = await page.evaluateHandle(() => {
    const positions = [window.scrollY];
    const record = () => positions.push(window.scrollY);
    window.addEventListener("scroll", record);
    return { positions, record };
  });
  return async () => {
    const positions = await capture.evaluate(async ({ positions, record }) => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      window.removeEventListener("scroll", record);
      return [...positions, window.scrollY];
    });
    await capture.dispose();
    return positions;
  };
}

async function holdPost(page: Page, pattern: string) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  await page.route(pattern, async (route) => {
    if (route.request().method() === "POST") {
      markStarted();
      await held;
    }
    await route.continue();
  });
  return { started, release };
}

function expectNoPageJump(positions: number[], before: number): void {
  expect(Math.min(...positions), `Posiciones observadas: ${positions.join(", ")}`).toBeGreaterThan(
    before - 80,
  );
  expect(positions.at(-1)).toBeLessThan(before + 80);
}

async function seedLongOccasionList(prefix: string): Promise<void> {
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el término sintético");
  const startsAt = Date.now() + 86_400_000;
  for (let index = 0; index < 20; index += 1) {
    await seedOccasion(current.id, {
      title: `${prefix} ${String(index).padStart(2, "0")}`,
      status: "DRAFT",
      startsAt: new Date(startsAt + index * 60_000),
      checkInOpensAt: new Date(startsAt - 3_600_000),
      checkInClosesAt: new Date(startsAt + 3_600_000),
    });
  }
  await closeDb();
}

test("actualizar una fila al final del listado conserva la posición de la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  const prefix = "e2e-posicion-listado";
  await seedLongOccasionList(prefix);
  await page.goto(`/admin/ocasiones?q=${prefix}`);
  const row = page.getByRole("row").filter({ hasText: `${prefix} 00` });
  const open = row.getByRole("button", { name: tList("T-569")[0], exact: true });
  await open.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(500);

  const finish = await trackScroll(page);
  await open.click();
  await expect(row.getByRole("button", { name: tList("T-569")[1], exact: true })).toBeVisible();
  expectNoPageJump(await finish(), before);

  // La navegación normal a otra sección sigue comenzando arriba.
  await page.getByRole("link", { name: t("T-2091"), exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("subir una imagen conserva la posición al volver al listado de medios", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  const prefix = "e2e-posicion-medios";
  for (let index = 0; index < 20; index += 1) {
    await seedMediaAsset(`scroll/${prefix}-${index}.jpg`);
  }
  await closeDb();
  await page.goto(`/admin/medios?q=${prefix}&nuevo=1`);
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  // El listado tiene altura propia: no se agregan espaciadores al DOM para simular la página.
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const filename = `${prefix}-subida.png`;
  const buffer = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "#94b6f0" },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  await panel.getByLabel(t("T-356"), { exact: true }).setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer,
  });
  const anchor = page.getByRole("row", { name: new RegExp(`${prefix}-10\\.jpg`) });
  await expect(anchor).toBeInViewport();
  const anchorTop = await anchor.evaluate((row) => row.getBoundingClientRect().top);
  const before = await page.evaluate(() => window.scrollY);
  const finish = await trackScroll(page);
  const confirmed = page.waitForResponse(
    (response) => response.url().includes("/api/media/confirm") && response.status() === 201,
  );
  await panel.getByRole("button", { name: t("T-356"), exact: true }).click();
  await confirmed;
  await expect(panel).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("subido")).toBe("1");
  await expect(page.getByText(t("T-360"), { exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(filename) })).toBeVisible();
  // El aviso y la imagen nueva se insertan antes de esta fila: conserva el contenido visible.
  await expect
    .poll(async () =>
      Math.abs((await anchor.evaluate((row) => row.getBoundingClientRect().top)) - anchorTop),
    )
    .toBeLessThanOrEqual(2);
  const positions = await finish();
  expect(Math.min(...positions), `Posiciones observadas: ${positions.join(", ")}`).toBeGreaterThan(
    before - 80,
  );
});

for (const width of [390, 1440]) {
  test(`guardar un panel desde una fila inferior vuelve al mismo lugar del listado a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    const prefix = "e2e-posicion-panel";
    await seedLongOccasionList(prefix);
    await page.goto(`/admin/ocasiones?q=${prefix}`);
    const row = page.getByRole("row").filter({ hasText: `${prefix} 00` });
    const edit = row.getByRole("link", { name: t("T-252"), exact: true });
    await edit.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(500);

    await edit.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    const title = panel.getByLabel(tList("T-563")[0], { exact: true });
    const location = panel.getByLabel(tList("T-563")[6], { exact: true });
    const save = panel.getByRole("button", { name: t("T-253"), exact: true });
    await title.fill("");
    await location.fill("Lugar sintético editado");
    await save.scrollIntoViewIfNeeded();
    const finishError = await trackScroll(page);
    await save.click();
    await expect(panel.getByRole("alert")).toContainText(t("T-260"));
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(title).toBeFocused();
    await expect(location).toHaveValue("Lugar sintético editado");
    expectNoPageJump(await finishError(), before);

    await title.fill(`${prefix} 00`);
    await save.scrollIntoViewIfNeeded();
    const finishSaved = await trackScroll(page);
    if (width === 1440) {
      const { started, release } = await holdPost(page, "**/admin/ocasiones*");
      const saving = save.click();
      await started;
      try {
        await expect(title).toBeDisabled();
        const body = panel.locator(".admin-panel-body");
        const innerBefore = await body.evaluate((element) => element.scrollTop);
        await body.hover();
        await page.mouse.wheel(0, 300);
        await expect
          .poll(() => body.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(innerBefore + 100);
        expect(await page.evaluate(() => window.scrollY)).toBe(before);
      } finally {
        release();
      }
      await saving;
    } else {
      await save.click();
    }
    await expect(panel).toHaveCount(0);
    await expect(page).toHaveURL(/guardado=1$/);
    await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
    expectNoPageJump(await finishSaved(), before);
  });

  test(`actualizar una evaluación al final de la bandeja conserva la posición de la página a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    const db = getDb();
    const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
    const [admin] = await db.select().from(person).where(eq(person.email, E2E_EMAIL));
    if (!current || !admin) throw new Error("Faltan identidades sintéticas");
    const groupName = "e2e-posicion-evaluaciones";
    const groupId = await seedWorkGroup(current.id, groupName, { kind: "GAP" });
    let lastPersonId = "";
    for (let index = 0; index < 12; index += 1) {
      const suffix = String(index).padStart(2, "0");
      const personId = await seedPerson(`e2e-posicion-${suffix}@example.invalid`, {
        firstName: "Persona sintética",
        lastName: suffix,
        source: "E2E",
      });
      await seedMembership(personId, current.id);
      // Mantener GOOD conserva el orden de las filas al guardar de nuevo.
      await seedWorkGroupMembership(groupId, personId, "GOOD", admin.id);
      lastPersonId = personId;
    }
    await closeDb();

    await page.goto(`/admin/permanencia/evaluaciones?termId=${current.id}`);
    const group = page.getByRole("region", { name: groupName, exact: true });
    const member = group.getByRole("listitem").filter({
      has: page.locator(`input[name="personId"][value="${lastPersonId}"]`),
    });
    const note = member.getByLabel(t("T-769"), { exact: true });
    const save = member.getByRole("button", { name: tList("T-167")[0], exact: true });
    // El segundo guardado parte de la misma URL ?guardado=1 que dejó el primero.
    for (const value of ["Primera observación sintética", "Segunda observación sintética"]) {
      await note.fill(value);
      // Editar cambia value; defaultValue solo se renueva al aplicar la respuesta del servidor.
      await expect(note).not.toHaveJSProperty("defaultValue", value);
      await save.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(500);
      let expected = before;
      const finish = await trackScroll(page);
      const response = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/admin/permanencia/evaluaciones",
      );
      if (width === 1440) {
        const { started, release } = await holdPost(page, "**/admin/permanencia/evaluaciones*");
        const saving = save.click();
        await started;
        try {
          if (value === "Primera observación sintética") {
            // Mismo evento de documento que al arrastrar la barra: sin wheel, touch ni tecla.
            await page.evaluate(() => window.scrollBy(0, -300));
          } else {
            await page.mouse.move(1000, 350);
            await page.mouse.wheel(0, -300);
          }
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(before - 100);
          await page.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
          );
          expected = await page.evaluate(() => window.scrollY);
        } finally {
          release();
        }
        await saving;
        await page.unroute("**/admin/permanencia/evaluaciones*");
      } else {
        await save.click();
      }
      expect((await response).status()).toBe(200);
      await expect(page).toHaveURL(
        new RegExp(
          `/admin/permanencia/evaluaciones\\?termId=${current.id}&guardado=1&grupo=${groupId}$`,
        ),
      );
      await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
      await expect(note).toHaveJSProperty("defaultValue", value);
      expectNoPageJump(await finish(), expected);
      await expect(note).toHaveValue(value);
    }
  });
}
