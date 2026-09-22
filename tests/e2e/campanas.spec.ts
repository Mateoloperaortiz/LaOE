import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { notificationPreference } from "@/modules/comms/schema";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";
import { pasarStepUpSiHaceFalta } from "./stepup";

// Campañas (ADR-038 regla 8, 10-verificacion): plantilla y campaña e2e- a un segmento que solo
// contiene al miembro (por su programa e2e-campana), envío con step-up al mailer de consola, el
// miembro se da de baja por su enlace y una segunda campaña lo omite.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const marca = Date.now().toString(36);
const PLANTILLA = `e2e-plantilla-${marca}`;
const SEGMENTO = `e2e-segmento-${marca}`;

async function stepUpSiHaceFalta(page: Page): Promise<void> {
  await pasarStepUpSiHaceFalta(page);
}

async function crearCampana(page: Page, nombre: string): Promise<void> {
  await page.goto("/admin/campanas");
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel(tList("T-1126")[0], { exact: true }).fill(nombre);
  await panel.getByLabel(tList("T-1126")[1]).selectOption({ label: PLANTILLA });
  await panel.getByLabel(tList("T-1126")[2]).selectOption({ label: SEGMENTO });
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await page.getByRole("link", { name: nombre, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/campanas\/[a-z0-9]+$/);
}

async function enviarAhora(page: Page): Promise<void> {
  await page.getByRole("link", { name: t("T-1130") }).click();
  await stepUpSiHaceFalta(page);
  await expect(page.getByText(copyPattern("T-1131"))).toBeVisible();
  await page.getByRole("button", { name: t("T-1130") }).click();
  await stepUpSiHaceFalta(page);
  await expect(page.getByText(t("T-1140"))).toBeVisible();
  await drenarOutbox();
  await page.reload();
}

test("crear campaña, darse de baja y comprobar la exclusión de la siguiente", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Falta la URL del servidor E2E");
  await test.step("plantilla, segmento y campaña: el miembro recibe por consola, se da de baja y la siguiente lo omite", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/plantillas");
      await page.getByRole("link", { name: t("T-251") }).click();
      const panel = page.getByRole("dialog");
      await panel.getByLabel(tList("T-1117")[0]).fill(`e2e-${marca}`);
      await panel.getByLabel(tList("T-1117")[1], { exact: true }).fill(PLANTILLA);
      await panel.getByLabel(tList("T-1117")[2], { exact: true }).fill("Hola {nombre}");
      await panel
        .getByLabel(tList("T-1117")[3])
        .fill("Sos de **{comités}**.\n\n- Punto uno\n- Punto dos");
      await panel.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();
      await page.getByRole("link", { name: PLANTILLA, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(PLANTILLA);
      await expect(page.getByText("Hola Prueba")).toBeVisible();
      await page.getByRole("button", { name: t("T-1120") }).click();
      await expect(page.getByText(copyPattern("T-1121"))).toBeVisible();
      await sinViolaciones(page);

      await page.goto("/admin/segmentos");
      await page.getByRole("link", { name: t("T-251") }).click();
      const segmento = page.getByRole("dialog");
      await segmento.getByLabel(tList("T-468")[0], { exact: true }).fill(SEGMENTO);
      await segmento.getByLabel(tList("T-468")[8]).fill("e2e-campana");
      await segmento.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();

      await crearCampana(page, `e2e-campana-${marca}`);
      await expect(page.getByText(copyPattern("T-1128", { n: 1, m: 1 }))).toBeVisible();
      await sinViolaciones(page);
      await enviarAhora(page);
      await expect(
        page.getByText(t("T-1133", { enviados: 1, total: 1, fallidos: 0, omitidos: 0 })),
      ).toBeVisible();
      const fila = page.getByRole("row", { name: /Miembro E2E/ });
      await expect(fila).toContainText(tList("T-1135")[1]);

      await page.goto(`/admin/mensajes?kind=CAMPAIGN`);
      await expect(page.getByRole("row", { name: /Miembro E2E/ }).first()).toContainText(
        "Hola Miembro",
      );

      // La baja: el enlace del pie lleva el token de la persona; se visita sin sesión.
      const [pref] = await getDb()
        .select({ token: notificationPreference.unsubscribeToken })
        .from(notificationPreference)
        .innerJoin(person, eq(person.id, notificationPreference.personId))
        .where(eq(person.email, E2E_MEMBER_EMAIL));
      await closeDb();
      expect(pref?.token).toBeTruthy();
      await page.context().clearCookies();
      await page.goto(`/baja/${pref?.token}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-1103"));
      await sinViolaciones(page);
      await page.getByRole("button", { name: t("T-1105") }).click();
      await expect(page.getByText(t("T-1106"))).toBeVisible();
      await page.goto("/baja/token-que-no-existe-xxxxx");
      await expect(page.getByText(t("T-1107"))).toBeVisible();
    } finally {
      await context.close();
    }
  });
  await test.step("la segunda campaña omite a quien se dio de baja", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await crearCampana(page, `e2e-segunda-${marca}`);
      await expect(page.getByText(copyPattern("T-1128", { n: 0, m: 1, a: 0, b: 1 }))).toBeVisible();
      await expect(page.getByText(t("T-1138"))).toBeVisible();
      await page.getByRole("link", { name: t("T-1130") }).click();
      await stepUpSiHaceFalta(page);
      await expect(page.getByRole("button", { name: t("T-1130") })).toBeDisabled();
      await page.getByRole("button", { name: tList("T-1129")[1] }).click();
      await stepUpSiHaceFalta(page);
      await expect(page.getByText(copyPattern("T-1139"))).toBeVisible();
      await page.getByRole("button", { name: t("T-1132") }).click();
      await expect(page.getByText(t("T-1141"))).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
