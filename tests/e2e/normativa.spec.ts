import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { closeDb, getDb } from "@/db/client";
import { processMedia } from "@/modules/content/domain/media-process";
import { document as documentTable, mediaAsset } from "@/modules/content/schema";
import { onboardingProgress } from "@/modules/crm/schema";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import {
  SAMPLE_LONG_ARTICLE_TITLE,
  sampleArticlesJson,
  sampleNormativaPdf,
  sampleNormativaV2Json,
  sampleNormativaV2Pdf,
} from "../helpers/pdf";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_EMAIL } from "./global-setup";
import { prepareReaderDocument } from "./normativa-fixture";
import { drenarOutbox } from "./outbox";

// Normativa (ADR-034 regla 9): el admin sube un PDF sintético y carga tres artículos; el miembro
// busca, abre el artículo y el PDF original responde 302 al bucket.

// Cada lector prepara su versión después de restaurar la base; no depende de las cargas por UI.
const titulo = "e2e-estatutos-prueba";
const tituloV2 = "e2e-estatutos-completos-de-la-organización-de-prueba";

test.afterEach(async () => {
  await drenarOutbox();
  return closeDb();
});

async function adminOnboarding() {
  return getDb()
    .select({ step: onboardingProgress.stepKey, done: onboardingProgress.doneAt })
    .from(onboardingProgress)
    .innerJoin(person, eq(onboardingProgress.personId, person.id))
    .where(eq(person.email, E2E_EMAIL))
    .orderBy(onboardingProgress.stepKey);
}

