import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { occasion } from "@/modules/participation/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";

// Consola de la ocasión y modo anfitrión como ADMIN (ADR-035): QR, contador, alta manual y el
// anfitrión que registra a una persona sin sesión por nombre.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

let occasionId = "";

test.beforeEach(async () => {
  const db = getDb();
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("sin término");
  const now = Date.now();
  const [row] = await db
    .insert(occasion)
    .values({
      publicId: "e2econsol1",
      termId: current.id,
      title: "e2e-Consola de prueba",
      category: "TALK",
      points: 10,
      status: "OPEN",
      startsAt: new Date(now),
      checkInOpensAt: new Date(now - 3_600_000),
      checkInClosesAt: new Date(now + 3_600_000),
    })
    .returning({ id: occasion.id });
  if (!row) throw new Error("sin ocasión");
  occasionId = row.id;
  await closeDb();
});

test("la consola muestra el QR y el contador, y el modo anfitrión registra por nombre", async ({
  page,
}) => {
  await page.goto(`/admin/ocasiones/${occasionId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Consola · e2e-Consola de prueba",
  );
  await expect(
    page.getByRole("img", { name: "Escaneá para registrar tu asistencia" }),
  ).toBeVisible();
  await expect(page.locator("[data-contador='APPROVED']")).toHaveText("0");
  await expect(page.getByText(`Enlace: ${process.env.APP_URL}/a/e2econsol1`)).toBeVisible();
  await sinViolaciones(page);

  // Anfitrión: buscar por nombre y registrar a una persona sin sesión.
  await page.goto(`/admin/ocasiones/${occasionId}/anfitrion`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Modo anfitrión · e2e-Consola de prueba",
  );
  await expect(page.getByRole("button", { name: "Escanear carnet" })).toBeVisible();
  await page.getByRole("textbox", { name: "Buscá por nombre" }).fill("Miembro E2E");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Miembro E2E" })
    .getByRole("button", { name: "Registrar", exact: true })
    .click();
  await expect(page.getByText("Listo: Miembro E2E quedó registrado.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await sinViolaciones(page);

  // Otra vez: ya estaba registrado.
  await page.getByRole("textbox", { name: "Buscá por nombre" }).fill("Miembro E2E");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Miembro E2E" })
    .getByRole("button", { name: "Registrar", exact: true })
    .click();
  await expect(page.getByText("Miembro E2E ya estaba registrado.")).toBeVisible();

  // La consola refleja el registro y el código rotativo se activa desde ahí.
  await page.goto(`/admin/ocasiones/${occasionId}`);
  await expect(page.locator("[data-contador='APPROVED']")).toHaveText("1");
  await page.getByRole("button", { name: "Activar código rotativo" }).click();
  await expect(page.getByText(/Código [0-9]{6} · cambia en/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Rotar secreto" })).toBeVisible();
});
