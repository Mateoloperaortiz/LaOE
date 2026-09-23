import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { pointEntry, sudokuRun } from "@/modules/participation/schema";
import { t, tList } from "@/shared/copy";
import { copyExact, copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });
test.afterAll(() => closeDb());

const [FACIL, MEDIO, DIFICIL] = tList("T-2681");
const [SIN_AYUDAS, CON_AYUDAS] = tList("T-2683");
type Dificultad = typeof FACIL | typeof MEDIO | typeof DIFICIL;
type Modo = typeof SIN_AYUDAS | typeof CON_AYUDAS;

async function partidas() {
  return getDb().select().from(sudokuRun).orderBy(sudokuRun.createdAt);
}

async function creditos() {
  return getDb().select().from(pointEntry).where(eq(pointEntry.kind, "SUDOKU"));
}

/** La opción es un radio oculto dentro de su etiqueta: se elige pulsando la etiqueta. */
function opcion(page: Page, nombre: Dificultad | Modo) {
  return page.locator("#sudoku label").filter({ hasText: new RegExp(`^${nombre}`) });
}

/**
 * Abre el juego y espera a que React tome el formulario. Los radios son controlados: un clic que
 * llega antes de la hidratación se pierde cuando React repone su estado inicial, y la prueba
 * empezaría un Fácil creyendo que pidió un Difícil. La marca es la que React deja en el nodo.
 */
async function abrir(page: Page) {
  await page.goto("/app/juegos/sudoku");
  await page.waitForFunction(() => {
    const nodo = document.querySelector("#sudoku form, #sudoku button");
    return nodo !== null && Object.keys(nodo).some((key) => key.startsWith("__reactProps$"));
  });
}

function casilla(page: Page, cell: number) {
  const fila = Math.floor(cell / 9) + 1;
  const columna = (cell % 9) + 1;
  return page.getByRole("gridcell", { name: copyExact("T-2697", { fila, columna }) });
}

/**
 * El tablero nace en una transición: el botón responde antes de que llegue la grilla. Devuelve la
 * fila de la base, que es lo único que conoce la solución: la prueba juega con ella, como la de
 * integración, así que ningún crédito depende de la suerte ni de un solver propio.
 */
async function empezar(page: Page, dificultad: Dificultad, modo: Modo) {
  const juego = page.locator("#sudoku");
  await opcion(page, dificultad).click();
  await opcion(page, modo).click();
  await juego
    .getByRole("button", {
      name: new RegExp(`${copyExact("T-2687").source}|${copyExact("T-2711").source}`),
    })
    .click();
  await expect(page.getByRole("grid", { name: t("T-2696") })).toBeVisible();
  const run = (await partidas()).at(-1);
  if (!run || run.status !== "IN_PROGRESS") throw new Error("La partida no nació");
  return run;
}

/** Escribe con el teclado físico las casillas vacías, menos las que se pidan dejar. */
async function resolver(
  page: Page,
  run: { givens: string; solution: string },
  dejar: number[] = [],
) {
  for (let cell = 0; cell < 81; cell += 1) {
    if (run.givens[cell] !== "0" || dejar.includes(cell)) continue;
    await casilla(page, cell).click();
    await page.keyboard.press(run.solution[cell] as string);
  }
}

function vacias(givens: string): number[] {
  return Array.from(givens, (digit, cell) => (digit === "0" ? cell : -1)).filter(
    (cell) => cell >= 0,
  );
}

test("la biblioteca suma la tarjeta del Sudoku", async ({ page }) => {
  await page.goto("/app/juegos");
  await expect(page.getByRole("link", { name: copyPattern("T-2675") })).toBeVisible();
  await expect(page.getByText(tList("T-2623")[0])).toHaveCount(4);
  await sinViolaciones(page);
  await page.getByRole("link", { name: copyPattern("T-2675") }).click();
  await expect(page).toHaveURL(/\/app\/juegos\/sudoku$/);
  await expect(page.getByRole("heading", { name: t("T-2675"), level: 1 })).toBeVisible();
  // Leer no reparte tableros: la partida nace al pulsar.
  expect(await partidas()).toHaveLength(0);
});

