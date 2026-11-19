import { expect } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { tag } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { seedTag } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// Patrones de escritorio de la Operación (ADR-167): el mapa de atajos y G con la letra del espacio,
// «Crear» y sus acciones en ⌘K, la estrella de Favoritos, las columnas y las fichas de la tabla, la
// edición en línea y la hoja de impresión.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const [mapTitle] = tList("T-4895");
const [fijar, soltar, favoritos] = tList("T-4898");
const [etiquetas, etiqueta] = tList("T-422");
const [nombreEtiqueta, colorEtiqueta] = tList("T-465");
const [columnas, aplicar] = tList("T-4905");
const [editar, guardar] = tList("T-4903");

test.afterAll(async () => {
  await getDb().delete(tag).where(like(tag.name, "e2e-Escritorio%"));
  await closeDb();
});

test("? abre el mapa de atajos y G con P lleva a Personas", async ({ page }) => {
  await page.goto("/admin/mesa");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.locator("body").press("?");
  const map = page.getByRole("dialog", { name: mapTitle, exact: true });
  await expect(map).toBeVisible();
  await sinViolaciones(page);
  await page.keyboard.press("Escape");
  await expect(map).toBeHidden();
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await expect(page).toHaveURL(/\/admin\/personas/);
});

test("«Crear» abre el alta de una etiqueta y ⌘K ofrece la misma acción", async ({ page }) => {
  await page.goto("/admin/mesa");
  await page.locator(".admin-create > summary").click();
  await page
    .locator(".admin-create-menu")
    .getByRole("link", { name: etiqueta, exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/etiquetas\?nuevo=1/);
  const editor = page.getByRole("dialog");
  await editor.getByRole("button", { name: t("T-291"), exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/etiquetas$/);
  await expect(editor).toBeHidden();

  await page.keyboard.press("ControlOrMeta+k");
  const paleta = page.getByRole("dialog", { name: t("T-299"), exact: true });
  await expect(paleta).toBeVisible();
  await paleta.getByRole("searchbox", { name: t("T-264"), exact: true }).fill("crear: etiq");
  const action = paleta.getByRole("link", {
    name: new RegExp(t("T-4899", { cosa: etiqueta ?? "" })),
  });
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute("href", "/admin/etiquetas?nuevo=1");
});

test("la estrella fija la pantalla en Favoritos y la quita", async ({ page }) => {
  await page.goto("/admin/etiquetas");
  await page.getByRole("button", { name: fijar, exact: true }).click();
  const lista = page.locator(".admin-sidebar [data-lista='favoritos']");
  await expect(lista.getByText(favoritos ?? "", { exact: true })).toBeVisible();
  await expect(lista.getByRole("link", { name: etiquetas, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: soltar, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: soltar, exact: true }).click();
  await expect(lista).toBeHidden();
});

test("Favoritos y Recientes conservan el nombre cuando el título del documento llega tarde", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (location.pathname === "/admin/etiquetas") {
      // Reproduce la llegada del encabezado antes que la metadata de Next.
      Object.defineProperty(document, "title", { get: () => "" });
    }
  });
  await page.goto("/admin/etiquetas");
  const heading = page.getByRole("heading", { level: 1, name: etiquetas });
  await expect(heading).toHaveText(/\S/);
  const name = await heading.innerText();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("oe.operacion.recientes")))
    .toContain("/admin/etiquetas");
  await page.getByRole("button", { name: fijar, exact: true }).click();
  const pinned = page.locator(".admin-sidebar [data-lista='favoritos'] a[href='/admin/etiquetas']");
  await expect.soft(pinned).toHaveAccessibleName(name);
  await page.getByRole("button", { name: soltar, exact: true }).click();
  await page.goto("/admin/mesa");
  const recent = page.locator(".admin-sidebar [data-lista='recientes'] a[href='/admin/etiquetas']");
  await expect(recent).toHaveAccessibleName(name);
  await sinViolaciones(page);
});

test("las columnas elegidas viajan en la dirección y la búsqueda es una ficha", async ({
  page,
}) => {
  await seedTag("e2e-Escritorio columnas");
  await page.goto("/admin/etiquetas?q=e2e-Escritorio");
  const tabla = page.locator(".admin-resource-table");
  await expect(tabla.getByRole("columnheader", { name: colorEtiqueta, exact: true })).toBeVisible();
  await page.locator(".admin-columns > summary").click();
  await page.getByRole("checkbox", { name: colorEtiqueta, exact: true }).uncheck();
  await page.getByRole("button", { name: aplicar, exact: true }).click();
  await expect(page).toHaveURL(/columnas=name/);
  await expect(tabla.getByRole("columnheader", { name: colorEtiqueta, exact: true })).toHaveCount(
    0,
  );
  await expect(
    tabla.getByRole("columnheader", { name: nombreEtiqueta, exact: true }),
  ).toBeVisible();

  const ficha = page.getByRole("link", { name: /^Quitar filtro: Búsqueda/ });
  await expect(ficha).toBeVisible();
  await ficha.click();
  await expect(page).not.toHaveURL(/q=/);
  // Quitar la búsqueda conserva las columnas elegidas.
  await expect(page).toHaveURL(/columnas=name/);
  await expect(page.locator(".admin-columns > summary")).toHaveText(columnas ?? "");
});

test("una etiqueta se renombra en la celda, con Enter, y queda guardada", async ({ page }) => {
  const id = await seedTag("e2e-Escritorio celda");
  await page.goto("/admin/etiquetas?q=e2e-Escritorio celda");
  const tabla = page.locator(".admin-resource-table");
  const fila = page.locator("tr[data-row]").filter({ hasText: "e2e-Escritorio celda" });
  await fila.hover();
  await fila.getByRole("button", { name: `${editar}: ${nombreEtiqueta}` }).click();
  // En edición la celda ya no muestra el texto: el campo se busca en la tabla.
  const campo = tabla.getByRole("textbox", { name: nombreEtiqueta, exact: true });
  await expect(campo).toBeFocused();
  await campo.fill("e2e-Escritorio celda nueva");
  await campo.press("Enter");
  await expect(tabla.getByRole("button", { name: guardar, exact: true })).toBeHidden();
  await expect
    .poll(async () => {
      const [row] = await getDb().select({ name: tag.name }).from(tag).where(eq(tag.id, id));
      return row?.name;
    })
    .toBe("e2e-Escritorio celda nueva");
  await page.reload();
  await expect(
    page.locator("tr[data-row]").filter({ hasText: "e2e-Escritorio celda nueva" }),
  ).toBeVisible();
});

test("la hoja de impresión deja el contenido sin el marco de la Operación", async ({ page }) => {
  await page.goto("/admin/etiquetas");
  await expect(page.locator(".admin-sidebar")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".admin-sidebar")).toBeHidden();
  await expect(page.locator(".admin-topbar")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
