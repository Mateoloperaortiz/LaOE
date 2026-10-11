import { expect, type Page } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_PASSWORD } from "./global-setup";

const CODE = process.env.OTP_FIXED_CODE ?? "123456";

// Next inyecta un anunciador de rutas con role="alert": los errores se buscan por su id.
const passwordError = (page: Page) => page.locator("#password-error");
const codeError = (page: Page) => page.locator("#code-error");

const entrar = (page: Page) => page.getByRole("button", { name: t("T-2095"), exact: true });

test("una ruta protegida manda a ingresar y vuelve tras la contraseña", async ({ page }) => {
  await page.goto("/app/ajustes");
  await expect(page).toHaveURL(/\/ingresar\?next=%2Fapp%2Fajustes/);
  await sinViolaciones(page);

  await page.getByLabel(t("T-042")).fill(E2E_EMAIL);
  await page.getByLabel(t("T-2094"), { exact: true }).fill("una clave que no es");
  await entrar(page).click();
  await expect(passwordError(page)).toContainText(t("T-2096"));
  await sinViolaciones(page);

  await page.getByLabel(t("T-2094"), { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel(t("T-047")).check();
  await entrar(page).click();

  await expect(page).toHaveURL(/\/app\/ajustes$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-418"));
  await page
    .getByRole("navigation", { name: t("T-418"), exact: true })
    .getByRole("link", { name: tList("T-133")[3], exact: true })
    .click();
  await expect(page.getByRole("cell", { name: t("T-232") })).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: tList("T-061")[0] }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    t("T-060", { "nombre preferido": "Prueba" }),
  );

  await page.getByRole("button", { name: t("T-1662"), exact: true }).click();
  await page
    .getByRole("dialog", { name: t("T-1660"), exact: true })
    .getByRole("button", { name: t("T-231"), exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/ingresar/);
});

test("un correo fuera del roster recibe el mismo error que una contraseña mala", async ({
  page,
}) => {
  await page.goto("/ingresar");
  await page.getByLabel(t("T-042")).fill("nadie.fuera.del.roster@eafit.edu.co");
  await page.getByLabel(t("T-2094"), { exact: true }).fill("una clave cualquiera");
  await entrar(page).click();
  await expect(passwordError(page)).toContainText(t("T-2096"));
});

test("el destino next solo acepta rutas del mismo origen", async ({ page }) => {
  await page.goto("/ingresar?next=https://ejemplo.com/evil");
  await page.getByLabel(t("T-042")).fill(E2E_EMAIL);
  await page.getByLabel(t("T-2094"), { exact: true }).fill(E2E_PASSWORD);
  await entrar(page).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("el método por código sigue disponible como alterno", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByRole("link", { name: t("T-2099") }).click();
  await expect(page).toHaveURL(/\/ingresar\/codigo/);
  await sinViolaciones(page);

  await page.getByLabel(t("T-042")).fill(E2E_EMAIL);
  await page.getByRole("button", { name: t("T-043") }).click();
  await expect(page.getByRole("status")).toContainText(t("T-044"));

  await page.getByLabel(t("T-238")).fill("000000");
  await page.getByRole("button", { name: t("T-046"), exact: true }).click();
  await expect(codeError(page)).toContainText(t("T-049", { n: 4 }));

  await page.getByLabel(t("T-238")).fill(CODE);
  await page.getByRole("button", { name: t("T-046"), exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("cerrar sesión sin conexión avisa, deja la página en pie y se puede reintentar", async ({
  page,
}) => {
  await page.goto("/app/ajustes");
  await page.getByLabel(t("T-042")).fill(E2E_EMAIL);
  await page.getByLabel(t("T-2094"), { exact: true }).fill(E2E_PASSWORD);
  await entrar(page).click();
  await expect(page).toHaveURL(/\/app\/ajustes$/);

  await page.getByRole("button", { name: t("T-1662"), exact: true }).click();
  const signOut = page
    .getByRole("dialog", { name: t("T-1660"), exact: true })
    .getByRole("button", { name: t("T-231"), exact: true });
  // El pedido de salida no llega a la casa.
  await page.route("**/app/**", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await signOut.click();
  await expect(page.getByText(t("T-3263"))).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-418"));

  // Con la conexión de vuelta, el mismo botón cierra la sesión.
  await page.unroute("**/app/**");
  await signOut.click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/ingresar/);
});
