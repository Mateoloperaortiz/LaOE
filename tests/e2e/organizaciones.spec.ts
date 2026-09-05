import { expect, test } from "@playwright/test";
import { sinViolaciones } from "./axe";

// Organizaciones y contactos (ADR-037 regla 6): ADMIN crea una organización e2e-, le agrega un contacto
// externo y una nota, y la encuentra en la paleta ⌘K.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const NAME = "e2e-Bancolombia";

test("ADMIN crea una organización con un contacto externo y una nota y la busca en la paleta", async ({
  page,
}) => {
  await page.goto("/admin/organizaciones?nuevo=1");
  const panel = page.getByRole("complementary");
  await panel.getByLabel("Nombre").fill(NAME);
  await panel.getByLabel("Tipo").selectOption("COMPANY");
  await panel.getByLabel("Sitio web").fill("https://www.bancolombia.com");
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: NAME }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
  await expect(page.getByText("Todavía no hay contactos.")).toBeVisible();

  // Contacto externo nuevo, principal.
  await page.getByRole("link", { name: "Agregar contacto" }).click();
  const contacto = page.getByRole("complementary");
  await contacto.getByLabel("Nombre").fill("Clara");
  await contacto.getByLabel("Apellido").fill("Ruiz");
  await contacto.getByLabel("Correo").fill("e2e-clara@bancolombia.test");
  await contacto.getByLabel("Rol").fill("Gerente de marca");
  await contacto.getByLabel("Contacto principal").check();
  await contacto.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clara Ruiz" })).toBeVisible();
  await expect(page.getByText("Principal", { exact: true })).toBeVisible();
  await expect(page.getByText(/Gerente de marca/)).toBeVisible();

  // Una nota sobre la organización queda en su línea de tiempo.
  await page.getByRole("link", { name: "Guardar nota" }).click();
  await page
    .getByRole("complementary")
    .getByLabel("Guardar nota")
    .fill("Reunión el martes con la gerencia.");
  await page.getByRole("complementary").getByRole("button", { name: "Guardar nota" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByText("Reunión el martes con la gerencia.").first()).toBeVisible();
  await sinViolaciones(page);

  // La paleta ⌘K la encuentra (el botón responde después de hidratar: se reintenta hasta que abra).
  const input = page.getByRole("searchbox", { name: "Buscá personas o comités" });
  await expect(async () => {
    await page.getByRole("button", { name: "Buscar (⌘K)" }).click();
    await expect(input).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await input.fill("e2e-Banco");
  const resultado = page.getByRole("link", { name: new RegExp(`${NAME}.*Organización`) });
  await expect(resultado).toBeVisible();
  await resultado.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
});
