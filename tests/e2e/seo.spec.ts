import { expect, type Page } from "@playwright/test";
import { t } from "@/shared/copy";
import { test } from "./fixtures";

// SEO e imágenes para compartir (F1-T5): metadata, OG, robots y sitemap. En local y CI
// PUBLIC_INDEXING no está encendido, así que todo lleva noindex y robots cierra el sitio.

const ORIGIN = process.env.APP_URL ?? "http://localhost:3000";

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
  // Con el build recién hecho cada imagen se genera por primera vez (unos 2,6 s cada una): la prueba
  // tarda cerca de 29 s, contra 4 s con las imágenes ya generadas, y con el límite de 30 s fallaba a veces.
  test.setTimeout(120_000);
  for (const ruta of RUTAS) {
    await page.goto(ruta);
    // metadataBase compone "/" sin barra final (documentación de Next, "URL composition").
    await expect(page.locator('link[rel="canonical"]'), ruta).toHaveAttribute(
      "href",
      ruta === "/" ? ORIGIN : `${ORIGIN}${ruta}`,
    );
    await expect(page.locator('meta[property="og:site_name"]'), ruta).toHaveAttribute(
      "content",
      t("T-001"),
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

// El isotipo vive en `src/app/icon.svg`, pero unos `icons` explícitos en la metadata reemplazan a
// los íconos por archivo (Next 16, `accumulateMetadata`), así que el layout raíz declara los dos.
test("la portada, Mi OE y el admin declaran el favicon SVG y el ícono de iOS", async ({
  page,
  browser,
  request,
}) => {
  /** Los href de los dos íconos de una ruta, ya comprobada su forma. */
  async function iconosDe(pagina: Page, ruta: string): Promise<[string, string]> {
    await pagina.goto(ruta);
    // Sin sesión, Mi OE y el admin mandan a /ingresar, que también llevaría los íconos.
    expect(new URL(pagina.url()).pathname, ruta).toBe(ruta);
    const icono = pagina.locator('link[rel="icon"]');
    // La convención por archivo agregaría "?hash" al href: las dos formas sirven.
    await expect(icono, ruta).toHaveAttribute("href", /^\/icon\.svg(\?|$)/);
    await expect(icono, ruta).toHaveAttribute("type", "image/svg+xml");
    const apple = pagina.locator('link[rel="apple-touch-icon"]');
    await expect(apple, ruta).toHaveAttribute("href", /\.png(\?|$)/);
    return [(await icono.getAttribute("href")) ?? "", (await apple.getAttribute("href")) ?? ""];
  }

  const [icono, apple] = await iconosDe(page, "/");
  for (const [ruta, storageState] of [
    ["/app", "tests/e2e/.auth/member.json"],
    ["/admin", "tests/e2e/.auth/admin.json"],
  ] as const) {
    const context = await browser.newContext({ baseURL: ORIGIN, storageState });
    try {
      await iconosDe(await context.newPage(), ruta);
    } finally {
      await context.close();
    }
  }

  const svg = await request.get(icono);
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  const png = await request.get(apple);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toContain("image/png");
});

test("robots cierra el sitio y el sitemap lista solo lo publicado", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /");
  expect(robots.headers()["x-robots-tag"]).toContain("noindex");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain(`<loc>${ORIGIN}/eventos/dias-eafit/prueba</loc>`);
  expect(xml).toContain(`<loc>${ORIGIN}/comites/a3</loc>`);
  expect(xml).not.toContain("/admin");
  // Las páginas fijas en borrador no salen en el sitemap.
  expect(xml).not.toContain(`<loc>${ORIGIN}/privacidad</loc>`);
});
