import { expect, test } from "@playwright/test";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { drenarOutbox } from "./outbox";

// Recordatorios (ADR-038 regla 9): el miembro tiene un dispositivo, ADMIN abre una actividad e2e- de
// hoy, la prueba encola el tick de las 07:00 de Bogotá y el registro de mensajes muestra la fila.

const ENDPOINT = "https://push.example.invalid/e2e-recordatorio";
const TITULO = `e2e-recordatorio-${Date.now().toString(36)}`;

/** Hoy en Bogotá (UTC-5) a la hora dada, en el formato de un `datetime-local`. */
function hoyBogota(hour: number): string {
  const local = new Date(Date.now() - 5 * 60 * 60_000);
  const day = local.toISOString().slice(0, 10);
  return `${day}T${String(hour).padStart(2, "0")}:00`;
}

test.describe("el miembro tiene un dispositivo", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });
  test("registra la suscripción ficticia", async ({ page }) => {
    const saved = await page.request.post("/api/push/subscribe", {
      data: { endpoint: ENDPOINT, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
    });
    expect(saved.status()).toBe(200);
  });
});

test.describe("ADMIN abre una actividad de hoy", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("el tick de las 07:00 deja el recordatorio en el registro de mensajes", async ({ page }) => {
    await page.goto("/admin/ocasiones");
    await page.getByRole("link", { name: "Nuevo" }).click();
    const panel = page.getByRole("complementary");
    await panel.getByLabel("Título").fill(TITULO);
    await panel.getByLabel("Empieza").fill(hoyBogota(23));
    await panel.getByLabel("Lugar").fill("Bloque 29");
    await panel.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
    const fila = page.getByRole("row", { name: new RegExp(TITULO) });
    await fila.getByRole("button", { name: "Abrir", exact: true }).click();
    await expect(fila.getByText("Abierta")).toBeVisible();

    const at = new Date(`${hoyBogota(7)}:00-05:00`).toISOString();
    await enqueueEvent(getDb(), { type: "participation.reminders", payload: { at } });
    await closeDb();
    await drenarOutbox();

    await page.goto("/admin/mensajes?kind=REMINDER");
    const mensaje = page.getByRole("row", { name: new RegExp(`Hoy: ${TITULO}`) }).first();
    await expect(mensaje).toBeVisible();
    await expect(mensaje).toContainText("Miembro E2E");
    await expect(mensaje).toContainText("Recordatorio");
    await page.request.delete("/api/push/subscribe", { data: { endpoint: ENDPOINT } });
  });
});
