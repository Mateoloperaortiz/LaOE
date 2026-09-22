import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { pipeline } from "@/modules/crm/schema";
import { form } from "@/modules/forms/schema";
import { otpChallenge } from "@/modules/identity/schema";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
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
      await panel.getByLabel(tList("T-963")[0]).fill(PIPELINE);
      await panel.getByLabel(tList("T-963")[1]).selectOption("ADMISSION");
      await panel.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();
      await page.getByRole("link", { name: PIPELINE }).click();
      await page.waitForURL(/\/admin\/pipelines\/[^/?]+$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(PIPELINE);
      for (const etapa of tList("T-965")) {
        await expect(page.getByRole("region", { name: etapa, exact: true })).toBeVisible();
      }
      await sinViolaciones(page);

      await page.goto("/admin/formularios?nuevo=1");
      const formulario = page.getByRole("dialog");
      await formulario.getByLabel(tList("T-910")[0]).fill(FORM);
      await formulario.getByLabel(tList("T-910")[1]).fill("e2e Convocatoria de admisión");
      await formulario.getByLabel(tList("T-910")[4]).selectOption("OPEN");
      await formulario.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();
      await page.getByRole("link", { name: "e2e Convocatoria de admisión" }).click();
      await page.waitForURL(/\/admin\/formularios\/[^/?]+$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "e2e Convocatoria de admisión",
      );
      await page.getByLabel(tList("T-930")[1]).selectOption({ label: PIPELINE });
      await page
        .getByRole("button", { name: t("T-253") })
        .last()
        .click();
      await expect(page.getByText(tList("T-933")[1])).toBeVisible();
      // Entrar a un pipeline exige crear la persona: la casilla queda marcada sola.
      await expect(page.getByLabel(tList("T-930")[0])).toBeChecked();
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
      await page.getByRole("link", { name: t("T-027") }).click();
      await page.waitForURL(new RegExp(`/f/${FORM}$`));
      await page.getByLabel(tList("T-851")[0]).fill("Postulante");
      await page.getByLabel(tList("T-851")[1]).fill("E2E");
      await page.getByLabel(tList("T-851")[2]).fill(EMAIL);
      await page.getByLabel(copyPattern("T-154")).check();
      await page.getByRole("button", { name: t("T-852") }).click();
      await expect(page.getByText(t("T-859"))).toBeVisible();
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
      const recibida = page.getByRole("region", { name: tList("T-965")[0], exact: true });
      await expect(recibida.getByRole("link", { name: "Postulante E2E" })).toBeVisible();
      // Mover con el selector y el botón.
      await recibida
        .locator("summary")
        .filter({ hasText: tList("T-971")[0] })
        .click();
      await recibida.getByLabel(tList("T-971")[0]).selectOption(tList("T-965")[1]);
      await recibida.getByRole("button", { name: tList("T-971")[1] }).click();
      await expect(page.getByText(t("T-992", { etapa: tList("T-965")[1] }))).toBeVisible();
      const entrevista = page.getByRole("region", { name: tList("T-965")[1], exact: true });
      await entrevista.getByRole("link", { name: "Postulante E2E" }).click();
      const panel = page.getByRole("dialog");
      await expect(panel.getByRole("heading", { level: 2 })).toHaveText("Postulante E2E");
      await sinViolaciones(page);
      await panel.getByRole("link", { name: t("T-983") }).click();
      const alta = page.getByRole("dialog");
      await expect(
        alta.getByText(copyPattern("T-984", { nombre: "Postulante E2E" })),
      ).toBeVisible();
      const primera = "A3";
      await alta.getByRole("checkbox", { name: primera, exact: true }).check();
      await alta.getByRole("button", { name: t("T-983") }).click();
      await expect(page.getByText(t("T-990", { nombre: "Postulante E2E" }))).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: tList("T-965")[3], exact: true })
          .getByRole("link", { name: "Postulante E2E" }),
      ).toBeVisible();

      // La Persona 360 muestra la membresía activa y el comité.
      await page.goto(`/admin/personas?q=${encodeURIComponent(EMAIL)}`);
      await page.getByRole("link", { name: "Postulante E2E" }).first().click();
      await page.waitForURL(/\/admin\/personas\/[^/?]+$/);
      const cabecera = page.locator("header").filter({
        has: page.getByRole("heading", { name: "Postulante E2E", level: 1 }),
      });
      await expect(cabecera.getByText(tList("T-429")[2], { exact: true })).toBeVisible();
      await page
        .getByRole("link", { name: tList("T-432")[2], exact: true })
        .last()
        .click();
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
      await page.getByLabel(t("T-042")).fill(EMAIL);
      await page.getByRole("button", { name: t("T-043") }).click();
      await page.getByLabel(t("T-238")).fill(CODE);
      await page.getByRole("button", { name: t("T-046") }).click();
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        t("T-060", { "nombre preferido": "Postulante" }),
      );
      await expect(page.getByText(t("T-066"))).toBeVisible();
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
});
