import { expect, test } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { E2E_LEAVE_EMAIL } from "./global-setup";

// "Listo cuando" de la fase 5 (ADR-037 regla 9): una licencia pedida desde Mi OE termina aprobada y
// aplicada sin que GH toque la base. El miembro desechable entra por OTP (la sesión guardada es de
// otras identidades), pide la licencia y ve T-140; ADMIN la ve en la bandeja y en Tareas y la aprueba;
// la Persona 360 muestra "En licencia" y la persona ya no entra a /app.

const CODE = process.env.OTP_FIXED_CODE ?? "123456";

test.describe("el miembro pide la licencia", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("desde Mi OE, con motivo, y la ve pendiente", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByLabel("Correo @eafit.edu.co").fill(E2E_LEAVE_EMAIL);
    await page.getByRole("button", { name: "Enviame el código" }).click();
    await page.getByLabel("Código de seis dígitos").fill(CODE);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.getByRole("button", { name: "Más", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Mi OE", exact: true })
      .getByRole("link", { name: "Solicitudes", exact: true })
      .click();
    await page.waitForURL(/\/app\/solicitudes$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Solicitudes");
    await expect(page.getByText("Todavía no has hecho solicitudes.")).toBeVisible();
    await sinViolaciones(page);
    await page.getByRole("link", { name: "Pedir licencia", exact: true }).click();
    const licencia = page.getByRole("region", { name: "Pedir licencia" });
    await licencia.getByLabel("Contanos por qué").fill("Intercambio en Chile el próximo semestre.");
    await licencia.getByLabel("Hasta cuándo (opcional)").fill("2026-12-01");
    await licencia.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(
      page.getByText("Tu solicitud llegó a GH. Te avisamos cuando la respondan."),
    ).toBeVisible();
    await expect(page.getByText("Pendiente").first()).toBeVisible();
    await expect(page.getByText(/Licencia hasta el/)).toBeVisible();
    await sinViolaciones(page);
  });
});

test.describe("GH la aprueba", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("desde la bandeja: la tarea existe, la 360 muestra la licencia y la persona ya no entra", async ({
    page,
  }) => {
    await page.goto("/admin/tareas");
    // Con el seed local hay otras tareas de solicitud: el enlace se toma de la fila de la persona.
    const fila = page.getByRole("row", { name: /Licencia E2E pide licencia/ });
    await expect(fila).toBeVisible();
    await fila.getByRole("link", { name: "Ver solicitud" }).click();
    await expect(page).toHaveURL(/\/admin\/solicitudes\?tarea=/);
    const panel = page.getByRole("dialog");
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText("licencia · Licencia E2E");
    await expect(panel.getByText(/Vas a aprobar la licencia de Licencia E2E/)).toBeVisible();
    await sinViolaciones(page);
    await panel.getByRole("button", { name: "Aprobar" }).click();
    await expect(page.getByText("Solicitud aprobada.")).toBeVisible();
    await page.goto("/admin/solicitudes?estado=APPROVED");
    await expect(page.getByRole("cell", { name: "Licencia E2E" })).toBeVisible();

    await page.goto(`/admin/personas?q=${encodeURIComponent(E2E_LEAVE_EMAIL)}`);
    await page.getByRole("link", { name: "Licencia E2E" }).first().click();
    await expect(page.getByText("En licencia").first()).toBeVisible();
    await page.getByRole("link", { name: "Solicitudes", exact: true }).last().click();
    await expect(page.getByText("Aprobada").first()).toBeVisible();
    await sinViolaciones(page);
  });
});

test.describe("la persona en licencia no entra", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("el OTP no llega porque ya no está en el roster de acceso", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByLabel("Correo @eafit.edu.co").fill(E2E_LEAVE_EMAIL);
    await page.getByRole("button", { name: "Enviame el código" }).click();
    await page.getByLabel("Código de seis dígitos").fill(CODE);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).not.toHaveURL(/\/app$/);
  });
});
