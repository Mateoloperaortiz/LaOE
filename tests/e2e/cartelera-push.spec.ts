import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
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
      await page.getByRole("link", { name: t("T-251") }).click();
      const panel = page.getByRole("dialog");
      await panel.getByLabel(t("T-335")).fill(TITULO);
      await panel.getByLabel(t("T-336")).fill("Primera línea del anuncio.\n\nSegunda línea.");
      await panel.getByLabel(t("T-338")).selectOption("MEMBERS");
      await panel.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();

      const fila = page.getByRole("row", { name: new RegExp(TITULO) });
      await expect(fila.locator(`td[data-label="${t("T-1113")}"]`)).toHaveText(tList("T-1114")[0]);
      await fila.locator("summary", { hasText: t("T-1426") }).click();
      await fila.getByRole("button", { name: t("T-1111"), exact: true }).click();
      await expect(fila.getByText(tList("T-1114")[1])).toBeVisible();
      await drenarOutbox();
      await page.reload();
      await expect(
        page
          .getByRole("row", { name: new RegExp(TITULO) })
          .getByText(new RegExp(tList("T-1114")[2].replace("{n}", "\\d+"))),
      ).toBeVisible();

      await page.goto("/admin/mensajes?kind=ANNOUNCEMENT");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-1142"));
      const mensaje = page.getByRole("row", { name: new RegExp(`Miembro E2E.*${TITULO}`) }).first();
      await expect(mensaje).toContainText("Miembro E2E");
      await expect(mensaje).toContainText(tList("T-1145")[1]);
      await expect(mensaje).toContainText(tList("T-1147")[0]);
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
