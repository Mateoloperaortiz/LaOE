import { expect, test } from "@playwright/test";

// SEO e imágenes para compartir (F1-T5): metadata, OG, robots y sitemap. En local y CI
// PUBLIC_INDEXING no está encendido, así que todo lleva noindex y robots cierra el sitio.

const RUTAS = [
  "/",
  "/la-oe",
  "/cartelera",
  "/eventos",
  "/eventos/dias-eafit",
  "/eventos/dias-eafit/prueba",
  "/comites",
  "/comites/a3",
];

test("cada página lleva canonical, og:image que responde PNG y noindex mientras no se indexe", async ({
  page,
  request,
}) => {
  for (const ruta of RUTAS) {
    await page.goto(ruta);
    // metadataBase compone "/" sin barra final (documentación de Next, "URL composition").
    await expect(page.locator('link[rel="canonical"]'), ruta).toHaveAttribute(
      "href",
      ruta === "/" ? "http://localhost:3000" : `http://localhost:3000${ruta}`,
    );
    await expect(page.locator('meta[property="og:site_name"]'), ruta).toHaveAttribute(
      "content",
      "Organización Estudiantil EAFIT",
    );
    await expect(page.locator('meta[name="robots"]').first(), ruta).toHaveAttribute(
      "content",
      /noindex/,
    );
    const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(ogImage, ruta).toMatch(/\/opengraph-image/);
    const imagen = await request.get(ogImage ?? "");
    expect(imagen.status(), ruta).toBe(200);
    expect(imagen.headers()["content-type"], ruta).toBe("image/png");
    expect((await imagen.body()).byteLength, ruta).toBeGreaterThan(10_000);
  }

  await page.goto("/eventos/dias-eafit/prueba");
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(jsonLd ?? "{}")).toMatchObject({ "@type": "Event", name: /Días EAFIT/ });
});

test("robots cierra el sitio y el sitemap lista solo lo publicado", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /");
  expect(robots.headers()["x-robots-tag"]).toContain("noindex");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("<loc>http://localhost:3000/eventos/dias-eafit/prueba</loc>");
  expect(xml).toContain("<loc>http://localhost:3000/comites/a3</loc>");
  expect(xml).not.toContain("/admin");
  // Las páginas fijas en borrador no salen en el sitemap.
  expect(xml).not.toContain("<loc>http://localhost:3000/privacidad</loc>");
});
