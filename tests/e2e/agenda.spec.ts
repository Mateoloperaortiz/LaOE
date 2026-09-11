import { expect } from "@playwright/test";
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
      await page.getByRole("link", { name: "Nuevo" }).click();
      const panel = page.getByRole("dialog");
      await panel.getByLabel("Título").fill(TITULO);
      await panel.getByLabel("Empieza").fill(manana());
      await panel.getByLabel("Lugar").fill("Bloque 29");
      await panel.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Guardado.")).toBeVisible();
      const fila = page.getByRole("row", { name: new RegExp(TITULO) });
      await fila.getByRole("button", { name: "Abrir", exact: true }).click();
      await expect(fila.getByText("Abierta")).toBeVisible();
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
      await expect(calendario.getByRole("heading", { name: "Calendario" })).toBeVisible();
      const url = await calendario.getByLabel("Mi agenda OE").inputValue();
      expect(url).toMatch(/\/api\/ics\/mi-agenda\.ics\?t=[A-Za-z0-9_-]{24,}$/);
      await expect(
        calendario.getByRole("link", { name: "Abrir en mi calendario" }),
      ).toHaveAttribute("href", /^webcal:\/\//);
      await sinViolaciones(page);

      const ics = await page.request.get(url, { headers: { cookie: "" } });
      expect(ics.status()).toBe(200);
      expect(ics.headers()["content-type"]).toContain("text/calendar");
      const cuerpo = await ics.text();
      expect(cuerpo).toContain("X-WR-CALNAME:Mi agenda OE");
      expect(cuerpo).toContain(`SUMMARY:${TITULO}`);
      expect(cuerpo).toContain("UID:ocasion-");

      await calendario.getByRole("button", { name: "Regenerar enlace" }).click();
      await expect(page.getByText("Listo. El enlace anterior dejó de funcionar.")).toBeVisible();
      const nueva = await page.locator("#calendario").getByLabel("Mi agenda OE").inputValue();
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
