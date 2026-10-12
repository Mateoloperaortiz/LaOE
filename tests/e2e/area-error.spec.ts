import { expect, type Locator, type Page, type Request } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedOccasion } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";

// La pantalla de error de cada área (ADR-122 regla 19): un error en una página de /admin o de /app se
// muestra dentro del área, con su navegación. No hay una ruta de prueba que lance al renderizar: el
// error se provoca con lo que hoy sí cae a la pantalla de error, un formulario directo cuya acción no
// llega a la casa (DT-256, inciso a, que espera la decisión abierta 47). Cuando esos formularios
// aguanten el rechazo, este spec necesita otro disparador.
//
// Cada área lleva dos casos de «Intentar de nuevo». Con la red de vuelta, la página vuelve. Con la red
// todavía caída, también: el botón llama `reset`, que vuelve a pintar lo que el navegador ya tenía y no
// le pide nada a la casa. Ese segundo caso es una caracterización de lo que pasa hoy, no una regla
// (DT-333, inciso c): qué tiene que hacer el botón sin red no lo decidió nadie y roza las decisiones
// abiertas 42 y 47. El `retry` de Next sí le pide la página a la casa, y sin red eso termina en una
// navegación del navegador: cambiar a `retry` pone en rojo ese caso, y así tiene que ser hasta que
// alguien lo decida.

const [headline] = t("T-033").split(". ");
const TITLE = "e2e-Error por área";

/** Corta los POST de esas páginas: la acción de servidor de un formulario directo rechaza. */
async function dropActions(page: Page, glob: string): Promise<void> {
  await page.route(glob, (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
}

/** Un pedido que le pide la página a la casa: la navegación del navegador o la de Next, sin precargas. */
function asksForThePage(request: Request): boolean {
  const headers = request.headers();
  return (
    request.isNavigationRequest() ||
    (request.method() === "GET" && headers.rsc === "1" && !("next-router-prefetch" in headers))
  );
}

/**
 * La red sigue caída: corta todo pedido, los GET también, y devuelve la lista, que se va llenando, de
 * los que le pidieron la página a la casa.
 */
async function dropNetwork(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route("**/*", (route) => {
    const request = route.request();
    if (asksForThePage(request)) {
      asked.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
    return route.abort();
  });
  return asked;
}

/** La página de una ocasión abierta en /admin y el botón de su formulario directo. */
async function openOccasion(page: Page): Promise<{ content: Locator; submit: Locator }> {
  const db = getDb();
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("sin término");
  const now = Date.now();
  const row = await seedOccasion(current.id, {
    publicId: "e2eerror01",
    title: TITLE,
    category: "TALK",
    points: 10,
    status: "OPEN",
    startsAt: new Date(now),
    checkInOpensAt: new Date(now - 3_600_000),
    checkInClosesAt: new Date(now + 3_600_000),
  });
  await closeDb();

  await page.goto(`/admin/ocasiones/${row.id}`);
  const content = page.locator("#admin-content");
  await expect(content.getByRole("heading", { level: 1 })).toHaveText(
    t("T-584", { título: TITLE }),
  );
  return { content, submit: page.getByRole("button", { name: tList("T-588")[0] }) };
}

/** La sección de Ajustes de /app que trae un formulario directo, y su botón. */
async function openSettings(page: Page): Promise<{ content: Locator; submit: Locator }> {
  await page.goto("/app/ajustes");
  const content = page.locator("#member-content");
  await expect(content.getByRole("heading", { level: 1 })).toHaveText(t("T-418"));
  await page
    .getByRole("navigation", { name: t("T-418"), exact: true })
    .getByRole("link", { name: tList("T-133")[4], exact: true })
    .click();
  const submit = page
    .locator("li", { hasText: tList("T-516")[2] })
    .getByRole("button", { name: tList("T-413")[0], exact: true });
  return { content, submit };
}

/**
 * «Intentar de nuevo» con todo pedido cortado: la página vuelve sin que salga un pedido por ella, y su
 * formulario, que sigue sin red, vuelve a caer a la pantalla de error. Ese segundo envío también le da
 * tiempo de salir a un pedido que el botón hubiera lanzado sin esperarlo.
 */
async function retryWithoutNetwork(
  page: Page,
  { content, submit }: { content: Locator; submit: Locator },
  title: string,
): Promise<void> {
  const url = page.url();
  const asked = await dropNetwork(page);
  await content.getByRole("button", { name: t("T-230"), exact: true }).click();
  await expect(content.getByRole("heading", { level: 1 })).toHaveText(title);

  await submit.click();
  await expect(content.getByRole("heading", { level: 1 })).toHaveText(`${headline}.`);
  expect(asked).toEqual([]);
  expect(page.url()).toBe(url);
}

test.describe("/admin", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("un error en una página de /admin se muestra dentro del área, con su navegación, y «Intentar de nuevo» devuelve la página", async ({
    page,
  }) => {
    const { content, submit } = await openOccasion(page);
    await dropActions(page, "**/admin/ocasiones/**");
    await submit.click();

    await expect(content.getByRole("heading", { level: 1 })).toHaveText(`${headline}.`);
    await expect(page.locator(".admin-navigation:visible").first()).toBeVisible();
    await sinViolaciones(page);

    await page.unroute("**/admin/ocasiones/**");
    await content.getByRole("button", { name: t("T-230"), exact: true }).click();
    await expect(content.getByRole("heading", { level: 1 })).toHaveText(
      t("T-584", { título: TITLE }),
    );
  });

  test("con la red todavía caída, «Intentar de nuevo» en /admin devuelve la página que el navegador ya tenía, sin pedírsela a la casa (DT-333 c; decisiones abiertas 42 y 47)", async ({
    page,
  }) => {
    const screen = await openOccasion(page);
    await dropActions(page, "**/admin/ocasiones/**");
    await screen.submit.click();
    await expect(screen.content.getByRole("heading", { level: 1 })).toHaveText(`${headline}.`);

    await retryWithoutNetwork(page, screen, t("T-584", { título: TITLE }));
    await expect(page.locator(".admin-navigation:visible").first()).toBeVisible();
  });
});

test.describe("/app", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("un error en una página de /app se muestra dentro del área, con su navegación, y «Intentar de nuevo» devuelve la página", async ({
    page,
  }) => {
    const { content, submit } = await openSettings(page);
    await dropActions(page, "**/app/ajustes**");
    await submit.click();

    await expect(content.getByRole("heading", { level: 1 })).toHaveText(`${headline}.`);
    await expect(page.getByRole("navigation", { name: t("T-1663"), exact: true })).toBeVisible();
    await sinViolaciones(page);

    await page.unroute("**/app/ajustes**");
    await content.getByRole("button", { name: t("T-230"), exact: true }).click();
    await expect(content.getByRole("heading", { level: 1 })).toHaveText(t("T-418"));
  });

  test("con la red todavía caída, «Intentar de nuevo» en /app devuelve la página que el navegador ya tenía, sin pedírsela a la casa (DT-333 c; decisiones abiertas 42 y 47)", async ({
    page,
  }) => {
    const screen = await openSettings(page);
    await dropActions(page, "**/app/ajustes**");
    await screen.submit.click();
    await expect(screen.content.getByRole("heading", { level: 1 })).toHaveText(`${headline}.`);

    await retryWithoutNetwork(page, screen, t("T-418"));
    await expect(page.getByRole("navigation", { name: t("T-1663"), exact: true })).toBeVisible();
  });
});
