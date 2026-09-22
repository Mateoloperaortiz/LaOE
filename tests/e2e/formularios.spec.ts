import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Formularios propios (ADR-013, ADR-037 reglas 3 a 5): ADMIN arma y abre un formulario e2e-; un
// visitante sin sesión lo responde con consentimiento; la segunda respuesta con el mismo correo se
// rechaza y el honeypot no crea fila; la respuesta aparece en la bandeja y en la Persona 360.

const SLUG = "e2e-postulacion";
const EMAIL = "e2e-formulario@gmail.com";

test("crear formulario público, responderlo y revisar la respuesta", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Falta la URL del servidor E2E");
  await test.step("ADMIN crea un formulario con campos y lo abre", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/formularios?nuevo=1");
      const panel = page.getByRole("dialog");
      await panel.getByLabel(tList("T-910")[0]).fill(SLUG);
      await panel.getByLabel(tList("T-910")[1]).fill("e2e Postulación");
      await panel.getByLabel(tList("T-910")[2]).fill("Contanos de vos.");
      await panel.getByLabel(tList("T-910")[4]).selectOption("OPEN");
      await panel.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();
      await sinViolaciones(page);

      await page.getByRole("link", { name: "e2e Postulación" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e Postulación");
      await expect(page.getByText(copyPattern("T-921"))).toBeVisible();
      await page.getByRole("link", { name: t("T-922") }).click();
      const campo = page.getByRole("dialog");
      await campo.getByLabel(tList("T-923")[0]).fill("motivo");
      await campo.getByLabel(tList("T-923")[1]).fill("¿Por qué querés entrar?");
      await campo.getByLabel(tList("T-923")[2]).selectOption("TEXTAREA");
      await campo.getByLabel(tList("T-923")[3]).check();
      await campo.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(tList("T-933")[0])).toBeVisible();
      await page.getByRole("link", { name: t("T-922") }).click();
      const segundo = page.getByRole("dialog");
      await segundo.getByLabel(tList("T-923")[0]).fill("comite");
      await segundo.getByLabel(tList("T-923")[1]).fill("Comité que te interesa");
      await segundo.getByLabel(tList("T-923")[2]).selectOption("SELECT");
      await segundo.getByLabel(tList("T-923")[5]).fill("A3\nPIXEL");
      await segundo.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(tList("T-933")[0])).toBeVisible();
      await expect(page.getByRole("cell", { name: "Comité que te interesa" })).toBeVisible();
      // Las acciones: crear la persona como prospecto.
      await page.getByLabel(tList("T-930")[0]).check();
      await page
        .getByRole("button", { name: t("T-253") })
        .last()
        .click();
      await expect(page.getByText(tList("T-933")[1])).toBeVisible();
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
  await test.step("responde con consentimiento, no puede repetir el correo y el honeypot no guarda", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const page = await context.newPage();

      await page.goto(`/f/${SLUG}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e Postulación");
      await sinViolaciones(page);
      // Sin consentimiento ni motivo: errores por campo.
      await page.getByLabel(tList("T-851")[0]).fill("Lu");
      await page.getByLabel(tList("T-851")[1]).fill("Prueba");
      await page.getByLabel(tList("T-851")[2]).fill(EMAIL);
      await page.getByRole("button", { name: t("T-852") }).click();
      await expect(page.getByText(t("T-853")).first()).toBeVisible();
      await page.getByLabel("¿Por qué querés entrar?").fill("Quiero aportar en logística.");
      await page.getByLabel("Comité que te interesa").selectOption("A3");
      await page.getByRole("button", { name: t("T-852") }).click();
      await expect(page.getByText(t("T-858"))).toBeVisible();
      await page.getByLabel(copyPattern("T-154")).check();
      await page.getByRole("button", { name: t("T-852") }).click();
      await expect(page.getByText(t("T-859"))).toBeVisible();
      await sinViolaciones(page);

      // Segunda respuesta con el mismo correo.
      await page.goto(`/f/${SLUG}`);
      await page.getByLabel(tList("T-851")[0]).fill("Lu");
      await page.getByLabel(tList("T-851")[1]).fill("Prueba");
      await page.getByLabel(tList("T-851")[2]).fill(EMAIL);
      await page.getByLabel("¿Por qué querés entrar?").fill("Otra vez.");
      await page.getByLabel(copyPattern("T-154")).check();
      await page.getByRole("button", { name: t("T-852") }).click();
      await expect(page.getByText(t("T-862"))).toBeVisible();

      // El campo trampa lleno responde "gracias" sin guardar.
      await page.goto(`/f/${SLUG}`);
      await page.getByLabel(tList("T-851")[0]).fill("Bot");
      await page.getByLabel(tList("T-851")[1]).fill("Spam");
      await page.getByLabel(tList("T-851")[2]).fill("e2e-bot@spam.test");
      await page.getByLabel("¿Por qué querés entrar?").fill("spam");
      await page.getByLabel(copyPattern("T-154")).check();
      await page.locator('input[name="sitio_web"]').fill("http://spam", { force: true });
      await page.getByRole("button", { name: t("T-852") }).click();
      await expect(page.getByText(t("T-859"))).toBeVisible();
    } finally {
      await context.close();
    }
  });
  await test.step("ADMIN ve la respuesta en la bandeja y en la pestaña Formularios de la persona", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      await page.goto("/admin/formularios");
      await page.getByRole("link", { name: "e2e Postulación" }).click();
      await page.getByRole("link", { name: new RegExp(`${tList("T-910")[11]} \\(1\\)`) }).click();
      await page.waitForURL(/\/admin\/formularios\/[^/]+\/respuestas$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        new RegExp(`${tList("T-935")[1]} · e2e Postulación`),
      );
      await expect(page.getByRole("cell", { name: EMAIL })).toBeVisible();
      await expect(page.getByRole("cell", { name: "e2e-bot@spam.test" })).toHaveCount(0);
      await page.getByRole("link", { name: "Lu Prueba" }).first().click();
      const panel = page.getByRole("dialog");
      await expect(panel.getByText("Quiero aportar en logística.")).toBeVisible();
      await expect(panel.getByText("A3", { exact: true })).toBeVisible();
      await sinViolaciones(page);

      await page.goto("/admin/personas?q=e2e-formulario");
      await page.getByRole("link", { name: "Lu Prueba" }).first().click();
      await page.waitForURL(/\/admin\/personas\/[^/?]+$/);
      const cabecera = page.locator("header").filter({
        has: page.getByRole("heading", { name: "Lu Prueba", level: 1 }),
      });
      await expect(cabecera.getByText(tList("T-429")[0], { exact: true })).toBeVisible();
      await page
        .getByRole("link", { name: tList("T-432")[5], exact: true })
        .last()
        .click();
      await expect(
        page.getByRole("link", { name: t("T-946", { formulario: "e2e Postulación" }) }),
      ).toBeVisible();
      await sinViolaciones(page);
    } finally {
      await context.close();
    }
  });
});

test("inscribirse a una edición mediante un formulario de miembros", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Falta la URL del servidor E2E");
  await test.step("el formulario de miembros exige sesión e inscribe a la edición", async () => {
    const context = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/.auth/admin.json",
    });
    try {
      const page = await context.newPage();

      // Un formulario de miembros ligado a la primera edición publicada.
      await page.goto("/admin/formularios?nuevo=1");
      const panel = page.getByRole("dialog");
      await panel.getByLabel(tList("T-910")[0]).fill("e2e-inscripcion");
      await panel.getByLabel(tList("T-910")[1]).fill("e2e Inscripción");
      await panel.getByLabel(tList("T-910")[3]).selectOption("MEMBERS");
      await panel.getByLabel(tList("T-910")[4]).selectOption("OPEN");
      await panel.getByRole("button", { name: t("T-253") }).click();
      await expect(page.getByText(t("T-259"))).toBeVisible();
      await page.getByRole("link", { name: "e2e Inscripción" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e Inscripción");
      const edicion = page.getByLabel(tList("T-930")[2]);
      await expect(edicion.locator("option").nth(1)).toBeAttached();
      const opciones = await edicion.locator("option").allTextContents();
      const primera = opciones.find((label) => label !== tList("T-932")[1]);
      if (!primera) throw new Error("sin ediciones en el seed");
      await edicion.selectOption({ label: primera });
      await page
        .getByRole("button", { name: t("T-253") })
        .last()
        .click();
      await expect(page.getByText(tList("T-933")[1])).toBeVisible();

      // Con sesión de ADMIN (también miembro): responde y queda inscrito.
      await page.goto("/f/e2e-inscripcion");
      await expect(page.getByText(copyPattern("T-872"))).toBeVisible();
      await page.getByRole("button", { name: t("T-852") }).click();
      await expect(page.getByText(t("T-859"))).toBeVisible();
      await expect(page.getByText(copyPattern("T-867"))).toBeVisible();
      await page.goto("/f/e2e-inscripcion");
      await page.getByRole("button", { name: t("T-852") }).click();
      await expect(page.getByText(t("T-862"))).toBeVisible();
      void E2E_MEMBER_EMAIL;
    } finally {
      await context.close();
    }
  });
});
