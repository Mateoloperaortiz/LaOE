import { expect } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

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
  const panel = page.getByRole("dialog");
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
  const otra = page.getByRole("dialog");
  await otra.getByLabel("Cuerpo (Markdown)").fill(cuerpoOriginal);
  await otra.getByLabel("Publicación").selectOption(estadoOriginal);
  await otra.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
});

test("un ADMIN publica y fija un anuncio y el visitante lo ve en el inicio, la cartelera y su página", async ({
  page,
}) => {
  const marca = Date.now().toString(36);
  const titulo = `e2e-anuncio-${marca}`;
  await page.goto("/admin/cartelera");
  await page.getByRole("link", { name: "Nuevo" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Título").fill(titulo);
  await panel.getByLabel("Cuerpo (Markdown)").fill(`## Detalle\n\nCuerpo ${marca} del anuncio.`);
  await panel.getByLabel("Audiencia").selectOption("PUBLIC");
  await panel.getByLabel("Fijado arriba de la cartelera").check();
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();

  // "Publicar" es subcadena de "Despublicar": los botones se buscan con nombre exacto.
  const fila = page.getByRole("row", { name: new RegExp(titulo) });
  await fila.locator("summary", { hasText: "Acciones" }).click();
  await fila.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(fila.getByRole("button", { name: "Despublicar", exact: true })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: titulo })).toBeVisible();
  await sinViolaciones(page);

  await page.goto("/cartelera");
  await expect(page.getByText("Fijado", { exact: false }).first()).toBeVisible();
  await page.getByRole("link", { name: titulo }).click();
  await expect(page).toHaveURL(/\/cartelera\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);
  await expect(page.getByText(`Cuerpo ${marca} del anuncio.`)).toBeVisible();
  // Tras la navegación en cliente el título llega con los metadatos: axe lo exige antes de auditar.
  await expect(page).toHaveTitle(new RegExp(titulo));
  await sinViolaciones(page);

  await page.goto(`/admin/cartelera?q=${titulo}`);
  const filaBuscada = page.getByRole("row", { name: new RegExp(titulo) });
  await filaBuscada.locator("summary", { hasText: "Acciones" }).click();
  await filaBuscada.getByRole("button", { name: "Despublicar", exact: true }).click();
  // La acción del servidor termina con una redirección: esperar la fila evita abortarla al navegar.
  await expect(filaBuscada.getByRole("button", { name: "Publicar", exact: true })).toBeVisible();
  await page.goto("/cartelera");
  await expect(page.getByRole("link", { name: titulo })).toHaveCount(0);
});

test("un comité publicado tiene ficha pública sin roster", async ({ page }) => {
  const slug = `e2e-pub-${Date.now().toString(36)}`;
  const nombre = `Comité ${slug}`;
  await page.goto("/admin/comites");
  await page.getByRole("link", { name: "Nuevo" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Sigla").fill(slug);
  await panel.getByLabel("Nombre").fill(nombre);
  await panel.getByLabel("Estado").selectOption("ACTIVE");
  await panel.getByLabel("Enlace de contacto").fill("https://instagram.com/oeeafit");
  await panel.getByLabel("Publicación").selectOption("PUBLISHED");
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();

  await page.goto("/comites");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Comités");
  await page.getByRole("link", { name: new RegExp(nombre) }).click();
  await expect(page).toHaveURL(new RegExp(`/comites/${slug}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
  await expect(page.getByText("todavía no publicó su presentación")).toBeVisible();
  await expect(page.getByRole("link", { name: "Escribiles" })).toHaveAttribute(
    "href",
    "https://instagram.com/oeeafit",
  );
  await sinViolaciones(page);
});
