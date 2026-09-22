import { expect } from "@playwright/test";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { test } from "./fixtures";
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

test("registrar dispositivo y recibir el recordatorio de la actividad", async ({
  browser,
  baseURL,
}) => {
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
  await test.step("el tick de las 07:00 deja el recordatorio en el registro de mensajes", async () => {
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
      await panel.getByLabel(tList("T-563")[7]).fill(hoyBogota(23));
      await panel.getByLabel(tList("T-563")[6]).fill("Bloque 29");
      await panel.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();
      const fila = page.getByRole("row", { name: new RegExp(TITULO) });
      await fila.getByRole("button", { name: tList("T-569")[0], exact: true }).click();
      await expect(fila.getByText(tList("T-568")[1])).toBeVisible();

      const at = new Date(`${hoyBogota(7)}:00-05:00`).toISOString();
      await enqueueEvent(getDb(), { type: "participation.reminders", payload: { at } });
      await closeDb();
      await drenarOutbox();

      await page.goto("/admin/mensajes?kind=REMINDER");
      const mensaje = page
        .getByRole("row", {
          name: new RegExp(
            `Miembro E2E.*${copyPattern("T-182", { actividad: TITULO }).source.split(" · ")[0]}`,
          ),
        })
        .first();
      await expect(mensaje).toBeVisible();
      await expect(mensaje).toContainText("Miembro E2E");
      await expect(mensaje).toContainText(tList("T-1146")[3]);
      await expect(mensaje).toContainText(tList("T-1147")[0]);
    } finally {
      await context.close();
    }
  });
  await test.step("el miembro retira el dispositivo sintético", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/member.json",
    });
    try {
      const removed = await context.request.delete("/api/push/subscribe", {
        data: { endpoint: ENDPOINT },
      });
      expect(removed.ok()).toBe(true);
    } finally {
      await context.close();
    }
  });
});
