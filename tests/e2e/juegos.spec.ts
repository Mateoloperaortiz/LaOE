import { expect, type Page } from "@playwright/test";
import { desc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import {
  applyGame2048Move,
  GAME2048_MAX_MOVES,
  game2048Reward,
  newGame2048,
} from "@/modules/participation/game2048-engine";
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

/** Parejas de fichas iguales pegadas: mientras quede una, queda una jugada que junta. */
function parejas(board: readonly number[]): number {
  let total = 0;
  for (const [i, cell] of board.entries()) {
    if (cell === 0) continue;
    if (i % 4 < 3 && cell === board[i + 1]) total += 1;
    if (cell === board[i + 4]) total += 1;
  }
  return total;
}

/**
 * Elige dirección con el motor: `bien` deja más casillas libres, y su contrario busca el tablero
 * sin jugadas, que es uno sin parejas que juntar y lleno.
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
    const value: number = bien
      ? libres * 100 + next.score
      : -(parejas(next.board) * 100 + libres * 10);
    if (!best || value > best.value) best = { move, value };
  }
  return best?.move ?? null;
}

async function puntajeVisible(page: Page): Promise<number> {
  const texto = await page.locator("#game2048").getByText(copyExact("T-2640")).innerText();
  return Number.parseInt(texto.replace(/\D/g, ""), 10) || 0;
}

/**
 * Juega bien hasta pasar `umbral` y después se apura a dejar el tablero sin jugadas; con `umbral`
 * 0 lo busca desde el principio. Cuando ya no hay jugada, el tablero se cierra solo y se guarda.
 *
 * Ninguna de las dos maneras asegura el resultado, porque la semilla la reparte el servidor: en
 * 100.000 semillas (2026-10-09) jugar bien se quedó bajo el primer umbral de premio en el 2,4 %, y
 * jugar a cerrar no lo pasó en ninguna (844 puntos la más alta), que tampoco es una garantía. Lo
 * que salió se le pregunta a `cierreSegunPuntaje`.
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

/** La partida que la página acaba de cerrar. */
async function ultimaPartida() {
  const [ultima] = await getDb()
    .select()
    .from(game2048Run)
    .orderBy(desc(game2048Run.createdAt))
    .limit(1);
  if (!ultima) throw new Error("No hay ninguna partida de 2048 guardada");
  return ultima;
}

/**
 * Comprueba el cierre de una partida sin suponer su premio (DT-095): lee el puntaje que quedó en
 * pantalla y exige lo que le toca a ese puntaje, en la página y en la base. `yaAcreditado` son los
 * GH Points que el 2048 ya sumó hoy; devuelve los que sumó esta partida. Deja anotado qué caso vio
 * la corrida, porque no es el mismo cada vez.
 */
async function cierreSegunPuntaje(page: Page, yaAcreditado: number): Promise<number> {
  const puntaje = await puntajeVisible(page);
  const premio = game2048Reward(puntaje);
  // Con el crédito del día tomado, ningún puntaje vuelve a sumar.
  const suma = yaAcreditado > 0 ? 0 : premio;
  const caso =
    suma > 0
      ? `${puntaje} puntos: suma ${suma}`
      : yaAcreditado > 0
        ? `${puntaje} puntos, que pagarían ${premio}: hoy ya sumó ${yaAcreditado} y no suma otra vez`
        : `${puntaje} puntos: no llega al primer umbral y el crédito del día sigue libre`;
  test.info().annotations.push({ type: "2048", description: caso });

  const ultima = await ultimaPartida();
  expect(ultima.status, caso).toBe("FINISHED");
  expect(ultima.moveCount, caso).toBe(ultima.moves?.length);
  // El puntaje que muestra la página es el que el servidor calculó al rejugar, y el que guardó.
  expect(ultima.score, caso).toBe(puntaje);
  expect(ultima.creditedPoints, caso).toBe(suma > 0 ? suma : null);
  const total = yaAcreditado + suma;
  expect(
    (await creditos()).map((credito) => credito.points),
    caso,
  ).toEqual(total > 0 ? [total] : []);
  await expect(
    page
      .locator("#game2048")
      .getByText(suma > 0 ? t("T-2651", { n: suma }) : t(yaAcreditado > 0 ? "T-2653" : "T-2652")),
    caso,
  ).toBeVisible();
  return suma;
}

test("la biblioteca muestra los juegos y se llega desde GH Points", async ({ page }) => {
  await page.goto("/app/gh-points");
  await page.getByRole("link", { name: t("T-2625") }).click();
  await expect(page).toHaveURL(/\/app\/juegos$/);
  await expect(page.getByRole("heading", { name: t("T-2621"), level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: copyPattern("T-2626") })).toBeVisible();
  await expect(page.getByRole("link", { name: copyPattern("T-2628") })).toBeVisible();
  // Biblioteca completa; cada juego nuevo tiene su flujo en su propio spec.
  await expect(page.getByText(tList("T-2623")[0])).toHaveCount(4);
  await sinViolaciones(page);

  await page.getByRole("link", { name: copyPattern("T-2628") }).click();
  await expect(page).toHaveURL(/\/app\/juegos\/2048$/);
  await expect(page.getByRole("heading", { name: t("T-2628"), level: 1 })).toBeVisible();
});

test("cada partida real muestra el premio de su puntaje y el día acredita una sola vez", async ({
  page,
}) => {
  await page.goto("/app/juegos/2048");
  // Leer no reparte semillas: la partida nace al pulsar.
  expect(await partidas()).toHaveLength(0);

  // Un día de tres partidas. La primera se juega a cerrar el tablero cuanto antes, que se queda sin
  // premio y deja libre el crédito; las otras dos se juegan bien, y la que cierre con el crédito del
  // día ya tomado se guarda igual y no suma. Qué le toca a cada una lo dice su puntaje.
  let acreditado = 0;
  for (const [indice, umbral] of [0, 1_500, 1_500].entries()) {
    // Con la página recargada, que hoy ya sumó sale de lo que guardó el servidor.
    if (indice > 0) await page.reload();
    await empezarPartida(page);
    expect(await partidas()).toHaveLength(indice + 1);
    await jugarHastaElFinal(page, umbral);
    acreditado += await cierreSegunPuntaje(page, acreditado);
  }
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

/** Los movimientos que llevan la semilla a un tablero al que no le queda jugada. */
function movesUntilFinished(seed: string): string {
  let state = newGame2048(seed);
  let moves = "";
  while (!state.over && moves.length < GAME2048_MAX_MOVES) {
    const step = ORDER.map((move) => ({ move, next: applyGame2048Move(state, move) })).find(
      (candidate) => candidate.next !== null,
    );
    if (!step?.next) break;
    state = step.next;
    moves += step.move;
  }
  return moves;
}

test("seguir un tablero retomado que ya terminó cierra la partida en vez de dejarla sin salida", async ({
  page,
}) => {
  await page.goto("/app/juegos/2048");
  const game = page.locator("#game2048");
  await empezarPartida(page);
  // El cierre de una partida terminada no llegó a la casa y la persona recargó: la partida sigue
  // abierta allá y el navegador guarda los movimientos de un tablero al que no le queda jugada.
  const open = await ultimaPartida();
  await page.evaluate(
    ([runId, moves]) => window.localStorage.setItem("oe-2048", JSON.stringify({ runId, moves })),
    [open.id, movesUntilFinished(open.seed)],
  );
  await page.reload();
  await game.getByRole("button", { name: t("T-2647") }).click();
  // La salida: la partida se cierra con lo jugado, como la habría cerrado su última jugada.
  await expect(game.getByRole("button", { name: t("T-2633") })).toBeVisible();
  await cierreSegunPuntaje(page, 0);
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
