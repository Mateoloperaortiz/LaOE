import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { applyGame2048Move, game2048Reward } from "@/modules/participation/game2048-engine";
import type { Game2048Move } from "@/modules/participation/game2048-types";
import { game2048Run, pointEntry } from "@/modules/participation/schema";
import { t, tList } from "@/shared/copy";
import { copyExact, copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });
test.afterAll(() => closeDb());

const ORDER: Game2048Move[] = ["L", "U", "R", "D"];
const TECLAS: Record<Game2048Move, string> = {
  U: "ArrowUp",
  D: "ArrowDown",
  L: "ArrowLeft",
  R: "ArrowRight",
};

/** Lee las dieciséis casillas del tablero tal como las muestra la página. */
async function tablero(page: Page): Promise<number[]> {
  return page
    .locator("#game2048 ol li span[aria-hidden='true']")
    .evaluateAll((celdas) =>
      celdas.map((celda) => Number.parseInt(celda.textContent ?? "0", 10) || 0),
    );
}

/**
 * Elige dirección con el motor: `bien` deja más casillas libres, y su contrario llena el tablero.
 * La partida del test juega bien hasta cruzar el primer umbral y después se apura a terminar.
 */
function elegir(board: number[], bien: boolean): Game2048Move | null {
  let best: { move: Game2048Move; value: number } | null = null;
  for (const move of ORDER) {
    const next = applyGame2048Move(
      { board, score: 0, maxTile: 0, moves: 0, over: false, rng: [1, 2, 3, 4] },
      move,
    );
    if (!next) continue;
    const libres = next.board.filter((cell) => cell === 0).length;
    const value = (bien ? libres * 100 + next.score : -libres * 100) as number;
    if (!best || value > best.value) best = { move, value };
  }
  return best?.move ?? null;
}

async function puntajeVisible(page: Page): Promise<number> {
  const texto = await page.locator("#game2048").getByText(copyExact("T-2640")).innerText();
  return Number.parseInt(texto.replace(/\D/g, ""), 10) || 0;
}

/**
 * Juega bien hasta cruzar el primer umbral —así el premio no depende de la suerte— y después se
 * apura a llenar el tablero. Cuando ya no hay jugada, el tablero se cierra solo y se guarda.
 */
async function jugarHastaElFinal(page: Page, umbral = 1_500, limite = 1_500): Promise<void> {
  const juego = page.locator("#game2048");
  const empezar = juego.getByRole("button", { name: t("T-2633") });
  // La partida nace en una transición: sin esperar los controles se leería un tablero vacío.
  await expect(juego.getByRole("button", { name: tList("T-2639")[0] })).toBeVisible();
  let bien = true;
  for (let paso = 0; paso < limite; paso += 1) {
    if (await empezar.isVisible()) return;
    if (bien && (await puntajeVisible(page)) >= umbral) bien = false;
    const move = elegir(await tablero(page), bien);
    if (!move) break;
    await page.keyboard.press(TECLAS[move]);
  }
  await expect(empezar).toBeVisible({ timeout: 15_000 });
}

/**
 * La partida nace en una transición: el botón responde antes de que llegue el tablero. Leerlo en
 * ese hueco da dieciséis ceros, `elegir` no encuentra jugada y la prueba sigue sin haber jugado.
 */
async function empezarPartida(page: Page): Promise<void> {
  const juego = page.locator("#game2048");
  await juego.getByRole("button", { name: t("T-2633") }).click();
  await expect(juego.getByRole("button", { name: tList("T-2639")[0] })).toBeVisible();
}

async function partidas() {
  return getDb().select().from(game2048Run);
}

async function creditos() {
  return getDb().select().from(pointEntry).where(eq(pointEntry.kind, "GAME2048"));
}

