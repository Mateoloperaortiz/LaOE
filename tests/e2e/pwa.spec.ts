import { expect, type Page } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// PWA y notificaciones (ADR-038 reglas 4 y 5): manifest e iconos, service worker, suscripción de un
// dispositivo (ficticio: el navegador de pruebas no llega a un servicio de push), preferencias y baja
// del dispositivo. Como miembro sin permisos.
test.use({ storageState: "tests/e2e/.auth/member.json" });

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/e2e-dispositivo";

// El aviso T-1082 del guardado anterior sigue en pantalla mientras corre el siguiente, así que no
// sirve de espera: una recarga en ese momento lee las preferencias de antes. Next responde la acción
// cuando esta ya terminó.
async function guardarPreferencias(page: Page) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/app/ajustes",
    ),
    page
      .locator("#notificaciones")
      .getByRole("button", { name: t("T-1083") })
      .click(),
  ]);
  await expect(page.getByText(t("T-1082"))).toBeVisible();
}

test("el manifest lista iconos que responden PNG y el service worker se sirve como JavaScript", async ({
  page,
}) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const body = (await manifest.json()) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    icons: Array<{ src: string; purpose?: string }>;
  };
  expect(body.short_name).toBe(t("T-1173"));
  expect(body.start_url).toBe("/app");
  expect(body.display).toBe("standalone");
  expect(body.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  for (const icon of body.icons) {
    const response = await page.request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  const sw = await page.request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toMatch(/javascript/);
  expect(await sw.text()).toContain("notificationclick");
});

test("un dispositivo se registra, se ve en Ajustes, las preferencias se guardan y el dispositivo se quita", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: tList("T-1092")[0] })).toBeVisible();

  const saved = await page.request.post("/api/push/subscribe", {
    data: { endpoint: ENDPOINT, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
  });
  expect(saved.status()).toBe(200);
  expect((await saved.json()) as { created: boolean }).toMatchObject({ created: true });

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: tList("T-1092")[0] })).toHaveCount(0);

  await page.goto("/app/ajustes#notificaciones");
  const notificaciones = page.locator("#notificaciones");
  await expect(notificaciones.getByRole("heading", { name: t("T-1074") })).toBeVisible();
  await expect(notificaciones.locator("tbody").getByRole("row")).toHaveCount(1);
  await sinViolaciones(page);

  const anuncios = notificaciones.getByLabel(tList("T-1080")[0]);
  await expect(anuncios).toBeChecked();
  await anuncios.uncheck();
  await guardarPreferencias(page);
  await expect(page.locator("#notificaciones").getByLabel(tList("T-1080")[0])).not.toBeChecked();
  await page.locator("#notificaciones").getByLabel(tList("T-1080")[0]).check();
  await guardarPreferencias(page);
  await expect(page.locator("#notificaciones").getByLabel(tList("T-1080")[0])).toBeChecked();

  // El Wordle tiene su propia casilla y se apaga sin tocar las demás (ADR-074 regla 4).
  const wordle = page.locator("#notificaciones").getByLabel(tList("T-1080")[4]);
  await expect(wordle).toBeChecked();
  await wordle.uncheck();
  await guardarPreferencias(page);
  await page.reload();
  await expect(page.locator("#notificaciones").getByLabel(tList("T-1080")[4])).not.toBeChecked();
  for (const otra of tList("T-1080").slice(0, 4)) {
    await expect(page.locator("#notificaciones").getByLabel(otra)).toBeChecked();
  }

  await page
    .locator("#notificaciones")
    .getByRole("button", { name: t("T-1077") })
    .click();
  await expect(page.getByText(t("T-1110"))).toBeVisible();
  await expect(page.locator("#notificaciones").locator("tbody")).toHaveCount(0);
});
