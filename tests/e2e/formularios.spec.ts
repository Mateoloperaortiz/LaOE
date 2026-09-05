import { expect, test } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Formularios propios (ADR-013, ADR-037 reglas 3 a 5): ADMIN arma y abre un formulario e2e-; un
// visitante sin sesión lo responde con consentimiento; la segunda respuesta con el mismo correo se
// rechaza y el honeypot no crea fila; la respuesta aparece en la bandeja y en la Persona 360.

const SLUG = "e2e-postulacion";
const EMAIL = "e2e-formulario@gmail.com";

test.describe("constructor y envío público", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("ADMIN crea un formulario con campos y lo abre", async ({ page }) => {
    await page.goto("/admin/formularios?nuevo=1");
    const panel = page.getByRole("complementary");
    await panel.getByLabel("Identificador").fill(SLUG);
    await panel.getByLabel("Título").fill("e2e Postulación");
    await panel.getByLabel("Descripción").fill("Contanos de vos.");
    await panel.getByLabel("Estado").selectOption("OPEN");
    await panel.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
    await sinViolaciones(page);

    await page.getByRole("link", { name: "e2e Postulación" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e Postulación");
    await expect(page.getByText(/Este formulario todavía no tiene campos/)).toBeVisible();
    await page.getByRole("link", { name: "Agregar campo" }).click();
    const campo = page.getByRole("complementary");
    await campo.getByLabel("Clave").fill("motivo");
    await campo.getByLabel("Etiqueta").fill("¿Por qué querés entrar?");
    await campo.getByLabel("Tipo").selectOption("TEXTAREA");
    await campo.getByLabel("Obligatorio").check();
    await campo.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Campos guardados.")).toBeVisible();
    await page.getByRole("link", { name: "Agregar campo" }).click();
    const segundo = page.getByRole("complementary");
    await segundo.getByLabel("Clave").fill("comite");
    await segundo.getByLabel("Etiqueta").fill("Comité que te interesa");
    await segundo.getByLabel("Tipo").selectOption("SELECT");
    await segundo.getByLabel("Opciones (una por línea)").fill("A3\nPIXEL");
    await segundo.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Campos guardados.")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Comité que te interesa" })).toBeVisible();
    // Las acciones: crear la persona como prospecto.
    await page.getByLabel("Crear la persona como prospecto si no existe").check();
    await page.getByRole("button", { name: "Guardar" }).last().click();
    await expect(page.getByText("Acciones guardadas.")).toBeVisible();
    await sinViolaciones(page);
  });
});

