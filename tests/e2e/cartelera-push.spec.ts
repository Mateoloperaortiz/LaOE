import { expect } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

// Anuncios con push (ADR-038 regla 6): el miembro registra un dispositivo ficticio, ADMIN publica y
// avisa por push, la prueba drena el outbox (en CI el poller está apagado), el registro de mensajes
// muestra el envío por consola y el anuncio interno abre en Mi OE.

const ENDPOINT = "https://push.example.invalid/e2e-cartelera";
const TITULO = `e2e-anuncio-con-push-${Date.now().toString(36)}`;

test("registrar dispositivo, publicar con push y leer el anuncio", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Falta la URL del servidor E2E");
  await test.step("registra la suscripción ficticia", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/member.json",
    });
    try {
      const page = await context.newPage();

      const saved = await page.request.post("/api/push/subscribe", {
        data: { endpoint: ENDPOINT, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
      });
      expect(saved.status()).toBe(200);
    } finally {
      await context.close();
    }
  });
  await test.step("el anuncio de miembros sale por push y queda en el registro de mensajes", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/cartelera");
      await page.getByRole("link", { name: "Nuevo" }).click();
      const panel = page.getByRole("dialog");
      await panel.getByLabel("Título").fill(TITULO);
      await panel
        .getByLabel("Cuerpo (Markdown)")
        .fill("Primera línea del anuncio.\n\nSegunda línea.");
      await panel.getByLabel("Audiencia").selectOption("MEMBERS");
      await panel.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Guardado.")).toBeVisible();

      const fila = page.getByRole("row", { name: new RegExp(TITULO) });
      await expect(fila.locator('td[data-label="Push"]')).toHaveText("—");
      await fila.locator("summary", { hasText: "Acciones" }).click();
      await fila.getByRole("button", { name: "Publicar y avisar por push", exact: true }).click();
      await expect(fila.getByText("Enviando")).toBeVisible();
      await drenarOutbox();
      await page.reload();
      await expect(
        page.getByRole("row", { name: new RegExp(TITULO) }).getByText(/Enviado a \d+/),
      ).toBeVisible();

      await page.goto("/admin/mensajes?kind=ANNOUNCEMENT");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mensajes");
      const mensaje = page.getByRole("row", { name: new RegExp(`Miembro E2E.*${TITULO}`) }).first();
      await expect(mensaje).toContainText("Miembro E2E");
      await expect(mensaje).toContainText("Push");
      await expect(mensaje).toContainText("Enviado");
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
  await test.step("desde la cartelera de Mi OE", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/member.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/app");
      await page.getByRole("link", { name: TITULO }).click();
      await expect(page).toHaveURL(/\/app\/cartelera\/[a-z0-9]+$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITULO);
      await expect(page.getByText("Segunda línea.")).toBeVisible();
      await sinViolaciones(page);
      await page.request.delete("/api/push/subscribe", { data: { endpoint: ENDPOINT } });
    } finally {
      await context.close();
    }
  });
});
