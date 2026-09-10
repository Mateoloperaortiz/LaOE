import { expect, test as setup } from "@playwright/test";
import { E2E_EMAIL, E2E_MEMBER_EMAIL, E2E_PASSWORD } from "./global-setup";

// Entra una vez por identidad con la contraseña propia (ADR-051) y guarda la sesión. Con
// contraseña ya no hay que esquivar el límite de cinco códigos por correo cada 15 minutos.
async function entrar(
  page: import("@playwright/test").Page,
  email: string,
  destino: string,
  recordar: boolean,
): Promise<void> {
  await page.goto(`/ingresar?next=${encodeURIComponent(destino)}`);
  await page.getByLabel("Correo @eafit.edu.co").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(E2E_PASSWORD);
  if (recordar) {
    await page.getByLabel("Recordar este dispositivo por 90 días").check();
  }
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${destino.replace("/", "\\/")}$`));
}

setup("entra como admin de pruebas", async ({ page }) => {
  await entrar(page, E2E_EMAIL, "/admin", true);
  await page.context().storageState({ path: "tests/e2e/.auth/admin.json" });
});

// La segunda identidad: un miembro sin permisos, para la suite de Mi OE.
setup("entra como miembro de pruebas", async ({ page }) => {
  await entrar(page, E2E_MEMBER_EMAIL, "/app", false);
  await page.context().storageState({ path: "tests/e2e/.auth/member.json" });
});
