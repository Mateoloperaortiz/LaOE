import { expect, type Page } from "@playwright/test";
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

const [headline] = t("T-033").split(". ");
const TITLE = "e2e-Error por área";

/** Corta los POST de esas páginas: la acción de servidor de un formulario directo rechaza. */
async function dropActions(page: Page, glob: string): Promise<void> {
  await page.route(glob, (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
}

test.describe("/admin", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("un error en una página de /admin se muestra dentro del área, con su navegación, y «Intentar de nuevo» devuelve la página", async ({
    page,
  }) => {
    const db = getDb();
    const [current] = await db
      .select({ id: term.id })
      .from(term)
      .where(eq(term.code, E2E_TERM.code));
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
    await dropActions(page, "**/admin/ocasiones/**");
    await page.getByRole("button", { name: tList("T-588")[0] }).click();

    await expect(content.getByRole("heading", { level: 1 })).toHaveText(`${headline}.`);
    await expect(page.locator(".admin-navigation:visible").first()).toBeVisible();
    await sinViolaciones(page);

    await page.unroute("**/admin/ocasiones/**");
    await content.getByRole("button", { name: t("T-230"), exact: true }).click();
    await expect(content.getByRole("heading", { level: 1 })).toHaveText(
      t("T-584", { título: TITLE }),
    );
  });
});

test.describe("/app", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("un error en una página de /app se muestra dentro del área, con su navegación, y «Intentar de nuevo» devuelve la página", async ({
    page,
  }) => {
    await page.goto("/app/ajustes");
    const content = page.locator("#member-content");
    await expect(content.getByRole("heading", { level: 1 })).toHaveText(t("T-418"));
    await page
      .getByRole("navigation", { name: t("T-418"), exact: true })
      .getByRole("link", { name: tList("T-133")[4], exact: true })
      .click();
    await dropActions(page, "**/app/ajustes**");
    await page
      .locator("li", { hasText: tList("T-516")[2] })
      .getByRole("button", { name: tList("T-413")[0], exact: true })
      .click();

    await expect(content.getByRole("heading", { level: 1 })).toHaveText(`${headline}.`);
    await expect(page.getByRole("navigation", { name: t("T-1663"), exact: true })).toBeVisible();
    await sinViolaciones(page);

    await page.unroute("**/app/ajustes**");
    await content.getByRole("button", { name: t("T-230"), exact: true }).click();
    await expect(content.getByRole("heading", { level: 1 })).toHaveText(t("T-418"));
  });
});
