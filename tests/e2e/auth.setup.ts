import { expect, test as setup } from "@playwright/test";
import { E2E_EMAIL } from "./global-setup";

const CODE = process.env.OTP_FIXED_CODE ?? "123456";

// Entra una vez como la persona sintética (ADMIN) y guarda la sesión para la suite del admin.
setup("entra como admin de pruebas", async ({ page }) => {
  await page.goto("/ingresar?next=%2Fadmin");
  await page.getByLabel("Correo @eafit.edu.co").fill(E2E_EMAIL);
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await page.getByLabel("Recordar este dispositivo por 90 días").check();
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().storageState({ path: "tests/e2e/.auth/admin.json" });
});
