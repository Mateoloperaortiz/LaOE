import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { notificationPreference } from "@/modules/comms/schema";
import { person } from "@/modules/people/schema";
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
  await page.getByRole("link", { name: "Nuevo" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Nombre", { exact: true }).fill(nombre);
  await panel.getByLabel("Plantilla").selectOption({ label: PLANTILLA });
  await panel.getByLabel("Segmento").selectOption({ label: SEGMENTO });
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await page.getByRole("link", { name: nombre, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/campanas\/[a-z0-9]+$/);
}

async function enviarAhora(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Enviar ahora" }).click();
  await stepUpSiHaceFalta(page);
  await expect(page.getByText(/Vas a mandar/)).toBeVisible();
  await page.getByRole("button", { name: "Enviar ahora" }).click();
  await stepUpSiHaceFalta(page);
  await expect(
    page.getByText("En camino. El primer lote sale en menos de un minuto."),
  ).toBeVisible();
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
      await page.getByRole("link", { name: "Nuevo" }).click();
      const panel = page.getByRole("dialog");
      await panel.getByLabel(/Identificador/).fill(`e2e-${marca}`);
      await panel.getByLabel("Nombre", { exact: true }).fill(PLANTILLA);
      await panel.getByLabel("Asunto", { exact: true }).fill("Hola {nombre}");
      await panel.getByLabel(/Cuerpo/).fill("Sos de **{comités}**.\n\n- Punto uno\n- Punto dos");
      await panel.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Guardado.")).toBeVisible();
      await page.getByRole("link", { name: PLANTILLA, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(PLANTILLA);
      await expect(page.getByText("Hola Prueba")).toBeVisible();
      await page.getByRole("button", { name: "Enviarme una prueba" }).click();
      await expect(page.getByText(/Te mandamos la prueba a/)).toBeVisible();
      await sinViolaciones(page);

      await page.goto("/admin/segmentos");
      await page.getByRole("link", { name: "Nuevo" }).click();
      const segmento = page.getByRole("dialog");
      await segmento.getByLabel("Nombre", { exact: true }).fill(SEGMENTO);
      await segmento.getByLabel("Programa").fill("e2e-campana");
      await segmento.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Guardado.")).toBeVisible();

      await crearCampana(page, `e2e-campana-${marca}`);
      await expect(page.getByText(/1 destinatarios ahora: 1 en el segmento/)).toBeVisible();
      await sinViolaciones(page);
      await enviarAhora(page);
      await expect(page.getByText("1 de 1 enviados · 0 fallidos · 0 omitidos")).toBeVisible();
      const fila = page.getByRole("row", { name: /Miembro E2E/ });
      await expect(fila).toContainText("Enviado");

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
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dejar de recibir campañas");
      await sinViolaciones(page);
      await page.getByRole("button", { name: "Confirmar la baja" }).click();
      await expect(page.getByText("Listo. No te mandamos más campañas por correo.")).toBeVisible();
      await page.goto("/baja/token-que-no-existe-xxxxx");
      await expect(page.getByText("Este enlace no es válido o ya venció.")).toBeVisible();
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
      await expect(
        page.getByText(/0 destinatarios ahora: 1 en el segmento, 0 sin correo, 1 dados de baja/),
      ).toBeVisible();
      await expect(page.getByText("El segmento no tiene destinatarios con correo.")).toBeVisible();
      await page.getByRole("link", { name: "Enviar ahora" }).click();
      await stepUpSiHaceFalta(page);
      await expect(page.getByRole("button", { name: "Enviar ahora" })).toBeDisabled();
      await page.getByRole("button", { name: "Programar" }).click();
      await stepUpSiHaceFalta(page);
      await expect(page.getByText(/Programada para el/)).toBeVisible();
      await page.getByRole("button", { name: "Cancelar campaña" }).click();
      await expect(page.getByText("Campaña cancelada. Lo pendiente quedó omitido.")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
