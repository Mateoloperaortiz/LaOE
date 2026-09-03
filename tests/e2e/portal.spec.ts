import { expect, test } from "@playwright/test";
import { sinViolaciones } from "./axe";

// Portal público de la fase 1. La sesión de ADMIN viene de auth.setup.ts; las rutas públicas no la necesitan.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

const PAGINAS: Array<[string, string]> = [
  ["/la-oe", "La OE"],
  ["/unirse", "¿Querés ser parte de la OE?"],
  ["/privacidad", "Tratamiento de datos personales"],
];

test("las páginas fijas nacen de la migración, responden con su título y pasan axe", async ({
  page,
}) => {
  for (const [ruta, titulo] of PAGINAS) {
    await page.goto(ruta);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);
    await sinViolaciones(page);
  }
  await page.goto("/no-existe-esta-pagina");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Esta página no existe");
});

test("un ADMIN edita y publica La OE desde el panel y el visitante la ve", async ({ page }) => {
  const marca = `e2e-${Date.now().toString(36)}`;
  await page.goto("/admin/paginas?q=la-oe");
  await page.getByRole("link", { name: "Editar" }).first().click();
  const panel = page.getByRole("complementary");
  const cuerpo = panel.getByLabel("Cuerpo (Markdown)");
  const estado = panel.getByLabel("Publicación");
  const cuerpoOriginal = await cuerpo.inputValue();
  const estadoOriginal = await estado.inputValue();

  await cuerpo.fill(`## Historia de prueba\n\nTexto ${marca} escrito desde el admin.`);
  await estado.selectOption("PUBLISHED");
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();

  await page.goto("/la-oe");
  await expect(page.getByRole("heading", { name: "Historia de prueba" })).toBeVisible();
  await expect(page.getByText(`Texto ${marca}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contacto" })).toBeVisible();
  await sinViolaciones(page);

  // Deja la página como estaba para no pisar el contenido de quien corre la suite en local.
  await page.goto("/admin/paginas?q=la-oe");
  await page.getByRole("link", { name: "Editar" }).first().click();
  const otra = page.getByRole("complementary");
  await otra.getByLabel("Cuerpo (Markdown)").fill(cuerpoOriginal);
  await otra.getByLabel("Publicación").selectOption(estadoOriginal);
  await otra.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
});
