import type { Page } from "@playwright/test";
import { E2E_PASSWORD } from "./global-setup";

/**
 * Step-up con la contraseña propia (ADR-051, regla 7). Reemplaza al código, que sigue disponible
 * detrás del enlace "Entrar con un código al correo institucional".
 */
export async function pasarStepUp(page: Page, password = E2E_PASSWORD): Promise<void> {
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

/** Igual, pero solo si la página actual es la del step-up. */
export async function pasarStepUpSiHaceFalta(page: Page): Promise<void> {
  if (page.url().includes("/ingresar/paso")) {
    await pasarStepUp(page);
  }
}