test.describe("visitante sin sesión", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("responde con consentimiento, no puede repetir el correo y el honeypot no guarda", async ({
    page,
  }) => {
    await page.goto(`/f/${SLUG}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e Postulación");
    await sinViolaciones(page);
    // Sin consentimiento ni motivo: errores por campo.
    await page.getByLabel("Nombre").fill("Lu");
    await page.getByLabel("Apellido").fill("Prueba");
    await page.getByLabel("Correo").fill(EMAIL);
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Este campo es obligatorio.").first()).toBeVisible();
    await page.getByLabel("¿Por qué querés entrar?").fill("Quiero aportar en logística.");
    await page.getByLabel("Comité que te interesa").selectOption("A3");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(
      page.getByText("Para enviar tenés que aceptar la política de tratamiento de datos."),
    ).toBeVisible();
    await page.getByLabel(/Acepto la política de tratamiento de datos/).check();
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("¡Listo! Recibimos tu respuesta. ¡OE OE OE!")).toBeVisible();
    await sinViolaciones(page);

    // Segunda respuesta con el mismo correo.
    await page.goto(`/f/${SLUG}`);
    await page.getByLabel("Nombre").fill("Lu");
    await page.getByLabel("Apellido").fill("Prueba");
    await page.getByLabel("Correo").fill(EMAIL);
    await page.getByLabel("¿Por qué querés entrar?").fill("Otra vez.");
    await page.getByLabel(/Acepto la política/).check();
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Ya recibimos una respuesta con ese correo.")).toBeVisible();

    // El campo trampa lleno responde "gracias" sin guardar.
    await page.goto(`/f/${SLUG}`);
    await page.getByLabel("Nombre").fill("Bot");
    await page.getByLabel("Apellido").fill("Spam");
    await page.getByLabel("Correo").fill("e2e-bot@spam.test");
    await page.getByLabel("¿Por qué querés entrar?").fill("spam");
    await page.getByLabel(/Acepto la política/).check();
    await page.locator('input[name="sitio_web"]').fill("http://spam", { force: true });
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("¡Listo! Recibimos tu respuesta. ¡OE OE OE!")).toBeVisible();
  });
});

test.describe("bandeja y Persona 360", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("ADMIN ve la respuesta en la bandeja y en la pestaña Formularios de la persona", async ({
    page,
  }) => {
    await page.goto("/admin/formularios");
    await page.getByRole("link", { name: "e2e Postulación" }).click();
    await page.getByRole("link", { name: /Respuestas \(1\)/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Respuestas · e2e Postulación/,
    );
    await expect(page.getByRole("cell", { name: EMAIL })).toBeVisible();
    await expect(page.getByRole("cell", { name: "e2e-bot@spam.test" })).toHaveCount(0);
    await page.getByRole("link", { name: "Lu Prueba" }).first().click();
    const panel = page.getByRole("complementary");
    await expect(panel.getByText("Quiero aportar en logística.")).toBeVisible();
    await expect(panel.getByText("A3", { exact: true })).toBeVisible();
    await sinViolaciones(page);

    await page.goto("/admin/personas?q=e2e-formulario");
    await page.getByRole("link", { name: "Lu Prueba" }).first().click();
    await expect(page.getByText("Prospecto").first()).toBeVisible();
    await page.getByRole("link", { name: "Formularios", exact: true }).last().click();
    await expect(page.getByRole("link", { name: "Respuesta a e2e Postulación" })).toBeVisible();
    await sinViolaciones(page);
  });
});

test.describe("inscripción a una edición desde un formulario de miembros", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("el formulario de miembros exige sesión e inscribe a la edición", async ({ page }) => {
    // Un formulario de miembros ligado a la primera edición publicada.
    await page.goto("/admin/formularios?nuevo=1");
    const panel = page.getByRole("complementary");
    await panel.getByLabel("Identificador").fill("e2e-inscripcion");
    await panel.getByLabel("Título").fill("e2e Inscripción");
    await panel.getByLabel("Audiencia").selectOption("MEMBERS");
    await panel.getByLabel("Estado").selectOption("OPEN");
    await panel.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
    await page.getByRole("link", { name: "e2e Inscripción" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e Inscripción");
    const edicion = page.getByLabel("Inscribir a la edición");
    await expect(edicion.locator("option").nth(1)).toBeAttached();
    const opciones = await edicion.locator("option").allTextContents();
    const primera = opciones.find((label) => label !== "Ninguna");
    if (!primera) throw new Error("sin ediciones en el seed");
    await edicion.selectOption({ label: primera });
    await page.getByRole("button", { name: "Guardar" }).last().click();
    await expect(page.getByText("Acciones guardadas.")).toBeVisible();

    // Con sesión de ADMIN (también miembro): responde y queda inscrito.
    await page.goto("/f/e2e-inscripcion");
    await expect(page.getByText(/Respondés como/)).toBeVisible();
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("¡Listo! Recibimos tu respuesta. ¡OE OE OE!")).toBeVisible();
    await expect(page.getByText(/Quedaste inscrito a/)).toBeVisible();
    await page.goto("/f/e2e-inscripcion");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Ya recibimos una respuesta con ese correo.")).toBeVisible();
    void E2E_MEMBER_EMAIL;
  });
});
