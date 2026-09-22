import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_LEAVE_EMAIL } from "./global-setup";

// "Listo cuando" de la fase 5 (ADR-037 regla 9): una licencia pedida desde Mi OE termina aprobada y
// aplicada sin que GH toque la base. El miembro desechable entra por OTP (la sesión guardada es de
// otras identidades), pide la licencia y ve T-140; ADMIN la ve en la bandeja y en Tareas y la aprueba;
// la Persona 360 muestra "En licencia" y la persona conserva acceso de consulta a /app.

const CODE = process.env.OTP_FIXED_CODE ?? "123456";

test("pedir licencia, aprobarla y conservar el acceso de consulta", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Falta la URL del servidor E2E");
  await test.step("desde Mi OE, con motivo, y la ve pendiente", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();

      await page.goto("/ingresar/codigo");
      await page.getByLabel(t("T-042")).fill(E2E_LEAVE_EMAIL);
      await page.getByRole("button", { name: t("T-043") }).click();
      await page.getByLabel(t("T-238")).fill(CODE);
      await page.getByRole("button", { name: t("T-046") }).click();
      await expect(page).toHaveURL(/\/app$/);
      await page.getByRole("button", { name: t("T-1662"), exact: true }).click();
      await page
        .getByRole("dialog", { name: t("T-1660"), exact: true })
        .getByRole("link", { name: tList("T-061")[7], exact: true })
        .click();
      await page.waitForURL(/\/app\/solicitudes$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-138"));
      await expect(page.getByText(t("T-875"))).toBeVisible();
      await sinViolaciones(page);
      await page.getByRole("link", { name: tList("T-139")[0], exact: true }).click();
      const licencia = page.getByRole("region", { name: tList("T-139")[0] });
      await licencia.getByLabel(t("T-880")).fill("Intercambio en Chile el próximo semestre.");
      await licencia.getByLabel(t("T-881")).fill(E2E_TERM.endsOn);
      await licencia.getByRole("button", { name: t("T-893") }).click();
      await expect(page.getByText(t("T-140"))).toBeVisible();
      await expect(page.getByText(tList("T-876")[0]).first()).toBeVisible();
      await expect(
        page.getByText(new RegExp(tList("T-1010")[0].replace(/\{fecha\}.*$/, ""))),
      ).toBeVisible();
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
  await test.step("desde la bandeja: la tarea existe, la 360 muestra la licencia y la persona conserva consulta", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/tareas");
      // Con el seed local hay otras tareas de solicitud: el enlace se toma de la fila de la persona.
      const fila = page.getByRole("row", {
        name: copyPattern("T-1009", { nombre: "Licencia E2E", tipo: tList("T-894")[0] }),
      });
      await expect(fila).toBeVisible();
      await fila.getByRole("link", { name: t("T-1013") }).click();
      await expect(page).toHaveURL(/\/admin\/solicitudes\?tarea=/);
      const panel = page.getByRole("dialog");
      await expect(panel.getByRole("heading", { level: 2 })).toHaveText(
        `${tList("T-894")[0]} · Licencia E2E`,
      );
      await expect(
        panel.getByText(copyPattern("T-1004", { nombre: "Licencia E2E" })),
      ).toBeVisible();
      await sinViolaciones(page);
      await panel.getByRole("button", { name: tList("T-1001")[0] }).click();
      await expect(
        page.getByText(t("T-1008", { estado: tList("T-876")[1].toLowerCase() })),
      ).toBeVisible();
      await page.goto("/admin/solicitudes?estado=APPROVED");
      await expect(page.getByRole("cell", { name: "Licencia E2E" })).toBeVisible();

      await page.goto(`/admin/personas?q=${encodeURIComponent(E2E_LEAVE_EMAIL)}`);
      await page.getByRole("link", { name: "Licencia E2E" }).first().click();
      await expect(page.getByText(tList("T-381")[1]).first()).toBeVisible();
      await page
        .getByRole("link", { name: tList("T-432")[8], exact: true })
        .last()
        .click();
      await expect(page.getByText(tList("T-876")[1]).first()).toBeVisible();
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
  await test.step("entra por OTP, ve sus datos y no puede emitir carnet ni operar", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();

      await page.goto("/ingresar/codigo");
      await page.getByLabel(t("T-042")).fill(E2E_LEAVE_EMAIL);
      await page.getByRole("button", { name: t("T-043") }).click();
      await page.getByLabel(t("T-238")).fill(CODE);
      await page.getByRole("button", { name: t("T-046") }).click();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole("status").filter({ hasText: t("T-2040") })).toBeVisible();
      await page.goto("/app/carnet");
      await expect(page.getByText(t("T-2042"), { exact: false })).toBeVisible();
      await expect(page.locator("[data-token]")).toHaveCount(0);
      await expect(
        page.getByRole("link", {
          name: new RegExp(`${copyPattern("T-1191").source}|${copyPattern("T-1192").source}`),
        }),
      ).toHaveCount(0);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/app$/);
      await page.goto("/app/ajustes");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-418"));
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
});
