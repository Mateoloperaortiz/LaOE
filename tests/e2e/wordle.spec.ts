import { expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { pointEntry, wordleGame } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

test.use({ storageState: "tests/e2e/.auth/member.json" });

async function memberId() {
  const [member] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) throw new Error("Falta el miembro sintético del Wordle");
  return member.id;
}

async function savedGame() {
  const [game] = await getDb()
    .select()
    .from(wordleGame)
    .where(eq(wordleGame.personId, await memberId()));
  if (!game) throw new Error("Falta la partida sintética del Wordle");
  return game;
}

test.beforeEach(async () => {
  const id = await memberId();
  // Solo la identidad sintética: la FK conserva los premios de cualquier otra persona.
  await getDb()
    .delete(pointEntry)
    .where(and(eq(pointEntry.personId, id), eq(pointEntry.kind, "WORDLE")));
  await getDb().delete(wordleGame).where(eq(wordleGame.personId, id));
});
test.afterEach(async () => {
  await drenarOutbox();
  await closeDb();
});

test("inicia sin filtrar la respuesta, rechaza palabras ausentes y acredita una sola victoria", async ({
  page,
}) => {
  await page.goto("/app/juegos/wordle");
  const game = page.locator("#wordle");
  await game.getByRole("button", { name: t("T-1232") }).click();
  const word = game.getByRole("textbox", { name: t("T-1236") });
  await expect(word).toBeVisible();
  const saved = await savedGame();
  expect(await page.content()).not.toContain(`"answer":"${saved.answer}"`);
  const exported = await (await page.request.get("/api/mis-datos")).json();
  expect(
    exported.wordleGames.find((item: { id: string }) => item.id === saved.id).answer,
  ).toBeNull();
  await word.fill("ZZZZZ");
  await game.getByRole("button", { name: t("T-1237") }).click();
  await expect(game.getByRole("status")).toContainText(t("T-1244"));
  await expect(word).toBeFocused();
  await word.fill(saved.answer.toLowerCase());
  await word.press("Enter");
  await expect(game.getByRole("status")).toContainText(copyPattern("T-1245", { puntos: 6 }));
  await expect(game.getByText(t("T-1247", { palabra: saved.answer }))).toBeVisible();
  // El movimiento se ve en el resumen, que es donde quedó la tabla del ledger.
  await page.goto("/app/gh-points");
  await expect(page.getByText(t("T-1261", { fecha: saved.day, intento: 1 }))).toBeVisible();
  await page.goto("/app/juegos/wordle");
  await expect(game.getByRole("status")).toContainText(copyPattern("T-1245", { puntos: 6 }));
  await expect(game.getByRole("button", { name: t("T-1232") })).toHaveCount(0);
  const credits = await getDb()
    .select()
    .from(pointEntry)
    .where(eq(pointEntry.wordleGameId, saved.id));
  expect(credits).toHaveLength(1);
  expect(credits[0]?.points).toBe(6);
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/wordle-desktop.png", fullPage: true });
});

test("retoma los intentos en otra pestaña y funciona en móvil con teclado táctil y Ñ", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/juegos/wordle");
  const panel = page.locator("#wordle");
  await panel.getByRole("button", { name: t("T-1232") }).click();
  await expect(panel.getByRole("textbox")).toBeVisible();
  const saved = await savedGame();
  const wrong = saved.answer === "NIÑAS" ? "NIÑOS" : "NIÑAS";
  const keyboard = panel.getByRole("group", { name: t("T-1259") });
  for (const letter of wrong)
    await keyboard.getByRole("button", { name: letter, exact: true }).click();
  await panel.getByRole("button", { name: t("T-1237") }).click();
  await expect(panel.getByRole("status")).toContainText(t("T-1264", { n: 5 }));
  await expect(panel.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(saved.answer === "AREPA" ? "TIGRE" : "AREPA");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("status")).toContainText(t("T-1264", { n: 4 }));
  const second = await context.newPage();
  await second.goto("/app/juegos/wordle");
  await expect(second.locator("#wordle").getByRole("status")).toContainText(t("T-1264", { n: 4 }));
  await expect(second.locator("#wordle").getByRole("listitem").first()).toContainText("Ñ");
  await second.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/wordle-mobile.png", fullPage: true });
});

test("recupera una victoria cuya respuesta de red se perdió sin duplicar el premio", async ({
  page,
}) => {
  await page.goto("/app/juegos/wordle");
  const panel = page.locator("#wordle");
  await panel.getByRole("button", { name: t("T-1232") }).click();
  await expect(panel.getByRole("textbox")).toBeFocused();
  const saved = await savedGame();
  let dropped = false;
  await page.route("**/app/juegos/wordle", async (route) => {
    if (!dropped && route.request().method() === "POST") {
      dropped = true;
      await route.fetch(); // El servidor confirma la transacción, pero el navegador pierde la respuesta.
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await page.keyboard.type(saved.answer);
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("status")).toContainText(t("T-1254"));
  await panel.getByRole("button", { name: t("T-1268") }).click();
  await expect(panel.getByRole("status")).toContainText(copyPattern("T-1245", { puntos: 6 }));
  const credits = await getDb()
    .select()
    .from(pointEntry)
    .where(eq(pointEntry.wordleGameId, saved.id));
  expect(credits).toHaveLength(1);
});

test("el resumen de GH Points lleva a la biblioteca y al Wordle del día", async ({ page }) => {
  // El tablero ya no vive en el resumen (ADR-075 regla 1): quedan los dos caminos de ida.
  await page.goto("/app/gh-points");
  await expect(page.locator("#wordle")).toHaveCount(0);
  await expect(page.getByRole("link", { name: t("T-2625") })).toBeVisible();
  await page.getByRole("link", { name: t("T-1257") }).click();
  await expect(page).toHaveURL(/\/app\/juegos\/wordle$/);
  await expect(page.locator("#wordle")).toBeVisible();
  await expect(page.getByRole("button", { name: t("T-1232") })).toBeVisible();
});
