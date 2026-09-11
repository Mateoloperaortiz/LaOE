import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { pipeline } from "@/modules/crm/schema";
import { form } from "@/modules/forms/schema";
import { otpChallenge } from "@/modules/identity/schema";
import { person } from "@/modules/people/schema";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

// "Listo cuando" de la fase 5 (ADR-037): una convocatoria de admisión completa sin Excel. ADMIN crea el
// pipeline y el formulario ligado; /unirse muestra "Postulate"; un visitante postula; la tarjeta nace
// por outbox (la prueba drena, CI corre sin jobs); ADMIN la mueve, da de alta con un comité y el nuevo
// miembro entra por OTP y ve su onboarding.

const CODE = process.env.OTP_FIXED_CODE ?? "123456";
const PIPELINE = "e2e-Admisión";
const FORM = "e2e-admision";
const EMAIL = "e2e-postulante@eafit.edu.co";

// Los cuatro pasos forman un único recorrido: un retry debe comenzar con la misma convocatoria
// limpia, no continuar con pipelines duplicados o una persona que el intento anterior ya admitió.

test.beforeEach(async () => {
  await drenarOutbox();
  await getDb().transaction(async (tx) => {
    await tx.delete(form).where(eq(form.slug, FORM));
    await tx.delete(pipeline).where(eq(pipeline.name, PIPELINE));
    await tx.delete(person).where(eq(person.email, EMAIL));
    await tx.delete(otpChallenge).where(eq(otpChallenge.email, EMAIL));
  });
  await closeDb();
});

test("crear convocatoria, recibir postulación, admitir y entrar a Mi OE", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Falta la URL del servidor E2E");
  await test.step("ADMIN crea el pipeline de admisión y el formulario ligado", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/pipelines?nuevo=1");
      const panel = page.getByRole("dialog");
      await panel.getByLabel("Nombre").fill(PIPELINE);
      await panel.getByLabel("Tipo").selectOption("ADMISSION");
      await panel.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Guardado.")).toBeVisible();
      await page.getByRole("link", { name: PIPELINE }).click();
      await page.waitForURL(/\/admin\/pipelines\/[^/?]+$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(PIPELINE);
      for (const etapa of ["Recibida", "Entrevista", "Admitida", "Alta", "No admitida"]) {
        await expect(page.getByRole("region", { name: etapa, exact: true })).toBeVisible();
      }
      await sinViolaciones(page);

      await page.goto("/admin/formularios?nuevo=1");
      const formulario = page.getByRole("dialog");
      await formulario.getByLabel("Identificador").fill(FORM);
      await formulario.getByLabel("Título").fill("e2e Convocatoria de admisión");
      await formulario.getByLabel("Estado").selectOption("OPEN");
      await formulario.getByRole("button", { name: "Guardar" }).click();
      await expect(page.getByText("Guardado.")).toBeVisible();
      await page.getByRole("link", { name: "e2e Convocatoria de admisión" }).click();
      await page.waitForURL(/\/admin\/formularios\/[^/?]+$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "e2e Convocatoria de admisión",
      );
      await page.getByLabel("Entrar al pipeline").selectOption({ label: PIPELINE });
      await page.getByRole("button", { name: "Guardar" }).last().click();
      await expect(page.getByText("Acciones guardadas.")).toBeVisible();
      // Entrar a un pipeline exige crear la persona: la casilla queda marcada sola.
      await expect(page.getByLabel("Crear la persona como prospecto si no existe")).toBeChecked();
    } finally {
      await context.close();
    }
  });
  await test.step("/unirse lleva al formulario y la respuesta queda recibida", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();

      await page.goto("/unirse");
      await page.getByRole("link", { name: "Postulate" }).click();
      await page.waitForURL(new RegExp(`/f/${FORM}$`));
      await page.getByLabel("Nombre").fill("Postulante");
      await page.getByLabel("Apellido").fill("E2E");
      await page.getByLabel("Correo").fill(EMAIL);
      await page.getByLabel(/Acepto la política/).check();
      await page.getByRole("button", { name: "Enviar" }).click();
      await expect(page.getByText("¡Listo! Recibimos tu respuesta. ¡OE OE OE!")).toBeVisible();
      await drenarOutbox();
    } finally {
      await context.close();
    }
  });
  await test.step("la tarjeta aparece en Recibida, pasa a Entrevista y se da de alta con un comité", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/pipelines");
      await page.getByRole("link", { name: PIPELINE }).click();
      const recibida = page.getByRole("region", { name: "Recibida", exact: true });
      await expect(recibida.getByRole("link", { name: "Postulante E2E" })).toBeVisible();
      // Mover con el selector y el botón.
      await recibida.locator("summary").filter({ hasText: "Mover a…" }).click();
      await recibida.getByLabel("Mover a…").selectOption("Entrevista");
      await recibida.getByRole("button", { name: "Mover" }).click();
      await expect(page.getByText("Tarjeta movida a Entrevista.")).toBeVisible();
      const entrevista = page.getByRole("region", { name: "Entrevista", exact: true });
      await entrevista.getByRole("link", { name: "Postulante E2E" }).click();
      const panel = page.getByRole("dialog");
      await expect(panel.getByRole("heading", { level: 2 })).toHaveText("Postulante E2E");
      await sinViolaciones(page);
      await panel.getByRole("link", { name: "Dar de alta" }).click();
      const alta = page.getByRole("dialog");
      await expect(alta.getByText(/Vas a dar de alta a Postulante E2E/)).toBeVisible();
      const primera = "A3";
      await alta.getByRole("checkbox", { name: primera, exact: true }).check();
      await alta.getByRole("button", { name: "Dar de alta" }).click();
      await expect(
        page.getByText(
          "Postulante E2E ya es miembro. Falta emitirle su enlace de acceso para que pueda entrar.",
        ),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Alta", exact: true })
          .getByRole("link", { name: "Postulante E2E" }),
      ).toBeVisible();

      // La Persona 360 muestra la membresía activa y el comité.
      await page.goto(`/admin/personas?q=${encodeURIComponent(EMAIL)}`);
      await page.getByRole("link", { name: "Postulante E2E" }).first().click();
      await page.waitForURL(/\/admin\/personas\/[^/?]+$/);
      const cabecera = page.locator("header").filter({
        has: page.getByRole("heading", { name: "Postulante E2E", level: 1 }),
      });
      await expect(cabecera.getByText("Miembro", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Membresía", exact: true }).last().click();
      await expect(page.getByText(new RegExp(`${primera} · Miembro`))).toBeVisible();
      await drenarOutbox();
    } finally {
      await context.close();
    }
  });
  await test.step("entra por OTP y ve su primera semana en Mi OE", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();

      await page.goto("/ingresar/codigo");
      await page.getByLabel("Correo @eafit.edu.co").fill(EMAIL);
      await page.getByRole("button", { name: "Enviame el código" }).click();
      await page.getByLabel("Código de seis dígitos").fill(CODE);
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Postulante");
      await expect(page.getByText("Tu primera semana en la OE")).toBeVisible();
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
});
