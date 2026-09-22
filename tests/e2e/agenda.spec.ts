import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { withinTermInput } from "./calendar";
import { test } from "./fixtures";

// Calendario personal (ADR-038 regla 12): ADMIN abre una actividad general e2e-; el miembro toma la
// URL de su calendario desde Ajustes, la descarga sin sesión y ve la actividad; regenerar invalida la
// URL anterior.

const TITULO = `e2e-agenda-${Date.now().toString(36)}`;

function manana(): string {
  return withinTermInput();
}

test("crear actividad y suscribirse, descargar y regenerar el calendario", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Falta la URL del servidor E2E");
  await test.step("queda abierta", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/ocasiones");
      await page.getByRole("link", { name: t("T-251") }).click();
      const panel = page.getByRole("dialog");
      await panel.getByLabel(tList("T-563")[0]).fill(TITULO);
      await panel.getByLabel(tList("T-563")[7]).fill(manana());
      await panel.getByLabel(tList("T-563")[6]).fill("Bloque 29");
      await panel.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();
      const fila = page.getByRole("row", { name: new RegExp(TITULO) });
      await fila.getByRole("button", { name: tList("T-569")[0], exact: true }).click();
      await expect(fila.getByText(tList("T-568")[1])).toBeVisible();
    } finally {
      await context.close();
    }
  });
  await test.step("la URL de Ajustes devuelve un ICS con la actividad y regenerar la invalida", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/member.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/app/ajustes#calendario");
      const calendario = page.locator("#calendario");
      await expect(calendario.getByRole("heading", { name: tList("T-133")[2] })).toBeVisible();
      const url = await calendario.getByLabel(t("T-1085")).inputValue();
      expect(url).toMatch(/\/api\/ics\/mi-agenda\.ics\?t=[A-Za-z0-9_-]{24,}$/);
      await expect(calendario.getByRole("link", { name: t("T-1088") })).toHaveAttribute(
        "href",
        /^webcal:\/\//,
      );
      await sinViolaciones(page);

      const ics = await page.request.get(url, { headers: { cookie: "" } });
      expect(ics.status()).toBe(200);
      expect(ics.headers()["content-type"]).toContain("text/calendar");
      const cuerpo = await ics.text();
      expect(cuerpo).toContain(`X-WR-CALNAME:${t("T-1085")}`);
      expect(cuerpo).toContain(`SUMMARY:${TITULO}`);
      expect(cuerpo).toContain("UID:ocasion-");

      await calendario.getByRole("button", { name: t("T-1089") }).click();
      await expect(page.getByText(t("T-1090"))).toBeVisible();
      const nueva = await page.locator("#calendario").getByLabel(t("T-1085")).inputValue();
      expect(nueva).not.toBe(url);
      const vieja = await page.request.get(url);
      expect(vieja.status()).toBe(404);
      const vigente = await page.request.get(nueva);
      expect(vigente.status()).toBe(200);
    } finally {
      await context.close();
    }
  });
});
