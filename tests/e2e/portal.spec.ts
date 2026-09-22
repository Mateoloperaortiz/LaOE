import { expect } from "@playwright/test";
import { t } from "@/shared/copy";
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    t("T-2721").split(". ")[0] ?? "",
  );
});

test("un ADMIN edita y publica La OE desde el panel y el visitante la ve", async ({ page }) => {
  const marca = `e2e-${Date.now().toString(36)}`;
  await page.goto("/admin/paginas?q=la-oe");
  await page
    .getByRole("link", { name: t("T-252") })
    .first()
    .click();
  const panel = page.getByRole("dialog");
  const cuerpo = panel.getByLabel(t("T-336"));
  const estado = panel.getByLabel(t("T-279"));
  const cuerpoOriginal = await cuerpo.inputValue();
  const estadoOriginal = await estado.inputValue();

  await cuerpo.fill(`## Historia de prueba\n\nTexto ${marca} escrito desde el admin.`);
  await estado.selectOption("PUBLISHED");
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();

  await page.goto("/la-oe");
  await expect(page.getByRole("heading", { name: "Historia de prueba" })).toBeVisible();
  await expect(page.getByText(`Texto ${marca}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: t("T-321") })).toBeVisible();
  await sinViolaciones(page);

  // Deja la página como estaba para no pisar el contenido de quien corre la suite en local.
  await page.goto("/admin/paginas?q=la-oe");
  await page
    .getByRole("link", { name: t("T-252") })
    .first()
    .click();
  const otra = page.getByRole("dialog");
  await otra.getByLabel(t("T-336")).fill(cuerpoOriginal);
  await otra.getByLabel(t("T-279")).selectOption(estadoOriginal);
  await otra.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
});

test("un ADMIN publica y fija un anuncio y el visitante lo ve en el inicio, la cartelera y su página", async ({
  page,
}) => {
  const marca = Date.now().toString(36);
  const titulo = `e2e-anuncio-${marca}`;
  await page.goto("/admin/cartelera");
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel(t("T-335")).fill(titulo);
  await panel.getByLabel(t("T-336")).fill(`## Detalle\n\nCuerpo ${marca} del anuncio.`);
  await panel.getByLabel(t("T-338")).selectOption("PUBLIC");
  await panel.getByLabel(t("T-340")).check();
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();

  // "Publicar" es subcadena de "Despublicar": los botones se buscan con nombre exacto.
  const fila = page.getByRole("row", { name: new RegExp(titulo) });
  await fila.locator("summary", { hasText: t("T-1426") }).click();
  await fila.getByRole("button", { name: t("T-342"), exact: true }).click();
  await expect(fila.getByRole("button", { name: t("T-343"), exact: true })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: titulo })).toBeVisible();
  await sinViolaciones(page);

  await page.goto("/cartelera");
  await expect(page.getByText(t("T-303"), { exact: false }).first()).toBeVisible();
  await page.getByRole("link", { name: titulo }).click();
  await expect(page).toHaveURL(/\/cartelera\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);
  await expect(page.getByText(`Cuerpo ${marca} del anuncio.`)).toBeVisible();
  // Tras la navegación en cliente el título llega con los metadatos: axe lo exige antes de auditar.
  await expect(page).toHaveTitle(new RegExp(titulo));
  await sinViolaciones(page);

  await page.goto(`/admin/cartelera?q=${titulo}`);
  const filaBuscada = page.getByRole("row", { name: new RegExp(titulo) });
  await filaBuscada.locator("summary", { hasText: t("T-1426") }).click();
  await filaBuscada.getByRole("button", { name: t("T-343"), exact: true }).click();
  // La acción del servidor termina con una redirección: esperar la fila evita abortarla al navegar.
  await expect(filaBuscada.getByRole("button", { name: t("T-342"), exact: true })).toBeVisible();
  await page.goto("/cartelera");
  await expect(page.getByRole("link", { name: titulo })).toHaveCount(0);
});

test("un comité publicado tiene ficha pública sin roster", async ({ page }) => {
  const slug = `e2e-pub-${Date.now().toString(36)}`;
  const nombre = `Comité ${slug}`;
  await page.goto("/admin/comites");
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel(t("T-272")).fill(slug);
  await panel.getByLabel(t("T-273")).fill(nombre);
  await panel.getByLabel(t("T-274")).selectOption("ACTIVE");
  await panel.getByLabel(t("T-278")).fill("https://instagram.com/oeeafit");
  await panel.getByLabel(t("T-279")).selectOption("PUBLISHED");
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();

  await page.goto("/comites");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-309"));
  await page.getByRole("link", { name: new RegExp(nombre) }).click();
  await expect(page).toHaveURL(new RegExp(`/comites/${slug}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
  await expect(page.getByText(t("T-310"))).toBeVisible();
  await expect(page.getByRole("link", { name: t("T-024") })).toHaveAttribute(
    "href",
    "https://instagram.com/oeeafit",
  );
  await sinViolaciones(page);
});