test("un Difícil sin ayudas acredita 6 sin que la solución llegue al navegador", async ({
  page,
}) => {
  // Los cuerpos se leen desde Node con `route.fetch`: `response.text()` depende del búfer del
  // navegador y en el runner de CI devolvió vacío para las acciones, lo que dejaba esta prueba
  // comprobando nada. Por eso también se exige abajo que el inicio haya traído las dadas.
  const cuerpos: string[] = [];
  // Solo los POST de las acciones del juego. La página y sus refrescos siguen su camino: retenerlos
  // retrasa la hidratación y confunde al cliente de Next; lo que mandan se lee aparte, más abajo.
  await page.route(
    (url) => url.pathname === "/app/juegos/sudoku",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      cuerpos.push(await response.text());
      await route.fulfill({ response });
    },
  );
  await abrir(page);
  const juego = page.locator("#sudoku");
  await expect(juego.getByText(t("T-2685"))).toBeVisible();
  await opcion(page, DIFICIL).click();
  await expect(juego.getByText(t("T-2686", { n: 6 }))).toBeVisible();
  const run = await empezar(page, DIFICIL, SIN_AYUDAS);
  expect(run).toMatchObject({ difficulty: "HARD", assisted: false });
  // Sin ayudas no hay botón de pista ni marca de error.
  await expect(juego.getByRole("button", { name: tList("T-2701")[3] })).toHaveCount(0);

  // Un repetido se marca solo: son las reglas, no la solución.
  const [primera] = vacias(run.givens);
  if (primera === undefined) throw new Error("Tablero sin casillas vacías");
  const fila = Math.floor(primera / 9) * 9;
  const repetido = Array.from({ length: 9 }, (_, i) => run.givens[fila + i]).find((d) => d !== "0");
  await casilla(page, primera).click();
  await page.keyboard.press(repetido as string);
  await expect(casilla(page, primera)).toHaveAccessibleName(new RegExp(`${tList("T-2698")[2]}$`));
  await expect(
    juego.getByText(`El ${repetido} ya está en esa fila, columna o caja.`),
  ).toBeVisible();

  // Con la partida abierta, lo que el servidor manda para pintar la página trae las dadas y nada
  // más. Se lee del DOM tras recargar: ahí quedan los datos que Next incrusta para hidratar.
  await page.reload();
  await expect(juego.getByRole("button", { name: t("T-2692") })).toBeVisible();
  const pagina = await page.content();
  expect(pagina).toContain(run.givens);
  expect(pagina).not.toContain(run.solution);
  expect(pagina).not.toContain(run.seed);
  await juego.getByRole("button", { name: t("T-2692") }).click();

  await resolver(page, run);
  await expect(juego.getByText(t("T-2708", { n: 6 }))).toBeVisible({ timeout: 15_000 });
  const [guardada] = await partidas();
  expect(guardada).toMatchObject({ status: "SOLVED", creditedPoints: 6 });
  expect(await creditos()).toHaveLength(1);

  // Ni el HTML ni las respuestas de las acciones trajeron la solución ni la semilla.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const visto = [await page.content(), ...cuerpos].join("\n");
  // El inicio y el cierre, como mínimo, y ninguno vacío: la comprobación no pasa en vacío.
  expect(cuerpos.length).toBeGreaterThanOrEqual(2);
  expect(cuerpos.every((cuerpo) => cuerpo.length > 0)).toBe(true);
  expect(cuerpos.some((cuerpo) => cuerpo.includes(run.givens))).toBe(true);
  expect(visto).not.toContain(run.solution);
  expect(visto).not.toContain(run.seed);

  // El segundo tablero del día se resuelve igual y se guarda, pero no acredita otra vez.
  const segunda = await empezar(page, FACIL, SIN_AYUDAS);
  await resolver(page, segunda);
  await expect(juego.getByText(t("T-2709"))).toBeVisible({
    timeout: 15_000,
  });
  expect(await partidas()).toHaveLength(2);
  expect(await creditos()).toHaveLength(1);
  await expect(juego.getByText(t("T-2720"))).toBeVisible();
});

test("con ayudas marca el error al instante, da pistas y paga la mitad", async ({ page }) => {
  await abrir(page);
  const juego = page.locator("#sudoku");
  await opcion(page, CON_AYUDAS).click();
  await expect(juego.getByText(t("T-2686", { n: 1 }))).toBeVisible();
  const run = await empezar(page, FACIL, CON_AYUDAS);
  expect(run).toMatchObject({ difficulty: "EASY", assisted: true });
  const [una, otra] = vacias(run.givens);
  if (una === undefined || otra === undefined) throw new Error("Tablero sin casillas vacías");

  // Un dígito que no es el de la solución se marca al instante, con su aviso.
  const malo = String((Number(run.solution[una]) % 9) + 1);
  await casilla(page, una).click();
  await page.keyboard.press(malo);
  await expect(casilla(page, una)).toHaveAccessibleName(new RegExp(`${tList("T-2698")[3]}$`));
  await expect(casilla(page, una)).toHaveAttribute("aria-invalid", "true");
  // Borrarlo deja la casilla vacía: si se quedara, podría chocar con la pista de al lado.
  await page.keyboard.press("Backspace");
  await expect(casilla(page, una)).toHaveAccessibleName(new RegExp(`${tList("T-2698")[0]}$`));

  // La pista revela la casilla elegida y la deja fija.
  await casilla(page, otra).click();
  await juego.getByRole("button", { name: tList("T-2701")[3] }).click();
  await expect(casilla(page, otra)).toHaveAccessibleName(
    new RegExp(`: ${run.solution[otra]}, pista$`),
  );
  await expect(casilla(page, otra)).toHaveAttribute("aria-readonly", "true");
  await page.keyboard.press(malo);
  await expect(casilla(page, otra)).toHaveAccessibleName(
    new RegExp(`: ${run.solution[otra]}, pista$`),
  );

  await resolver(page, run, [otra]);
  await expect(juego.getByText(t("T-2708", { n: 1 }))).toBeVisible({ timeout: 15_000 });
  expect((await partidas())[0]).toMatchObject({ status: "SOLVED", creditedPoints: 1 });
});

