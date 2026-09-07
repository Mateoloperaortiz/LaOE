import { expect, test } from "@playwright/test";
import { verifyCarnet } from "@/modules/identity/domain/carnet-pure";
import { sinViolaciones } from "./axe";

// Carnet (ADR-034 regla 10): el QR lleva un token firmado que `verifyCarnet` acepta.
test.use({ storageState: "tests/e2e/.auth/member.json" });

test("el carnet muestra un QR con un token firmado de 24 horas", async ({ page }) => {
  await page.goto("/app/carnet");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tu carnet OE");
  await expect(
    page.getByRole("heading", { level: 2, name: "Miembro E2E", exact: true }),
  ).toHaveText("Miembro E2E");
  const figura = page.locator("figure[data-token]");
  await expect(figura.locator("svg")).toBeVisible();
  await expect(figura.getByText(/Vence el/)).toBeVisible();
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
  const apple = page.getByRole("link", { name: "Agregar a Apple Wallet", exact: true });
  await expect(apple).toBeVisible();
  await expect(apple).toHaveAttribute("target", "_blank");
  await expect(
    page.getByText(/su almacenamiento y sincronización dependen de tu configuración de Apple/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Añadir a Google Wallet", exact: true })).toHaveCount(
    0,
  );
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

test("revoca el QR de billetera y conserva el carnet de Mi OE", async ({ page }) => {
  expect((await page.request.get("/api/wallet/apple")).status()).toBe(200);
  const before = (await (await page.request.get("/api/mis-datos")).json()) as CarnetExport;
  await page.goto("/app/carnet");
  await page.locator("summary").filter({ hasText: "Revocar y volver a emitir" }).click();
  await expect(page.getByText(/El carnet de Mi OE sigue funcionando/)).toBeVisible();
  await page.getByRole("button", { name: "Revocar y volver a emitir", exact: true }).click();
  await expect(page).toHaveURL(/guardado=carnet/);
  await expect(page.getByText(/Listo: el QR anterior de tus billeteras ya no vale/)).toBeVisible();
  const token = (await page.locator("figure[data-token]").getAttribute("data-token")) ?? "";
  expect(token).toMatch(/^oe1\./);
  expect(verifyCarnet(token, { secret: process.env.SESSION_SECRET ?? "" }).ok).toBe(true);
  const after = (await (await page.request.get("/api/mis-datos")).json()) as CarnetExport;
  expect(after.carnet.revision).toBe(before.carnet.revision + 1);
  expect(after.carnet).not.toHaveProperty("token");
  expect(JSON.stringify(after.walletPasses)).not.toContain("oe2.");

  await page.goto("/app/carnet");
  await expect(
    page.getByText(/Agregalo de nuevo para que muestre el QR y tus datos actuales/),
  ).toBeVisible();
  await sinViolaciones(page);
  expect((await page.request.get("/api/wallet/apple")).status()).toBe(200);
  await page.reload();
  await expect(
    page.getByText(/Agregalo de nuevo para que muestre el QR y tus datos actuales/),
  ).toHaveCount(0);
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
    await expect(
      adminPage.getByRole("heading", { name: "Carnet en billeteras", exact: true }),
    ).toBeVisible();
    await expect(adminPage.getByText(/Apple Wallet: emitido el/)).toBeVisible();
    await adminPage.locator("summary").filter({ hasText: "Revocar el carnet" }).click();
    await expect(
      adminPage.getByText(/El QR anterior de las billeteras de esta persona dejará de servir/),
    ).toBeVisible();
    await adminPage.getByRole("button", { name: "Revocar el carnet", exact: true }).click();
    await expect(adminPage).toHaveURL(/guardado=carnet/);
    await expect(adminPage.getByText(/El QR anterior de las billeteras ya no vale/)).toBeVisible();
    await sinViolaciones(adminPage);
  } finally {
    await admin.close();
  }
  const after = (await (await page.request.get("/api/mis-datos")).json()) as CarnetExport;
  expect(after.carnet.revision).toBe(before.carnet.revision + 1);
  await page.goto("/app/carnet");
  await expect(
    page.getByText(/Agregalo de nuevo para que muestre el QR y tus datos actuales/),
  ).toBeVisible();
  await expect(page.locator("figure[data-token]")).toHaveAttribute("data-token", /^oe1\./);
});

test("las rutas Wallet usan redirecciones locales y no guardan respuestas sensibles en caché", async ({
  browser,
}) => {
  const anonymous = await browser.newContext({
    baseURL: "http://localhost:3000",
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
