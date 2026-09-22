import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { utcToBogotaInput } from "@/shared/lib/dates";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_LEAVE_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

// "Listo cuando" de la fase 5 (ADR-037 regla 10): una convocatoria interna a un GT sin Excel. ADMIN crea
// un grupo e2e- y una convocatoria de un cupo por orden de llegada; el miembro se apunta y ve T-148;
// la persona desechable, restaurada como activa al empezar este escenario, queda en lista de espera
// con T-147; la prueba drena y el grupo lista al miembro.

const CODE = process.env.OTP_FIXED_CODE ?? "123456";
const GROUP = "e2e-GT Inventiva";
const CALL = "e2e-Convocatoria GT Inventiva";

test("abrir convocatoria, llenar el cupo y comprobar la lista de espera", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Falta la URL del servidor E2E");
  await test.step("crea el grupo y la convocatoria de un cupo", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/permanencia/grupos?nuevo=1");
      const grupo = page.getByRole("dialog");
      await grupo.getByLabel(tList("T-743")[0]).selectOption({ label: E2E_TERM.code });
      await grupo.getByLabel(tList("T-743")[2]).fill(GROUP);
      await grupo.getByLabel(tList("T-743")[1]).selectOption("GT_MACROEVENT");
      await grupo.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();

      await page.goto("/admin/convocatorias?nuevo=1");
      const panel = page.getByRole("dialog");
      await panel.getByLabel(tList("T-262")[1]).selectOption({ label: E2E_TERM.code });
      await panel
        .getByLabel(tList("T-1017")[1])
        .selectOption({ label: `${E2E_TERM.code} · ${GROUP}` });
      await panel.getByLabel(tList("T-1017")[0]).fill(CALL);
      // Los campos son hora de Bogotá: se convierten desde UTC como hace el kit.
      const now = Date.now();
      await panel.getByLabel(tList("T-1017")[3]).fill(utcToBogotaInput(new Date(now - 3_600_000)));
      await panel
        .getByLabel(tList("T-1017")[4])
        .fill(utcToBogotaInput(new Date(now + 7 * 86_400_000)));
      await panel.getByLabel(tList("T-1017")[5]).fill("1");
      await panel.getByLabel(tList("T-1017")[7]).selectOption("OPEN");
      await panel.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();
      await expect(page.getByRole("link", { name: CALL })).toBeVisible();
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
  await test.step("queda aceptado por orden de llegada y lo ve en sus inscripciones", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/member.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/app/convocatorias");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-144"));
      await sinViolaciones(page);
      await page
        .getByRole("listitem")
        .filter({ hasText: CALL })
        .getByRole("link", { name: t("T-146") })
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(CALL);
      await page.getByRole("button", { name: t("T-146") }).click();
      await expect(page.getByText(t("T-148", { grupo: GROUP }))).toBeVisible();
      await expect(page.getByText(tList("T-899")[1]).first()).toBeVisible();
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
  await test.step("con el cupo lleno ve T-147", async () => {
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
      await page.goto("/app/convocatorias");
      await page
        .getByRole("listitem")
        .filter({ hasText: CALL })
        .getByRole("link", { name: t("T-146") })
        .click();
      await page.getByRole("button", { name: t("T-146") }).click();
      await expect(page.getByText(t("T-147"))).toBeVisible();
      await expect(page.getByText(tList("T-899")[2]).first()).toBeVisible();
      await drenarOutbox();
    } finally {
      await context.close();
    }
  });
  await test.step("el detalle de la convocatoria y el del grupo lo muestran", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/convocatorias");
      await page.getByRole("link", { name: CALL }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(CALL);
      await expect(page.getByText(t("T-1027", { aceptados: 1, cupo: 1 }))).toBeVisible();
      await expect(page.getByText("Miembro E2E")).toBeVisible();
      await expect(page.getByText("Licencia E2E")).toBeVisible();
      await sinViolaciones(page);
      await page.getByRole("link", { name: GROUP }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(GROUP);
      await expect(page.getByRole("cell", { name: "Miembro E2E" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
