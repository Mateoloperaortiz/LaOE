import { expect, test } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { drenarOutbox } from "./outbox";

// Anuncios con push (ADR-038 regla 6): el miembro registra un dispositivo ficticio, ADMIN publica y
// avisa por push, la prueba drena el outbox (en CI el poller está apagado), el registro de mensajes
// muestra la fila del miembro y el anuncio interno abre en Mi OE. En local con VAPID el endpoint
// ficticio falla: se acepta Enviado o Fallido.

const ENDPOINT = "https://push.example.invalid/e2e-cartelera";
const TITULO = "e2e-anuncio-con-push";

test.describe("el miembro tiene un dispositivo", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("registra la suscripción ficticia", async ({ page }) => {
    const saved = await page.request.post("/api/push/subscribe", {
      data: { endpoint: ENDPOINT, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
    });
    expect(saved.status()).toBe(200);
  });
});

test.describe("ADMIN publica y avisa por push", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("el anuncio de miembros sale por push y queda en el registro de mensajes", async ({
    page,
  }) => {
    await page.goto("/admin/cartelera");
    await page.getByRole("link", { name: "Nuevo" }).click();
    const panel = page.getByRole("complementary");
    await panel.getByLabel("Título").fill(TITULO);
    await panel
      .getByLabel("Cuerpo (Markdown)")
      .fill("Primera línea del anuncio.\n\nSegunda línea.");
    await panel.getByLabel("Audiencia").selectOption("MEMBERS");
    await panel.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();

    const fila = page.getByRole("row", { name: new RegExp(TITULO) });
    await expect(fila.getByText("—")).toBeVisible();
    await fila.getByRole("button", { name: "Publicar y avisar por push", exact: true }).click();
    await expect(fila.getByText("Enviando")).toBeVisible();
    await drenarOutbox();
    await page.reload();
    await expect(
      page.getByRole("row", { name: new RegExp(TITULO) }).getByText(/Enviado a \d+/),
    ).toBeVisible();

    await page.goto("/admin/mensajes?kind=ANNOUNCEMENT");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mensajes");
    const mensaje = page.getByRole("row", { name: new RegExp(TITULO) }).first();
    await expect(mensaje).toContainText("Miembro E2E");
    await expect(mensaje).toContainText("Push");
    await expect(mensaje).toContainText(/Enviado|Fallido/);
    await sinViolaciones(page);
  });
});

test.describe("el miembro abre el anuncio interno", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("desde la cartelera de Mi OE", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: TITULO }).click();
    await expect(page).toHaveURL(/\/app\/cartelera\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITULO);
    await expect(page.getByText("Segunda línea.")).toBeVisible();
    await sinViolaciones(page);
    await page.request.delete("/api/push/subscribe", { data: { endpoint: ENDPOINT } });
  });
});
