import { expect } from "@playwright/test";
import sharp from "sharp";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });

const sample = async (name = "e2e-foto-seleccionada.png") => ({
  name,
  mimeType: "image/png",
  buffer: await sharp({ create: { width: 80, height: 80, channels: 3, background: "#001f3e" } })
    .png({ compressionLevel: 0 })
    .toBuffer(),
});

test("la foto se revisa antes de subir, bloquea dobles envíos y conserva el archivo para reintentar", async ({
  page,
}) => {
  let presigns = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/media/presign", async (route) => {
    presigns += 1;
    await held;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fallo temporal de prueba" }),
    });
  });
  await page.goto("/app/ajustes");
  const photo = page.locator("form").filter({ has: page.locator('input[type="file"]') });
  const picker = photo.locator('input[type="file"]');
  const selected = await sample();
  expect(selected.buffer.byteLength).toBeGreaterThanOrEqual(5 * 1024);
  expect(selected.buffer.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);
  await picker.setInputFiles(selected);
  await expect(photo.getByAltText("Vista previa de la foto seleccionada")).toBeVisible();
  await expect(photo.getByText(/e2e-foto-seleccionada\.png · .* KB/)).toBeVisible();
  expect(presigns).toBe(0);
  await photo.getByRole("button", { name: "Quitar selección", exact: true }).click();
  await expect(photo.getByRole("button", { name: "Guardar foto", exact: true })).toBeDisabled();
  await picker.setInputFiles(await sample("e2e-foto-reemplazada.png"));
  await photo.getByRole("button", { name: "Guardar foto", exact: true }).click();
  await expect.poll(() => presigns).toBe(1);
  await expect(picker).toBeDisabled();
  await expect(
    photo.getByRole("button", { name: "Reemplazar selección", exact: true }),
  ).toBeDisabled();
  await expect(photo.getByRole("button", { name: "Quitar selección", exact: true })).toBeDisabled();
  await expect(photo.getByRole("button", { name: "Guardar foto", exact: true })).toBeDisabled();
  await photo.evaluate((form) => (form as HTMLFormElement).requestSubmit());
  release();
  await expect(photo.getByRole("alert")).toHaveText("Fallo temporal de prueba");
  expect(presigns).toBe(1);
  await expect(photo.getByText(/e2e-foto-reemplazada\.png/)).toBeVisible();
  expect(await picker.evaluate((input) => (input as HTMLInputElement).files?.[0]?.name)).toBe(
    "e2e-foto-reemplazada.png",
  );
  await page.unroute("**/api/media/presign");
  const confirmed = page.waitForResponse(
    (response) => response.url().includes("/api/media/confirm") && response.status() === 201,
  );
  await photo.getByRole("button", { name: "Guardar foto", exact: true }).click();
  await confirmed;
  await expect(
    photo.getByText("Listo: la imagen queda disponible en unos segundos."),
  ).toBeVisible();
  await expect(photo.getByRole("button", { name: "Guardar foto", exact: true })).toBeDisabled();
  await photo.getByRole("button", { name: "Quitar foto", exact: true }).click();
  await expect(photo.getByText("Listo, quitamos tu foto.")).toBeVisible();
});

test("una foto inválida no puede enviarse", async ({ page }) => {
  let uploads = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/media/presign")) uploads += 1;
  });
  await page.goto("/app/ajustes");
  const photo = page.locator("form").filter({ has: page.locator('input[type="file"]') });
  await photo.locator('input[type="file"]').setInputFiles({
    name: "e2e-invalido.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("No es una imagen"),
  });
  await expect(photo.getByRole("alert")).toHaveText(
    "La foto debe ser JPG, PNG o WebP de entre 5 KB y 5 MB.",
  );
  await expect(photo.getByRole("button", { name: "Guardar foto", exact: true })).toBeDisabled();
  expect(uploads).toBe(0);
});

test("una foto de menos de 5 KB se valida antes de transferir", async ({ page }) => {
  let uploads = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/media/presign")) uploads += 1;
  });
  const buffer = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "#001f3e" },
  })
    .png()
    .toBuffer();
  expect(buffer.byteLength).toBeLessThan(5 * 1024);
  await page.goto("/app/ajustes");
  const photo = page.locator("form").filter({ has: page.locator('input[type="file"]') });
  await photo
    .locator('input[type="file"]')
    .setInputFiles({ name: "e2e-foto-pequena.png", mimeType: "image/png", buffer });
  await expect(photo.getByRole("alert")).toHaveText(
    "La foto debe ser JPG, PNG o WebP de entre 5 KB y 5 MB.",
  );
  await expect(photo.getByRole("button", { name: "Guardar foto", exact: true })).toBeDisabled();
  expect(uploads).toBe(0);
});

