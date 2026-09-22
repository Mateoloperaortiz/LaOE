import { expect } from "@playwright/test";
import { verifyCarnet } from "@/modules/identity/domain/carnet-pure";
import { t } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// Carnet (ADR-034 regla 10): el QR lleva un token firmado que `verifyCarnet` acepta.
test.use({ storageState: "tests/e2e/.auth/member.json" });

test("el carnet muestra un QR con un token firmado de 24 horas", async ({ page }) => {
  await page.goto("/app/carnet");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-131"));
  await expect(
    page.getByRole("heading", { level: 2, name: "Miembro E2E", exact: true }),
  ).toHaveText("Miembro E2E");
  const figura = page.locator("figure[data-token]");
  await expect(figura.locator("svg")).toBeVisible();
  await expect(figura.getByText(copyPattern("T-401"))).toBeVisible();
  const token = (await figura.getAttribute("data-token")) ?? "";
  const result = verifyCarnet(token, { secret: process.env.SESSION_SECRET ?? "" });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
  }
  await sinViolaciones(page);
});

interface CarnetExport {
  person: { id: string };
  carnet: { revision: number; walletEpoch: number; createdAt: string; lastUsedAt: string | null };
  walletPasses: Array<{ platform: "APPLE" | "GOOGLE"; lastIssuedAt: string | null }>;
}

// El servidor de la suite siempre tiene Apple de juguete y Google apagado (ADR-040).
test("ofrece el pase Apple y explica sus datos; Google apagado no se ofrece", async ({ page }) => {
  await page.goto("/app/carnet");
  const apple = page.getByRole("link", { name: t("T-1191"), exact: true });
  await expect(apple).toBeVisible();
  await expect(apple).toHaveAttribute("target", "_blank");
  await expect(page.getByText(copyPattern("T-1215"))).toBeVisible();
  await expect(page.getByRole("link", { name: t("T-1192"), exact: true })).toHaveCount(0);
  const google = await page.request.get("/api/wallet/google");
  expect(google.status()).toBe(404);

  const response = await page.request.get("/api/wallet/apple");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/vnd.apple.pkpass");
  expect(response.headers()["content-disposition"]).toContain("carnet-oe.pkpass");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect((await response.body()).subarray(0, 4).toString("hex")).toBe("504b0304");
  await sinViolaciones(page);
});

for (const standalone of [false, true]) {
  test(`el click Apple navega ${standalone ? "en la misma ventana de la PWA" : "en otra ventana del navegador"}`, async ({
    page,
    context,
  }) => {
    await page.addInitScript((installed) => {
      Object.defineProperty(navigator, "standalone", { value: installed });
    }, standalone);
    // Respuesta HTML sintética: comprueba navegación, sin emitir un pase ni simular Wallet nativo.
    // La ruta del contexto también intercepta la primera petición de una ventana nueva.
    await context.route("**/api/wallet/apple", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<h1>Descarga sintética</h1>",
      }),
    );
    await page.goto("/app/carnet");
    const apple = page.getByRole("link", { name: t("T-1191"), exact: true });
    if (standalone) {
      const before = context.pages().length;
      await apple.click();
      await expect(page).toHaveURL(/\/api\/wallet\/apple$/);
      await expect(page.getByRole("heading", { name: "Descarga sintética" })).toBeVisible();
      expect(context.pages()).toHaveLength(before);
    } else {
      const opened = context.waitForEvent("page");
      await apple.click();
      const popup = await opened;
      await expect(popup).toHaveURL(/\/api\/wallet\/apple$/);
      await expect(popup.getByRole("heading", { name: "Descarga sintética" })).toBeVisible();
      await expect(page).toHaveURL(/\/app\/carnet$/);
      await popup.close();
    }
  });
}