test.describe("como admin", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("elegir un PDF no lo sube y un fallo conserva el archivo y los metadatos", async ({
    page,
  }) => {
    let attempts = 0;
    let finishFirst = () => {};
    const firstResponse = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    await page.route("**/api/documentos/presign", async (route) => {
      attempts += 1;
      if (attempts === 1) await firstResponse;
      await route.fulfill({ status: 503, json: { error: "Subida de prueba interrumpida." } });
    });
    await page.goto("/admin/documentos?q=conservar");
    await page.getByRole("link", { name: t("T-1460"), exact: true }).click();
    const panel = page.getByRole("dialog");
    await panel.getByLabel(tList("T-494")[4]).setInputFiles({
      name: "conservar.pdf",
      mimeType: "application/pdf",
      buffer: sampleNormativaPdf(),
    });
    expect(attempts).toBe(0);
    await panel.getByLabel(tList("T-494")[0]).fill("e2e-Conservar documento");
    await panel.getByLabel(tList("T-494")[2]).fill("2026-09-08");
    await panel.getByLabel(tList("T-494")[3]).selectOption("PUBLIC");
    const submit = panel.getByRole("button", { name: t("T-1460"), exact: true });
    try {
      await submit.click();
      await expect(panel.getByLabel(tList("T-494")[0])).toBeDisabled();
      await expect(panel.getByLabel(tList("T-494")[3])).toBeDisabled();
      await expect(submit).toBeDisabled();
    } finally {
      finishFirst();
    }
    await expect(panel.getByRole("alert")).toHaveText("Subida de prueba interrumpida.");
    await expect(panel.getByLabel(tList("T-494")[0])).toHaveValue("e2e-Conservar documento");
    await expect(panel.getByLabel(tList("T-494")[2])).toHaveValue("2026-09-08");
    await expect(panel.getByLabel(tList("T-494")[3])).toHaveValue("PUBLIC");
    expect(
      await panel
        .getByLabel(tList("T-494")[4])
        .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe("conservar.pdf");
    await submit.click();
    await expect.poll(() => attempts).toBe(2);
    await expect(panel.getByRole("alert")).toBeVisible();
    await sinViolaciones(page);
    await panel.getByRole("button", { name: t("T-291"), exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/documentos\?q=conservar$/);
  });

  test("sube un PDF, carga los artículos desde el JSON y lo publica", async ({ page }) => {
    await getDb().delete(documentTable).where(eq(documentTable.title, titulo));
    await page.goto("/admin/documentos");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(tList("T-425")[0]);
    await sinViolaciones(page);
    await page.getByRole("link", { name: t("T-1460"), exact: true }).click();
    await page.getByRole("dialog").getByLabel(tList("T-494")[0]).fill(titulo);
    await page.getByRole("dialog").getByLabel(tList("T-494")[1]).selectOption("ESTATUTOS");
    await page.getByRole("dialog").getByLabel(tList("T-494")[2]).fill("2026-05-08");
    await page.getByRole("dialog").getByLabel(tList("T-494")[3]).selectOption("MEMBERS");
    const confirmado = page.waitForResponse(
      (response) => response.url().includes("/api/documentos/confirm") && response.status() === 201,
    );
    await page.getByRole("dialog").getByLabel(tList("T-494")[4]).setInputFiles({
      name: "estatutos-prueba.pdf",
      mimeType: "application/pdf",
      buffer: sampleNormativaPdf(),
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: t("T-1460"), exact: true })
      .click();
    await confirmado;
    await expect(page).toHaveURL(/\/admin\/documentos\/[a-z0-9]+\?subido=1$/);
    await expect(page.getByText(t("T-1292"))).toBeVisible();
    const fila = page.getByRole("region", { name: t("T-1467") });
    await expect(fila).toBeVisible();
    await expect(
      page.getByRole("main").getByText(tList("T-288")[0], { exact: true }),
    ).toBeVisible();

    await fila.getByRole("button", { name: t("T-342"), exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("error") === t("T-1300"));
    // El anunciador de rutas de Next también tiene role=alert; no indica que terminó el redirect.
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(t("T-1300"));
    await expect(
      page.getByRole("main").getByText(tList("T-288")[0], { exact: true }),
    ).toBeVisible();

    await fila.getByLabel(t("T-1291")).setInputFiles({
      name: "contenido-invalido.json",
      mimeType: "application/json",
      buffer: Buffer.from("{contenido incompleto"),
    });
    await fila.locator('button[type="submit"]', { hasText: t("T-1291") }).click();
    await expect(page).toHaveURL((url) => Boolean(url.searchParams.get("error")?.includes("JSON")));
    expect(
      await fila
        .getByLabel(t("T-1291"))
        .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe("contenido-invalido.json");

    await fila.getByLabel(t("T-1291")).setInputFiles({
      name: "estatutos.json",
      mimeType: "application/json",
      buffer: Buffer.from(sampleArticlesJson()),
    });
    // El input de archivo también expone rol de botón con el mismo nombre: se busca el <button>.
    await fila.locator('button[type="submit"]', { hasText: t("T-1291") }).click();
    await expect(page.getByText(t("T-1290", { n: 3 }))).toBeVisible();

    const filaCargada = page.getByRole("region", { name: t("T-1467") });
    await filaCargada.getByRole("button", { name: t("T-342"), exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: t("T-1467") })
        .getByRole("button", { name: t("T-343"), exact: true }),
    ).toBeVisible();
  });

  test("revisa un borrador v2 con secciones, tabla e imagen privada sin marcar el onboarding", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    await getDb().delete(documentTable).where(eq(documentTable.title, tituloV2));
    await page.goto("/admin/medios");
    await page.getByRole("link", { name: t("T-356"), exact: true }).click();
    await page.getByLabel(t("T-365")).selectOption("PRIVATE");
    const image = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="360"><rect width="800" height="360" fill="white"/><path d="M400 105V180H200V230M400 180H600V230" stroke="#10264c" stroke-width="6" fill="none"/><g fill="#10264c"><rect x="260" y="20" width="280" height="85"/><rect x="60" y="230" width="280" height="85"/><rect x="460" y="230" width="280" height="85"/></g><g fill="white" font-family="sans-serif" font-size="28" text-anchor="middle"><text x="400" y="74">Coordinación</text><text x="200" y="284">Equipo A</text><text x="600" y="284">Equipo B</text></g></svg>',
      ),
    )
      .png({ compressionLevel: 0 })
      .toBuffer();
    const imageConfirmed = page.waitForResponse(
      (response) => response.url().includes("/api/media/confirm") && response.status() === 201,
    );
    const imageFilename = `e2e-organigrama-normativa-${Date.now().toString(36)}.png`;
    await page.getByRole("dialog").getByLabel(t("T-356")).setInputFiles({
      name: imageFilename,
      mimeType: "image/png",
      buffer: image,
    });
    await page
      .getByRole("dialog")
      .locator('button[type="submit"]', { hasText: t("T-356") })
      .click();
    await imageConfirmed;
    // router.refresh puede cerrar la respuesta del navegador; la confirmación ya persistió el medio.
    const [storedImage] = await getDb()
      .select({ id: mediaAsset.id })
      .from(mediaAsset)
      .where(eq(mediaAsset.originalFilename, imageFilename));
    expect(storedImage).toBeTruthy();
    const assetId = storedImage?.id ?? "";
    await processMedia(assetId);

    await page.goto("/admin/documentos");
    await page.getByRole("link", { name: t("T-1460"), exact: true }).click();
    await page.getByRole("dialog").getByLabel(tList("T-494")[0]).fill(tituloV2);
    await page.getByRole("dialog").getByLabel(tList("T-494")[1]).selectOption("ESTATUTOS");
    await page.getByRole("dialog").getByLabel(tList("T-494")[2]).fill("2026-05-08");
    await page.getByRole("dialog").getByLabel(tList("T-494")[3]).selectOption("MEMBERS");
    const confirmed = page.waitForResponse(
      (response) => response.url().includes("/api/documentos/confirm") && response.status() === 201,
    );
    await page.getByRole("dialog").getByLabel(tList("T-494")[4]).setInputFiles({
      name: "estatutos-v2-prueba.pdf",
      mimeType: "application/pdf",
      buffer: sampleNormativaV2Pdf(),
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: t("T-1460"), exact: true })
      .click();
    await confirmed;
    await expect(page).toHaveURL(/\/admin\/documentos\/[a-z0-9]+\?subido=1$/);
    const row = page.getByRole("region", { name: t("T-1467") });
    const id = new URL(page.url()).pathname.split("/").at(-1) ?? "";
    await row.getByLabel(t("T-1291")).setInputFiles({
      name: "estatutos-v2.json",
      mimeType: "application/json",
      buffer: Buffer.from(sampleNormativaV2Json(assetId)),
    });
    await row.locator('button[type="submit"]', { hasText: t("T-1291") }).click();
    await expect(page.getByText(t("T-1290", { n: 5 }))).toBeVisible();
    const before = await adminOnboarding();
    await page.goto(`/admin/documentos/${id}`);
    await expect(page).toHaveURL(`/admin/documentos/${id}`);
    await expect(page.getByText(t("T-1281", { articulos: 3, secciones: 2 }))).toBeVisible();
    await expect(page.getByRole("heading", { name: "Presentación", exact: true })).toBeVisible();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(5);
    await expect(
      page.getByRole("img", { name: "Organigrama de prueba: una coordinación y dos equipos." }),
    ).toBeVisible();
    await sinViolaciones(page);
    expect(await adminOnboarding()).toEqual(before);
    expect(
      (await page.request.get(`/api/documentos/${id}/pdf`, { maxRedirects: 0 })).status(),
    ).toBe(302);

    const member = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
    const memberPage = await member.newPage();
    try {
      await memberPage.goto(`/admin/documentos/${id}`);
      await expect(memberPage).toHaveURL(/\/app$/);
      await expect(memberPage.getByRole("heading", { name: tituloV2 })).toHaveCount(0);
      await memberPage.goto(`/app/normativa/${id}`);
      await expect(memberPage.getByRole("heading", { name: tituloV2 })).toHaveCount(0);
      expect(
        (await memberPage.request.get(`/api/documentos/${id}/pdf`, { maxRedirects: 0 })).status(),
      ).toBe(404);
      await memberPage.goto("/app/normativa?q=luciérnagas");
      await expect(memberPage.getByRole("link", { name: new RegExp(tituloV2) })).toHaveCount(0);
    } finally {
      await member.close();
    }
    const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      expect(
        (await anonymous.request.get(`/api/media/${assetId}`, { maxRedirects: 0 })).status(),
      ).toBe(403);
    } finally {
      await anonymous.close();
    }
    // Publica la misma versión que se acaba de revisar, con su checksum oculto.
    await page.getByRole("button", { name: t("T-342"), exact: true }).click();
    await expect(
      page.getByRole("main").getByText(tList("T-288")[1], { exact: true }),
    ).toBeVisible();
  });
});