test("un error de contacto conserva los dos campos, enfoca el inválido y permite corregirlo", async ({
  page,
}) => {
  await page.goto("/app/ajustes");
  const phone = page.getByLabel("Celular", { exact: true });
  const personalEmail = page.getByLabel("Correo personal", { exact: true });
  await phone.fill("celular-no-valido");
  await personalEmail.fill("reintento-ux@example.invalid");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(phone).toBeFocused();
  await expect(phone).toHaveValue("celular-no-valido");
  await expect(personalEmail).toHaveValue("reintento-ux@example.invalid");
  await phone.fill("3005551234");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Guardado.", { exact: true })).toBeVisible();
  await expect(phone).toHaveValue("+573005551234");
  await expect(personalEmail).toHaveValue("reintento-ux@example.invalid");
});

test("las preferencias conservan casillas tras error y guardado sin reinicio automático", async ({
  page,
}) => {
  await page.goto("/app/ajustes#notificaciones");
  const notifications = page.locator("#notificaciones");
  const announcements = notifications.getByLabel("Anuncios de la cartelera", { exact: true });
  const points = notifications.locator('input[name="pushPoints"]');
  const originalAnnouncements = await announcements.isChecked();
  const originalPoints = await points.isChecked();
  await announcements.setChecked(!originalAnnouncements);
  await points.setChecked(!originalPoints);
  let attempts = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/app/ajustes*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts += 1;
    await held;
    await route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "Fallo temporal de prueba",
    });
  });
  await notifications.getByRole("button", { name: "Guardar preferencias", exact: true }).click();
  await expect.poll(() => attempts).toBe(1);
  await expect(announcements).toBeDisabled();
  await expect(points).toBeDisabled();
  release();
  const error = notifications.getByRole("alert");
  await expect(error).toHaveText(
    "No pudimos guardar. Conservamos tus cambios para que lo intentés de nuevo.",
  );
  await expect(error).toBeFocused();
  await expect(announcements).toBeChecked({ checked: !originalAnnouncements });
  await expect(points).toBeChecked({ checked: !originalPoints });
  await page.unroute("**/app/ajustes*");
  await notifications.getByRole("button", { name: "Guardar preferencias", exact: true }).click();
  await expect(notifications.getByText("Listo, guardamos tus preferencias.")).toBeVisible();
  await expect(announcements).toBeChecked({ checked: !originalAnnouncements });
  await expect(points).toBeChecked({ checked: !originalPoints });
  await page.reload();
  await expect(announcements).toBeChecked({ checked: !originalAnnouncements });
  await expect(points).toBeChecked({ checked: !originalPoints });
  await announcements.setChecked(originalAnnouncements);
  await points.setChecked(originalPoints);
  await notifications.getByRole("button", { name: "Guardar preferencias", exact: true }).click();
  await expect(notifications.getByText("Listo, guardamos tus preferencias.")).toBeVisible();
});

for (const width of [360, 390, 768, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`ajustes por categorías y sesiones accesibles a ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/app/ajustes#sesiones");
      const sections = page.getByRole("navigation", { name: "Ajustes", exact: true });
      const sessions = page.locator("#sesiones");
      await expect(sessions).toBeVisible();
      await expect(page.locator("#mis-datos")).toBeHidden();
      await expect(sections.getByRole("link", { name: "Sesiones", exact: true })).toHaveAttribute(
        "aria-current",
        "location",
      );
      await expect(
        sessions.getByRole("cell", { name: "Este dispositivo", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      expect(
        await sessions.locator("table").evaluate((table) => table.scrollWidth <= table.clientWidth),
      ).toBe(true);
      await sinViolaciones(page);
      await page.screenshot({
        path: testInfo.outputPath(`ajustes-sesiones-${width}-${theme}.png`),
        fullPage: true,
      });
      const notifications = sections.getByRole("link", { name: "Notificaciones", exact: true });
      await notifications.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#notificaciones")).toBeVisible();
      await expect(sessions).toBeHidden();
      await expect(page).toHaveURL(/#notificaciones$/);
      await sinViolaciones(page);
      await page.reload();
      await expect(page.locator("#notificaciones")).toBeVisible();
      await sections.getByRole("link", { name: "Mis datos", exact: true }).click();
      await expect(page.locator("#mis-datos")).toBeVisible();
      await sinViolaciones(page);
      await page.screenshot({
        path: testInfo.outputPath(`ajustes-foto-${width}-${theme}.png`),
        fullPage: true,
      });
      for (const label of ["Calendario", "Consentimientos", "Mis datos y privacidad"]) {
        await sections.getByRole("link", { name: label, exact: true }).click();
        await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await sinViolaciones(page);
      }
    });
  }
}
