import { expect } from "@playwright/test";
import sharp from "sharp";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { failConfirmations, rejectBucketUploads } from "./bucket-helper";
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
  await expect(photo.getByAltText(t("T-1625"))).toBeVisible();
  await expect(photo.getByText(/e2e-foto-seleccionada\.png · .* KB/)).toBeVisible();
  expect(presigns).toBe(0);
  await photo.getByRole("button", { name: t("T-1623"), exact: true }).click();
  await expect(photo.getByRole("button", { name: t("T-1620"), exact: true })).toBeDisabled();
  await picker.setInputFiles(await sample("e2e-foto-reemplazada.png"));
  await photo.getByRole("button", { name: t("T-1620"), exact: true }).click();
  await expect.poll(() => presigns).toBe(1);
  await expect(picker).toBeDisabled();
  await expect(photo.getByRole("button", { name: t("T-1622"), exact: true })).toBeDisabled();
  await expect(photo.getByRole("button", { name: t("T-1623"), exact: true })).toBeDisabled();
  await expect(photo.getByRole("button", { name: t("T-1620"), exact: true })).toBeDisabled();
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
  await photo.getByRole("button", { name: t("T-1620"), exact: true }).click();
  await confirmed;
  await expect(photo.getByText(t("T-360"))).toBeVisible();
  await expect(photo.getByRole("button", { name: t("T-1620"), exact: true })).toBeDisabled();
  await photo.getByRole("button", { name: t("T-409"), exact: true }).click();
  await expect(photo.getByText(t("T-1627"))).toBeVisible();
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
  await expect(photo.getByRole("alert")).toHaveText(t("T-419"));
  await expect(photo.getByRole("button", { name: t("T-1620"), exact: true })).toBeDisabled();
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
  await expect(photo.getByRole("alert")).toHaveText(t("T-419"));
  await expect(photo.getByRole("button", { name: t("T-1620"), exact: true })).toBeDisabled();
  expect(uploads).toBe(0);
});

test("si el bucket rechaza la foto se avisa con el texto de siempre, no se confirma y el archivo queda para reintentar", async ({
  page,
}) => {
  let confirmations = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/media/confirm")) confirmations += 1;
  });
  const bucket = await rejectBucketUploads(page, "/api/media/presign");
  await page.goto("/app/ajustes");
  const photo = page.locator("form").filter({ has: page.locator('input[type="file"]') });
  const picker = photo.locator('input[type="file"]');
  await picker.setInputFiles(await sample("e2e-foto-rechazada.png"));
  await photo.getByRole("button", { name: t("T-1620"), exact: true }).click();
  await expect(photo.getByRole("alert")).toHaveText(t("T-363"));
  expect(bucket.uploads).toBe(1);
  expect(confirmations).toBe(0);
  expect(await picker.evaluate((input) => (input as HTMLInputElement).files?.[0]?.name)).toBe(
    "e2e-foto-rechazada.png",
  );
  await expect(photo.getByRole("button", { name: t("T-1620"), exact: true })).toBeEnabled();
});

test("si la confirmación de la foto falla se muestra lo que dijo el servidor y, si no dijo nada, el texto de siempre", async ({
  page,
}) => {
  const confirm = await failConfirmations(
    page,
    "/api/media/confirm",
    "Confirmación de prueba rechazada.",
  );
  await page.goto("/app/ajustes");
  const photo = page.locator("form").filter({ has: page.locator('input[type="file"]') });
  const picker = photo.locator('input[type="file"]');
  await picker.setInputFiles(await sample("e2e-foto-sin-confirmar.png"));
  await photo.getByRole("button", { name: t("T-1620"), exact: true }).click();
  await expect(photo.getByRole("alert")).toHaveText("Confirmación de prueba rechazada.");
  expect(await picker.evaluate((input) => (input as HTMLInputElement).files?.[0]?.name)).toBe(
    "e2e-foto-sin-confirmar.png",
  );
  await photo.getByRole("button", { name: t("T-1620"), exact: true }).click();
  await expect(photo.getByRole("alert")).toHaveText(t("T-363"));
  expect(confirm.confirmations).toBe(2);
  await expect(photo.getByText(t("T-360"))).toHaveCount(0);
});