test("revoca el QR de billetera y conserva el carnet de Mi OE", async ({ page }) => {
  expect((await page.request.get("/api/wallet/apple")).status()).toBe(200);
  const before = (await (await page.request.get("/api/mis-datos")).json()) as CarnetExport;
  await page.goto("/app/carnet");
  await page
    .locator("summary")
    .filter({ hasText: t("T-1193") })
    .click();
  await expect(page.getByText(copyPattern("T-1194"))).toBeVisible();
  await page.getByRole("button", { name: t("T-1193"), exact: true }).click();
  await expect(page).toHaveURL(/guardado=carnet/);
  await expect(page.getByText(copyPattern("T-1195"))).toBeVisible();
  const token = (await page.locator("figure[data-token]").getAttribute("data-token")) ?? "";
  expect(token).toMatch(/^oe1\./);
  expect(verifyCarnet(token, { secret: process.env.SESSION_SECRET ?? "" }).ok).toBe(true);
  const after = (await (await page.request.get("/api/mis-datos")).json()) as CarnetExport;
  expect(after.carnet.revision).toBe(before.carnet.revision + 1);
  expect(after.carnet).not.toHaveProperty("token");
  expect(JSON.stringify(after.walletPasses)).not.toContain("oe2.");

  await page.goto("/app/carnet");
  await expect(page.getByText(copyPattern("T-1196"))).toBeVisible();
  await sinViolaciones(page);
  expect((await page.request.get("/api/wallet/apple")).status()).toBe(200);
  await page.reload();
  await expect(page.getByText(copyPattern("T-1196"))).toHaveCount(0);
});

test("ADMIN revoca desde Comunicaciones de la 360 y el miembro ve el aviso", async ({
  page,
  browser,
}) => {
  expect((await page.request.get("/api/wallet/apple")).status()).toBe(200);
  const before = (await (await page.request.get("/api/mis-datos")).json()) as CarnetExport;
  const admin = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
  try {
    const adminPage = await admin.newPage();
    await adminPage.goto(`/admin/personas/${before.person.id}?pestana=comunicaciones`);
    await expect(adminPage.getByRole("heading", { name: t("T-1209"), exact: true })).toBeVisible();
    await expect(
      adminPage.getByText(copyPattern("T-1210", { plataforma: "Apple Wallet" })),
    ).toBeVisible();
    await adminPage
      .locator("summary")
      .filter({ hasText: t("T-1212") })
      .click();
    await expect(adminPage.getByText(copyPattern("T-1220"))).toBeVisible();
    await adminPage.getByRole("button", { name: t("T-1212"), exact: true }).click();
    await expect(adminPage).toHaveURL(/guardado=carnet/);
    await expect(adminPage.getByText(copyPattern("T-1213"))).toBeVisible();
    await sinViolaciones(adminPage);
  } finally {
    await admin.close();
  }
  const after = (await (await page.request.get("/api/mis-datos")).json()) as CarnetExport;
  expect(after.carnet.revision).toBe(before.carnet.revision + 1);
  await page.goto("/app/carnet");
  await expect(page.getByText(copyPattern("T-1196"))).toBeVisible();
  await expect(page.locator("figure[data-token]")).toHaveAttribute("data-token", /^oe1\./);
});

test("las rutas Wallet usan redirecciones locales y no guardan respuestas sensibles en caché", async ({
  browser,
}) => {
  const anonymous = await browser.newContext({
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  try {
    const apple = await anonymous.request.get("/api/wallet/apple", { maxRedirects: 0 });
    expect(apple.status()).toBe(302);
    expect(apple.headers().location).toBe("/ingresar?next=%2Fapi%2Fwallet%2Fapple");
    expect(apple.headers()["cache-control"]).toContain("no-store");
    expect((await anonymous.request.get(apple.headers().location ?? "")).status()).toBe(200);
    const google = await anonymous.request.get("/api/wallet/google", { maxRedirects: 0 });
    expect(google.status()).toBe(404);
    expect(google.headers()["cache-control"]).toContain("no-store");
  } finally {
    await anonymous.close();
  }
});
