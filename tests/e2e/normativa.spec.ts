import { expect, test } from "@playwright/test";
import { sampleArticlesJson, sampleNormativaPdf } from "../helpers/pdf";
import { sinViolaciones } from "./axe";

// Normativa (ADR-034 regla 9): el admin sube un PDF sintético y carga tres artículos; el miembro
// busca, abre el artículo y el PDF original responde 302 al bucket.

// Título fijo: el global-setup borra los documentos `e2e-%` en cada corrida, y las dos partes de la
// prueba corren en workers distintos (cada `storageState` es un worker), así que no comparten memoria.
const titulo = "e2e-estatutos-prueba";

test.describe("como admin", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("sube un PDF, carga los artículos desde el JSON y lo publica", async ({ page }) => {
    await page.goto("/admin/documentos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Documentos");
    await sinViolaciones(page);
    await page.getByLabel("Título").fill(titulo);
    await page.getByLabel("Tipo").selectOption("ESTATUTOS");
    await page.getByLabel("Versión (fecha de la reforma)").fill("2026-05-08");
    await page.getByLabel("Audiencia").selectOption("MEMBERS");
    const confirmado = page.waitForResponse(
      (response) => response.url().includes("/api/documentos/confirm") && response.status() === 201,
    );
    await page.getByLabel("Archivo PDF").setInputFiles({
      name: "estatutos-prueba.pdf",
      mimeType: "application/pdf",
      buffer: sampleNormativaPdf(),
    });
    await confirmado;
    await expect(
      page.getByText("Listo: el PDF quedó guardado. Ahora cargá los artículos."),
    ).toBeVisible();
    const fila = page.getByRole("row", { name: new RegExp(titulo) });
    await expect(fila).toBeVisible();
    await expect(fila.getByText("Borrador")).toBeVisible();

    await fila.getByLabel("Cargar artículos (JSON)").setInputFiles({
      name: "estatutos.json",
      mimeType: "application/json",
      buffer: Buffer.from(sampleArticlesJson()),
    });
    // El input de archivo también expone rol de botón con el mismo nombre: se busca el <button>.
    await fila.locator('button[type="submit"]', { hasText: "Cargar artículos (JSON)" }).click();
    await expect(page.getByText("3 artículos cargados")).toBeVisible();

    const filaCargada = page.getByRole("row", { name: new RegExp(titulo) });
    await filaCargada.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(
      page
        .getByRole("row", { name: new RegExp(titulo) })
        .getByRole("button", { name: "Despublicar", exact: true }),
    ).toBeVisible();
  });
});

test.describe("como miembro", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("busca un artículo, lo abre y el PDF original redirige al bucket", async ({ page }) => {
    await page.goto("/app/normativa");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Normativa");
    await expect(page.getByRole("link", { name: new RegExp(titulo) })).toBeVisible();
    await sinViolaciones(page);

    await page.getByLabel("Buscá en los estatutos y el reglamento").fill("asamblea");
    await page.getByRole("button", { name: "Buscar" }).click();
    const resultado = page.getByRole("link", { name: new RegExp(`${titulo} · Artículo 3`) });
    await expect(resultado).toBeVisible();
    await expect(page.locator("mark").first()).toContainText(/asamblea/i);
    await resultado.click();
    await page.waitForURL(/\/app\/normativa\/[a-z0-9]+#art-3$/);
    await expect(page.getByRole("heading", { name: /Artículo 3/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Índice" })).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(titulo));
    await sinViolaciones(page);

    const href = await page
      .getByRole("link", { name: "Abrir el PDF original" })
      .getAttribute("href");
    expect(href).toMatch(/^\/api\/documentos\/[a-z0-9]+\/pdf$/);
    const respuesta = await page.request.get(href ?? "", { maxRedirects: 0 });
    expect(respuesta.status()).toBe(302);
    expect(respuesta.headers().location).toContain("documents/");
  });
});