test("un error de contacto conserva los dos campos, enfoca el inválido y permite corregirlo", async ({
  page,
}) => {
  await page.goto("/app/ajustes");
  const phone = page.getByLabel(t("T-404"), { exact: true });
  const personalEmail = page.getByLabel(t("T-405"), { exact: true });
  await page.getByRole("textbox", { name: t("T-4100"), exact: true }).fill("00 11 22 33");
  await phone.fill("celular-no-valido");
  await personalEmail.fill("reintento-ux@example.invalid");
  await page.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(phone).toBeFocused();
  await expect(phone).toHaveValue("celular-no-valido");
  await expect(personalEmail).toHaveValue("reintento-ux@example.invalid");
  await phone.fill("3005551234");
  await page.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
  await expect(phone).toHaveValue("+573005551234");
  await expect(personalEmail).toHaveValue("reintento-ux@example.invalid");
});

test("las preferencias conservan casillas tras error y guardado sin reinicio automático", async ({
  page,
}) => {
  await page.goto("/app/ajustes#notificaciones");
  const notifications = page.locator("#notificaciones");
  const announcements = notifications.getByLabel(tList("T-1080")[0], { exact: true });
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
  await notifications.getByRole("button", { name: t("T-1083"), exact: true }).click();
  await expect.poll(() => attempts).toBe(1);
  await expect(announcements).toBeDisabled();
  await expect(points).toBeDisabled();
  release();
  const error = notifications.getByRole("alert");
  await expect(error).toHaveText(t("T-1629"));
  await expect(error).toBeFocused();
  await expect(announcements).toBeChecked({ checked: !originalAnnouncements });
  await expect(points).toBeChecked({ checked: !originalPoints });
  await page.unroute("**/app/ajustes*");
  await notifications.getByRole("button", { name: t("T-1083"), exact: true }).click();
  await expect(notifications.getByText(t("T-1082"))).toBeVisible();
  await expect(announcements).toBeChecked({ checked: !originalAnnouncements });
  await expect(points).toBeChecked({ checked: !originalPoints });
  await page.reload();
  await expect(announcements).toBeChecked({ checked: !originalAnnouncements });
  await expect(points).toBeChecked({ checked: !originalPoints });
  await announcements.setChecked(originalAnnouncements);
  await points.setChecked(originalPoints);
  await notifications.getByRole("button", { name: t("T-1083"), exact: true }).click();
  await expect(notifications.getByText(t("T-1082"))).toBeVisible();
});

for (const width of [360, 390, 768, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`ajustes por categorías y sesiones accesibles a ${width}px ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/app/ajustes#sesiones");
      const sections = page.getByRole("navigation", { name: t("T-418"), exact: true });
      const sessions = page.locator("#sesiones");
      await expect(sessions).toBeVisible();
      await expect(page.locator("#mis-datos")).toBeHidden();
      await expect(
        sections.getByRole("link", { name: tList("T-133")[3], exact: true }),
      ).toHaveAttribute("aria-current", "location");
      await expect(sessions.getByRole("cell", { name: t("T-232"), exact: true })).toBeVisible();
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
      const notifications = sections.getByRole("link", { name: tList("T-133")[1], exact: true });
      await notifications.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#notificaciones")).toBeVisible();
      await expect(sessions).toBeHidden();
      await expect(page).toHaveURL(/#notificaciones$/);
      await sinViolaciones(page);
      await page.reload();
      await expect(page.locator("#notificaciones")).toBeVisible();
      await sections.getByRole("link", { name: tList("T-133")[0], exact: true }).click();
      await expect(page.locator("#mis-datos")).toBeVisible();
      await sinViolaciones(page);
      await page.screenshot({
        path: testInfo.outputPath(`ajustes-foto-${width}-${theme}.png`),
        fullPage: true,
      });
      for (const label of [tList("T-133")[2], tList("T-133")[4], tList("T-133")[5]]) {
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