test("recargar conserva dígitos y notas, y abandonar deja elegir otra dificultad", async ({
  page,
}) => {
  await abrir(page);
  const juego = page.locator("#sudoku");
  const run = await empezar(page, MEDIO, SIN_AYUDAS);
  const [una, otra] = vacias(run.givens);
  if (una === undefined || otra === undefined) throw new Error("Tablero sin casillas vacías");
  await casilla(page, una).click();
  await page.keyboard.press(run.solution[una] as string);
  // Notas a lápiz con la tecla N; después deshacer quita la última.
  await casilla(page, otra).click();
  await page.keyboard.press("n");
  await page.keyboard.press("1");
  await page.keyboard.press("5");
  await page.keyboard.press("9");
  await expect(casilla(page, otra)).toHaveAccessibleName(
    new RegExp(`${copyPattern("T-2699", { notas: "1, 5, 9" }).source}$`),
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(casilla(page, otra)).toHaveAccessibleName(
    new RegExp(`${copyPattern("T-2699", { notas: "1, 5" }).source}$`),
  );
  // Las flechas mueven la selección dentro de la grilla.
  await casilla(page, 40).click();
  await page.keyboard.press("ArrowRight");
  await expect(casilla(page, 41)).toBeFocused();
  await expect(casilla(page, 41)).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expect(juego.getByText(t("T-2691", { dificultad: MEDIO, modo: SIN_AYUDAS }))).toBeVisible();
  await juego.getByRole("button", { name: t("T-2692") }).click();
  await expect(casilla(page, una)).toHaveAccessibleName(new RegExp(`: ${run.solution[una]}$`));
  await expect(casilla(page, otra)).toHaveAccessibleName(
    new RegExp(`${copyPattern("T-2699", { notas: "1, 5" }).source}$`),
  );
  expect(await partidas()).toHaveLength(1);

  await juego.getByRole("button", { name: t("T-2693") }).click();
  await juego.getByRole("button", { name: tList("T-2695")[0] }).click();
  await expect(juego.getByRole("button", { name: t("T-2687") })).toBeVisible();
  expect((await partidas())[0]?.status).toBe("ABANDONED");
  const nueva = await empezar(page, FACIL, SIN_AYUDAS);
  expect(nueva.id).not.toBe(run.id);
  expect(await creditos()).toHaveLength(0);
});

test("en móvil se juega con el teclado en pantalla y sin desbordar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  const juego = page.locator("#sudoku");
  await sinViolaciones(page);
  const run = await empezar(page, FACIL, CON_AYUDAS);
  const [una, otra, tercera] = vacias(run.givens);
  if (una === undefined || otra === undefined || tercera === undefined) {
    throw new Error("Tablero sin casillas vacías");
  }
  const teclado = juego.getByRole("group", { name: t("T-2700") });
  await casilla(page, una).click();
  await teclado.getByRole("button", { name: run.solution[una] as string, exact: true }).click();
  await expect(casilla(page, una)).toHaveAccessibleName(new RegExp(`: ${run.solution[una]}$`));
  // Un error, una nota y una pista: los tres estados que llevan marca propia, para que axe los vea.
  await casilla(page, otra).click();
  const malo = String((Number(run.solution[otra]) % 9) + 1);
  await teclado.getByRole("button", { name: malo, exact: true }).click();
  await casilla(page, tercera).click();
  await teclado.getByRole("button", { name: tList("T-2701")[1] }).click();
  await teclado.getByRole("button", { name: "3", exact: true }).click();
  await teclado.getByRole("button", { name: "7", exact: true }).click();
  await expect(casilla(page, tercera)).toHaveAccessibleName(
    new RegExp(`${copyPattern("T-2699", { notas: "3, 7" }).source}$`),
  );

  const lado = await casilla(page, 0).evaluate((node) => node.getBoundingClientRect().width);
  expect(lado).toBeGreaterThanOrEqual(34);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/sudoku-movil-claro.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/sudoku-movil-oscuro.png", fullPage: true });
});
