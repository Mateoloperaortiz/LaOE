import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { E2E_EMAIL } from "./global-setup";

const CODE = process.env.OTP_FIXED_CODE ?? "123456";

// Next inyecta un anunciador de rutas con role="alert": el error del código se busca por su id.
const codeError = (page: Page) => page.locator("#code-error");

async function sinViolaciones(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("una ruta protegida manda a ingresar y vuelve tras el OTP", async ({ page }) => {
  await page.goto("/app/ajustes");
  await expect(page).toHaveURL(/\/ingresar\?next=%2Fapp%2Fajustes/);
  await sinViolaciones(page);

  await page.getByLabel("Correo @eafit.edu.co").fill(E2E_EMAIL);
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await expect(page.getByRole("status")).toContainText("Si tu correo está en el roster");
  await sinViolaciones(page);

  await page.getByLabel("Código de seis dígitos").fill("000000");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(codeError(page)).toContainText("Te quedan 4 intentos");

  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await page.getByLabel("Recordar este dispositivo por 90 días").check();
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/app\/ajustes$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sesiones");
  await expect(page.getByRole("cell", { name: "Este dispositivo" })).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: "Inicio" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Prueba");

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/ingresar/);
});

test("un correo fuera del roster recibe la misma respuesta", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByLabel("Correo @eafit.edu.co").fill("nadie.fuera.del.roster@eafit.edu.co");
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await expect(page.getByRole("status")).toContainText("Si tu correo está en el roster");
  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(codeError(page)).toContainText("Ese código ya venció");
});

test("el destino next solo acepta rutas del mismo origen", async ({ page }) => {
  await page.goto("/ingresar?next=https://ejemplo.com/evil");
  await page.getByLabel("Correo @eafit.edu.co").fill(E2E_EMAIL);
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/);
});
