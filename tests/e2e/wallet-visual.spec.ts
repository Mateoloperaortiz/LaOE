import { expect, type Page, type TestInfo } from "@playwright/test";
import { getDb } from "@/db/client";
import { message } from "@/modules/comms/schema";
import { t } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/member.json" });

const syntheticLongName =
  "Alejandra Valentina de los Ríos Montenegro y María Fernanda de la Concepción";

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  fullPage = true,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectNoOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>(".cartel h2");
    const poster = document.querySelector<HTMLElement>(".cartel");
    const qr = document.querySelector<HTMLElement>("figure[data-token]");
    if (!title || !poster || !qr) throw new Error("Falta el carnet en la captura visual");
    const posterBounds = poster.getBoundingClientRect();
    const qrBounds = qr.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      titleOverflow: title.scrollWidth - title.clientWidth,
      qrClippedLeft: posterBounds.left - qrBounds.left,
      qrClippedRight: qrBounds.right - posterBounds.right,
    };
  });
  for (const [element, overflow] of Object.entries(dimensions)) {
    expect
      .soft(overflow, `${element}: no debe desbordar ni quedar recortado`)
      .toBeLessThanOrEqual(1);
  }
}

for (const width of [375, 768, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`carnet y Apple Wallet: ${width}px, tema ${theme}, nombre largo y foco`, async ({
      page,
      browser,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript((savedTheme) => localStorage.setItem("oe-tema", savedTheme), theme);
      await page.goto("/app/carnet");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-131"));
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const name = page.locator(".cartel h2");
      await expect(name).toHaveText("Miembro E2E");
      const apple = page.getByRole("link", { name: t("T-1191"), exact: true });
      await expect(apple).toBeVisible();
      await expect(apple).toHaveAttribute("href", "/api/wallet/apple");
      await expect
        .poll(() => apple.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
      // La suite usa Apple de juguete y Google apagado: se captura el diseño real,
      // sin insertar un badge ficticio ni abrir enlaces que emitan un pase.
      await expect(page.getByRole("link", { name: t("T-1192"), exact: true })).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));

      // La vuelta con Tab comprueba el foco de teclado sin activar el enlace.
      await apple.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await apple.scrollIntoViewIfNeeded();
      await capture(page, testInfo, `carnet-${width}-${theme}-foco-apple`);
      await expect(apple).toBeFocused();
      const focus = await apple.evaluate((link) => {
        const style = getComputedStyle(link);
        return {
          visible: link.matches(":focus-visible"),
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
        };
      });
      expect.soft(focus.visible).toBe(true);
      expect.soft(focus.outlineStyle).not.toBe("none");
      expect.soft(focus.outlineWidth).toBeGreaterThanOrEqual(2);
      await expectNoOverflow(page);
      await sinViolaciones(page);

      // Fixture visual sintético y local al DOM. No cambia la identidad persistida
      // ni envía formularios; su nombre largo permite revisar cortes y reflujo.
      await name.evaluate((heading, fullName) => {
        heading.textContent = fullName;
      }, syntheticLongName);
      await expect(name).toHaveText(syntheticLongName);
      // Tras mutar fuera del viewport, dejá que Chromium vuelva a pintar la capa del cartel.
      await name.scrollIntoViewIfNeeded();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await capture(page, testInfo, `carnet-${width}-${theme}-nombre-sintetico`);
      await expectNoOverflow(page);

      const exported = await (await page.request.get("/api/mis-datos")).json();
      // La región accesible se renderiza cuando hay mensajes: este caso prepara el suyo.
      await getDb().insert(message).values({
        personId: exported.person.id,
        channel: "EMAIL",
        subject: "Mensaje sintético E2E para comprobar el foco y el reflujo",
        status: "SENT",
        provider: "console",
        sentAt: new Date(),
      });
      const admin = await browser.newContext({
        storageState: "tests/e2e/.auth/admin.json",
        viewport: { width, height: 1000 },
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      try {
        await admin.addInitScript(
          (savedTheme) => localStorage.setItem("oe-tema", savedTheme),
          theme,
        );
        const adminPage = await admin.newPage();
        await adminPage.goto(`/admin/personas/${exported.person.id}?pestana=comunicaciones`);
        await expect(adminPage.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(
          adminPage.getByRole("heading", { name: t("T-1209"), exact: true }),
        ).toBeVisible();
        await adminPage.evaluate(() => document.fonts.ready.then(() => undefined));
        await adminPage
          .getByRole("heading", { name: t("T-1209"), exact: true })
          .scrollIntoViewIfNeeded();
        await capture(adminPage, testInfo, `wallet-360-${width}-${theme}`, false);
        if (width === 375) {
          const messages = adminPage.getByRole("region", { name: t("T-1142"), exact: true });
          await messages.focus();
          await expect(messages).toBeFocused();
          expect(
            await messages.evaluate((region) => region.scrollWidth <= region.clientWidth),
          ).toBe(true);
        }
        expect(
          await adminPage.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(1);
        await sinViolaciones(adminPage);
      } finally {
        await admin.close();
      }
    });
  }
}
