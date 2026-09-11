import { expect, type Page } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_PASSWORD } from "./global-setup";

const CODE = process.env.OTP_FIXED_CODE ?? "123456";

// Next inyecta un anunciador de rutas con role="alert": los errores se buscan por su id.
const passwordError = (page: Page) => page.locator("#password-error");
const codeError = (page: Page) => page.locator("#code-error");

const entrar = (page: Page) => page.getByRole("button", { name: "Entrar", exact: true });

test("una ruta protegida manda a ingresar y vuelve tras la contraseña", async ({ page }) => {
  await page.goto("/app/ajustes");
  await expect(page).toHaveURL(/\/ingresar\?next=%2Fapp%2Fajustes/);
  await sinViolaciones(page);

  await page.getByLabel("Correo @eafit.edu.co").fill(E2E_EMAIL);
  await page.getByLabel("Contraseña", { exact: true }).fill("una clave que no es");
  await entrar(page).click();
  await expect(passwordError(page)).toContainText("Correo o contraseña incorrectos");
  await sinViolaciones(page);

  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Recordar este dispositivo por 90 días").check();
  await entrar(page).click();

  await expect(page).toHaveURL(/\/app\/ajustes$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ajustes");
  await page
    .getByRole("navigation", { name: "Ajustes", exact: true })
    .getByRole("link", { name: "Sesiones", exact: true })
    .click();
  await expect(page.getByRole("cell", { name: "Este dispositivo" })).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: "Inicio" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Prueba");

  await page.getByRole("button", { name: "Más", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Mi OE", exact: true })
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/ingresar/);
});

test("un correo fuera del roster recibe el mismo error que una contraseña mala", async ({
  page,
}) => {
  await page.goto("/ingresar");
  await page.getByLabel("Correo @eafit.edu.co").fill("nadie.fuera.del.roster@eafit.edu.co");
  await page.getByLabel("Contraseña", { exact: true }).fill("una clave cualquiera");
  await entrar(page).click();
  await expect(passwordError(page)).toContainText("Correo o contraseña incorrectos");
});

test("el destino next solo acepta rutas del mismo origen", async ({ page }) => {
  await page.goto("/ingresar?next=https://ejemplo.com/evil");
  await page.getByLabel("Correo @eafit.edu.co").fill(E2E_EMAIL);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  await entrar(page).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("el método por código sigue disponible como alterno", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: "Entrar con un código al correo institucional" }).click();
  await expect(page).toHaveURL(/\/ingresar\/codigo/);
  await sinViolaciones(page);

  await page.getByLabel("Correo @eafit.edu.co").fill(E2E_EMAIL);
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await expect(page.getByRole("status")).toContainText("Si tu correo está en el roster");

  await page.getByLabel("Código de seis dígitos").fill("000000");
  await entrar(page).click();
  await expect(codeError(page)).toContainText("Te quedan 4 intentos");

  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await entrar(page).click();
  await expect(page).toHaveURL(/\/app$/);
});
