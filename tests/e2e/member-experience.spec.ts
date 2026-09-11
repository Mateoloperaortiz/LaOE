import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { event, eventEdition } from "@/modules/events/schema";
import { occasion } from "@/modules/participation/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

test.use({ storageState: "tests/e2e/.auth/member.json" });

const title = `e2e-agenda-ux-${randomBytes(4).toString("hex")}`;
let eventId: string;
let activityId: string;
let editionId: string;

test.beforeEach(async () => {
  const db = getDb();
  const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el término sintético");
  const [createdEvent] = await db
    .insert(event)
    .values({ name: title, slug: title, audience: "MEMBERS", publicationStatus: "PUBLISHED" })
    .returning();
  if (!createdEvent) throw new Error("Falta el evento sintético");
  eventId = createdEvent.id;
  const [edition] = await db
    .insert(eventEdition)
    .values({
      eventId,
      name: title,
      slug: title,
      description: "Detalle reservado para miembros de prueba.",
      startsAt: new Date(Date.now() + 3_600_000),
      publicationStatus: "PUBLISHED",
    })
    .returning();
  const [activity] = await db
    .insert(occasion)
    .values({
      publicId: randomBytes(5).toString("hex"),
      termId: current.id,
      title: `${title} futura`,
      description: "Podés consultar la actividad antes de que abra la asistencia.",
      startsAt: new Date(Date.now() + 7_200_000),
      checkInOpensAt: new Date(Date.now() + 7_200_000),
      checkInClosesAt: new Date(Date.now() + 10_800_000),
      status: "OPEN",
    })
    .returning();
  if (!edition || !activity) throw new Error("Faltan detalles sintéticos");
  editionId = edition.id;
  activityId = activity.id;
});
test.afterEach(async () => {
  await drenarOutbox();
  if (activityId) await getDb().delete(occasion).where(eq(occasion.id, activityId));
  if (eventId) await getDb().delete(event).where(eq(event.id, eventId));
  await closeDb();
});

test("la agenda da detalles de miembros y de una actividad antes de abrir el registro", async ({
  page,
}) => {
  await page.goto(`/app/agenda?actividad=edicion-${editionId}`);
  await expect(page.getByText("Detalle reservado para miembros de prueba.")).toBeVisible();
  await page.goto(`/app/agenda?actividad=ocasion-${activityId}`);
  const details = page.locator(`details[id="ocasion-${activityId}"]`);
  await expect(
    details.getByText("Podés consultar la actividad antes de que abra la asistencia."),
  ).toBeVisible();
  await expect(details.getByText(/El registro abre el/)).toBeVisible();
  await expect(details.getByRole("link", { name: "Registrar asistencia" })).toHaveCount(0);
  await sinViolaciones(page);
  // El runner hereda test.use en contextos manuales; sobrescribirlo garantiza una visita anónima.
  const anonymous = await page
    .context()
    .browser()
    ?.newContext({
      storageState: { cookies: [], origins: [] },
    });
  if (!anonymous) throw new Error("Falta el navegador");
  try {
    expect(await anonymous.cookies()).toEqual([]);
    const stranger = await anonymous.newPage();
    await stranger.goto(`${new URL(page.url()).origin}/app/agenda?actividad=edicion-${editionId}`);
    await expect(stranger).toHaveURL(/\/ingresar/);
    await expect(stranger.getByText("Detalle reservado para miembros de prueba.")).toHaveCount(0);
  } finally {
    await anonymous.close();
  }
});

test("el directorio corrige páginas inexistentes y conserva filtros", async ({ page }) => {
  for (const value of ["Infinity", "900719925474099100", "-1", "1.5"]) {
    await page.goto(`/app/personas?q=Miembro&pagina=${value}`);
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("q") === "Miembro" && !url.searchParams.has("pagina"),
    );
  }
  await page.goto("/app/personas?q=Miembro&pagina=999");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("q") === "Miembro" && !url.searchParams.has("pagina"),
  );
  await expect(page.getByRole("heading", { name: "Miembro E2E", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Limpiar filtros", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/personas$/);
  await page.getByLabel("Buscá por nombre o comité").fill("zzz-no-hay-nadie-ux");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByText("0 personas", { exact: true })).toBeVisible();
  await expect(page.getByText(/No encontramos a nadie/)).toBeVisible();
});

for (const width of [360, 390, 768, 1440])
  for (const theme of ["light", "dark"] as const) {
    test(`Mi OE accesible ${width}px ${theme}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/app");
      expect(
        await page.locator(".member-topbar").evaluate((el) => el.getBoundingClientRect().height),
      ).toBeLessThanOrEqual(80);
      const week = page.getByRole("heading", { name: "Tu semana", exact: true });
      expect((await week.boundingBox())?.y).toBeLessThan(300);
      await page.screenshot({ path: testInfo.outputPath(`inicio-${width}-${theme}.png`) });
      const more = page.getByRole("button", { name: "Más", exact: true });
      await more.click();
      const menu = page.getByRole("dialog", { name: "Mi OE", exact: true });
      await expect(menu).toBeVisible();
      await sinViolaciones(page);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(more).toBeFocused();
      await more.click();
      await menu.getByRole("link", { name: "Personas", exact: true }).click();
      await expect(menu).toBeHidden();
      // La navegación es de cliente: sin esperar el destino, el menú se reabre sobre la página vieja.
      await expect(page).toHaveURL(/\/app\/personas$/);
      await more.click();
      await expect(menu.getByRole("link", { name: "Personas", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await page.keyboard.press("Escape");
      for (const path of [
        "/app",
        "/app/agenda",
        "/app/gh-points",
        "/app/carnet",
        "/app/permanencia",
        "/app/personas",
        "/app/comites",
        "/app/solicitudes",
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          path,
        ).toBe(true);
        await sinViolaciones(page);
      }
    });
  }

test("Mi OE mantiene acceso con texto al 200 % y foco dentro del menú", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/app");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.getByRole("button", { name: "Más", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Mi OE", exact: true });
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await expect(menu.getByRole("button", { name: "Cerrar", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await sinViolaciones(page);
});
