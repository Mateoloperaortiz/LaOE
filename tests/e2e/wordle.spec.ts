import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { pointEntry, wordleGame } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { sinViolaciones } from "./axe";
import { E2E_MEMBER_EMAIL } from "./global-setup";

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
test.afterAll(closeDb);

test("inicia sin filtrar la respuesta, rechaza palabras ausentes y acredita una sola victoria", async ({
  page,
}) => {
  await page.goto("/app/gh-points");
  const game = page.locator("#wordle");
  await game.getByRole("button", { name: "Jugar el Wordle de hoy" }).click();
  const word = game.getByRole("textbox", { name: "Tu palabra de cinco letras" });
  await expect(word).toBeVisible();
  const saved = await savedGame();
  expect(await page.content()).not.toContain(`"answer":"${saved.answer}"`);
  const exported = await (await page.request.get("/api/mis-datos")).json();
  expect(
    exported.wordleGames.find((item: { id: string }) => item.id === saved.id).answer,
  ).toBeNull();
  await word.fill("ZZZZZ");
  await game.getByRole("button", { name: "Probar palabra" }).click();
  await expect(game.getByRole("status")).toContainText("No la encontré en el diccionario");
  await expect(word).toBeFocused();
  await word.fill(saved.answer.toLowerCase());
  await word.press("Enter");
  await expect(game.getByRole("status")).toContainText("Sumaste 6 GH Points");
  await expect(game.getByText(`La palabra era ${saved.answer}.`)).toBeVisible();
  await expect(page.getByText(`Wordle del ${saved.day}: intento 1/6`)).toBeVisible();
  await page.reload();
  await expect(game.getByRole("status")).toContainText("Sumaste 6 GH Points");
  await expect(game.getByRole("button", { name: "Jugar el Wordle de hoy" })).toHaveCount(0);
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
  await page.goto("/app/gh-points");
  const panel = page.locator("#wordle");
  await panel.getByRole("button", { name: "Jugar el Wordle de hoy" }).click();
  await expect(panel.getByRole("textbox")).toBeVisible();
  const saved = await savedGame();
  const wrong = saved.answer === "NIÑAS" ? "NIÑOS" : "NIÑAS";
  const keyboard = panel.getByRole("group", { name: "Teclado del Wordle" });
  for (const letter of wrong)
    await keyboard.getByRole("button", { name: letter, exact: true }).click();
  await panel.getByRole("button", { name: "Probar palabra" }).click();
  await expect(panel.getByRole("status")).toContainText("Podés sumar 5 GH Points");
  await expect(panel.getByRole("textbox")).toBeFocused();
  await page.keyboard.type(saved.answer === "AREPA" ? "TIGRE" : "AREPA");
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("status")).toContainText("Podés sumar 4 GH Points");
  const second = await context.newPage();
  await second.goto("/app/gh-points");
  await expect(second.locator("#wordle").getByRole("status")).toContainText(
    "Podés sumar 4 GH Points",
  );
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
  await page.goto("/app/gh-points");
  const panel = page.locator("#wordle");
  await panel.getByRole("button", { name: "Jugar el Wordle de hoy" }).click();
  await expect(panel.getByRole("textbox")).toBeFocused();
  const saved = await savedGame();
  let dropped = false;
  await page.route("**/app/gh-points", async (route) => {
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
  await expect(panel.getByRole("status")).toContainText("No recibimos la confirmación");
  await panel.getByRole("button", { name: "Reintentar jugada" }).click();
  await expect(panel.getByRole("status")).toContainText("Sumaste 6 GH Points");
  const credits = await getDb()
    .select()
    .from(pointEntry)
    .where(eq(pointEntry.wordleGameId, saved.id));
  expect(credits).toHaveLength(1);
});

test("un semestre anterior enlaza al reto vigente", async ({ page }) => {
  await page.goto("/app/gh-points");
  const select = page.getByLabel("Semestre", { exact: true });
  const old = select.locator("option").filter({ hasText: "2019-2" });
  const id = await old.getAttribute("value");
  expect(id).toBeTruthy();
  await page.goto(`/app/gh-points?semestre=${id}`);
  await expect(page.getByRole("link", { name: "Ir al Wordle de hoy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Jugar el Wordle de hoy" })).toHaveCount(0);
  await page.getByRole("link", { name: "Ir al Wordle de hoy" }).click();
  await expect(page.locator("#wordle")).toBeVisible();
});