test("la biblioteca muestra los juegos y se llega desde GH Points", async ({ page }) => {
  await page.goto("/app/gh-points");
  await page.getByRole("link", { name: t("T-2625") }).click();
  await expect(page).toHaveURL(/\/app\/juegos$/);
  await expect(page.getByRole("heading", { name: t("T-2621"), level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: copyPattern("T-2626") })).toBeVisible();
  await expect(page.getByRole("link", { name: copyPattern("T-2628") })).toBeVisible();
  // Wordle, 2048 y Sudoku (ADR-078): la tarjeta del Sudoku se prueba en `sudoku.spec.ts`.
  await expect(page.getByText(tList("T-2623")[0])).toHaveCount(3);
  await sinViolaciones(page);

  await page.getByRole("link", { name: copyPattern("T-2628") }).click();
  await expect(page).toHaveURL(/\/app\/juegos\/2048$/);
  await expect(page.getByRole("heading", { name: t("T-2628"), level: 1 })).toBeVisible();
});

test("una partida real acredita una sola vez y la segunda del día ya no suma", async ({ page }) => {
  await page.goto("/app/juegos/2048");
  const juego = page.locator("#game2048");
  // Leer no reparte semillas: la partida nace al pulsar.
  expect(await partidas()).toHaveLength(0);
  await juego.getByRole("button", { name: t("T-2633") }).click();
  await expect(juego.getByRole("button", { name: tList("T-2639")[0] })).toBeVisible();
  expect(await partidas()).toHaveLength(1);

  await jugarHastaElFinal(page);
  const [primera] = await partidas();
  expect(primera?.status).toBe("FINISHED");
  expect(primera?.moveCount).toBe(primera?.moves?.length);
  // El puntaje que guarda la base es el que el servidor calculó al rejugar, y la página lo muestra.
  await expect(juego.getByText(t("T-2640", { puntaje: String(primera?.score) }))).toBeVisible();
  const premio = game2048Reward(primera?.score ?? 0);
  expect(premio).toBeGreaterThan(0);
  expect(primera?.creditedPoints).toBe(premio);
  expect(await creditos()).toHaveLength(1);
  await expect(juego.getByText(t("T-2651", { n: premio }))).toBeVisible();

  // La segunda partida del día se juega igual y se guarda, pero no acredita otra vez.
  await page.reload();
  await juego.getByRole("button", { name: t("T-2633") }).click();
  await jugarHastaElFinal(page);
  expect(await partidas()).toHaveLength(2);
  expect(await creditos()).toHaveLength(1);
  await expect(juego.getByText(t("T-2653"))).toBeVisible();
});

test("recargar a mitad de partida la retoma donde iba", async ({ page }) => {
  await page.goto("/app/juegos/2048");
  const juego = page.locator("#game2048");
  await empezarPartida(page);
  let jugadas = 0;
  for (let paso = 0; paso < 12; paso += 1) {
    const move = elegir(await tablero(page), true);
    if (!move) break;
    await page.keyboard.press(TECLAS[move]);
    jugadas += 1;
  }
  // Sin jugadas la comparación de abajo no probaría la retoma: un tablero vacío contra otro.
  expect(jugadas).toBe(12);
  const antes = await tablero(page);
  const puntaje = await juego.getByText(copyExact("T-2640")).innerText();

  await page.reload();
  await juego.getByRole("button", { name: t("T-2647") }).click();
  expect(await tablero(page)).toEqual(antes);
  await expect(juego.getByText(puntaje, { exact: true })).toBeVisible();
  // Sigue siendo la misma partida: nunca hay dos abiertas.
  expect(await partidas()).toHaveLength(1);
});

test("en móvil se juega con los botones de dirección y sin desbordar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/juegos/2048");
  const juego = page.locator("#game2048");
  await empezarPartida(page);
  const antes = await tablero(page);
  const [arriba, abajo, izquierda, derecha] = tList("T-2639");
  for (const nombre of [izquierda, arriba, derecha, abajo]) {
    await juego.getByRole("button", { name: nombre }).click();
    if ((await tablero(page)).join() !== antes.join()) break;
  }
  expect((await tablero(page)).join()).not.toBe(antes.join());
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await sinViolaciones(page);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/2048-movil.png", fullPage: true });
});