test.describe("como miembro", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });
  test.beforeEach(() => prepareReaderDocument(titulo, 1));

  test("busca un artículo, lo abre y el PDF original redirige al bucket", async ({ page }) => {
    await page.goto("/app/normativa");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-389"));
    await expect(page.getByRole("link", { name: new RegExp(titulo) })).toBeVisible();
    await sinViolaciones(page);

    await page.getByLabel(t("T-390")).fill("asamblea");
    await page.getByRole("button", { name: t("T-250") }).click();
    const resultado = page.getByRole("link", {
      name: new RegExp(`${titulo} · ${t("T-397", { n: 3 })}`),
    });
    await expect(resultado).toBeVisible();
    await expect(page.locator("mark").first()).toContainText(/asamblea/i);
    await resultado.click();
    await page.waitForURL(/\/app\/normativa\/[a-z0-9]+#art-3$/);
    await expect(page.getByRole("heading", { name: copyPattern("T-397", { n: 3 }) })).toBeVisible();
    await expect(page.getByRole("heading", { name: t("T-398") })).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(titulo));
    await sinViolaciones(page);

    const href = await page.getByRole("link", { name: t("T-396") }).getAttribute("href");
    // El enlace nombra el lector donde está, para volver a él si el PDF pide sesión (ADR-113).
    expect(href).toMatch(
      /^\/api\/documentos\/[a-z0-9]+\/pdf\?pantalla=%2Fapp%2Fnormativa%2F[a-z0-9]+$/,
    );
    const respuesta = await page.request.get(href ?? "", { maxRedirects: 0 });
    expect(respuesta.status()).toBe(302);
    expect(respuesta.headers().location).toContain("documents/");
  });
});

