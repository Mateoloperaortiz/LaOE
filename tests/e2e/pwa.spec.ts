import { expect, type Page } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// PWA y notificaciones (ADR-038 reglas 4 y 5): manifest e iconos, service worker, suscripción de un
// dispositivo (ficticio: el navegador de pruebas no llega a un servicio de push), preferencias y baja
// del dispositivo. Como miembro sin permisos.
test.use({ storageState: "tests/e2e/.auth/member.json" });

const ENDPOINT = "https://push.example.invalid/e2e-dispositivo";

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
    page.locator("#notificaciones").getByRole("button", { name: "Guardar preferencias" }).click(),
  ]);
  await expect(page.getByText("Listo, guardamos tus preferencias.")).toBeVisible();
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
  expect(body.short_name).toBe("Mi OE");
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
  await expect(page.getByRole("heading", { name: "Llevá Mi OE en el celular" })).toBeVisible();

  const saved = await page.request.post("/api/push/subscribe", {
    data: { endpoint: ENDPOINT, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
  });
  expect(saved.status()).toBe(200);
  expect((await saved.json()) as { created: boolean }).toMatchObject({ created: true });

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Llevá Mi OE en el celular" })).toHaveCount(0);

  await page.goto("/app/ajustes#notificaciones");
  const notificaciones = page.locator("#notificaciones");
  await expect(notificaciones.getByRole("heading", { name: "Tus dispositivos" })).toBeVisible();
  await expect(notificaciones.locator("tbody").getByRole("row")).toHaveCount(1);
  await sinViolaciones(page);

  const anuncios = notificaciones.getByLabel("Anuncios de la cartelera");
  await expect(anuncios).toBeChecked();
  await anuncios.uncheck();
  await guardarPreferencias(page);
  await expect(
    page.locator("#notificaciones").getByLabel("Anuncios de la cartelera"),
  ).not.toBeChecked();
  await page.locator("#notificaciones").getByLabel("Anuncios de la cartelera").check();
  await guardarPreferencias(page);
  await expect(
    page.locator("#notificaciones").getByLabel("Anuncios de la cartelera"),
  ).toBeChecked();

  // El Wordle tiene su propia casilla y se apaga sin tocar las demás (ADR-074 regla 4).
  const wordle = page.locator("#notificaciones").getByLabel("Wordle del día");
  await expect(wordle).toBeChecked();
  await wordle.uncheck();
  await guardarPreferencias(page);
  await page.reload();
  await expect(page.locator("#notificaciones").getByLabel("Wordle del día")).not.toBeChecked();
  for (const otra of [
    "Anuncios de la cartelera",
    "GH Points acreditados",
    "Recordatorios de actividades, asambleas y permanencia",
    "Campañas por correo",
  ]) {
    await expect(page.locator("#notificaciones").getByLabel(otra)).toBeChecked();
  }

  await page.locator("#notificaciones").getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByText("Listo, ese dispositivo ya no recibe notificaciones.")).toBeVisible();
  await expect(page.locator("#notificaciones").locator("tbody")).toHaveCount(0);
});