test.describe("normativa completa como miembro", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });
  test.beforeEach(() => prepareReaderDocument(tituloV2, 2));

  test("busca secciones y celdas, conserva sus anclas y muestra el organigrama privado", async ({
    page,
  }) => {
    await page.goto("/app/normativa?q=luciérnagas");
    const section = page.getByRole("link", { name: `${tituloV2} · Anexo de prueba`, exact: true });
    await expect(section).toBeVisible();
    await expect(section).not.toContainText(copyPattern("T-397"));
    await section.click();
    await expect(page).toHaveURL(/#sec-anexo$/);
    await expect(page.getByRole("heading", { name: "Anexo de prueba", exact: true })).toBeVisible();
    const diagram = page.getByRole("img", {
      name: "Organigrama de prueba: una coordinación y dos equipos.",
    });
    await expect
      .poll(() => diagram.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.locator("#art-3").getByRole("heading")).toHaveText(
      `${t("T-397", { n: 3 })} · ${SAMPLE_LONG_ARTICLE_TITLE}`,
    );
    await expect(page.locator("#art-3").getByText(t("T-1280", { paginas: 2 }))).toBeVisible();
    await page.goto("/app/normativa?q=almuerzo");
    await page
      .getByRole("link", { name: new RegExp(`${tituloV2} · ${t("T-397", { n: 2 })}`) })
      .click();
    await expect(page).toHaveURL(/#art-2$/);
    await expect(page.getByRole("table").getByRole("columnheader")).toHaveText([
      "Turno",
      "Horario",
      "Apoyo",
    ]);
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(5);
  });

  for (const width of [375, 1440]) {
    for (const theme of ["light", "dark"] as const) {
      test(`lector completo accesible a ${width}px en tema ${theme}`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await page.addInitScript((saved) => localStorage.setItem("oe-tema", saved), theme);
        await page.goto("/app/normativa");
        await page.getByRole("link", { name: new RegExp(tituloV2) }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("#art-3").getByRole("heading")).toHaveText(
          `${t("T-397", { n: 3 })} · ${SAMPLE_LONG_ARTICLE_TITLE}`,
        );
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
        await sinViolaciones(page);
        const diagram = page.getByRole("img", {
          name: "Organigrama de prueba: una coordinación y dos equipos.",
        });
        await diagram.scrollIntoViewIfNeeded();
        await diagram.evaluate((image: HTMLImageElement) => image.decode());
        // Repinta las capas del organigrama y del cartel antes de la captura de página completa.
        for (const target of [diagram, page.getByRole("heading", { level: 1 })]) {
          await target.scrollIntoViewIfNeeded();
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
              ),
          );
        }
        const path = testInfo.outputPath(`normativa-${width}-${theme}.png`);
        await page.screenshot({ path, fullPage: true, animations: "disabled" });
        await testInfo.attach(`normativa-${width}-${theme}`, { path, contentType: "image/png" });
      });
    }
  }
});
