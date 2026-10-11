import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedOccasion } from "../factories";
import { copyPattern } from "../helpers/copy";
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
  const row = await seedOccasion(current.id, {
    publicId: "e2econsol1",
    title: "e2e-Consola de prueba",
    category: "TALK",
    points: 10,
    status: "OPEN",
    startsAt: new Date(now),
    checkInOpensAt: new Date(now - 3_600_000),
    checkInClosesAt: new Date(now + 3_600_000),
  });
  occasionId = row.id;
  await closeDb();
});

test("la consola muestra el QR y el contador, y el modo anfitrión registra por nombre", async ({
  page,
}) => {
  await page.goto(`/admin/ocasiones/${occasionId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    t("T-584", { título: "e2e-Consola de prueba" }),
  );
  await expect(page.getByRole("img", { name: t("T-586") })).toBeVisible();
  await expect(page.locator("[data-contador='APPROVED']")).toHaveText("0");
  await expect(
    page.getByText(t("T-611", { url: `${process.env.APP_URL}/a/e2econsol1` })),
  ).toBeVisible();
  await sinViolaciones(page);

  // Anfitrión: buscar por nombre y registrar a una persona sin sesión.
  await page.goto(`/admin/ocasiones/${occasionId}/anfitrion`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    t("T-614", { título: "e2e-Consola de prueba" }),
  );
  await expect(page.getByRole("button", { name: tList("T-616")[0] })).toBeVisible();
  await page.getByRole("textbox", { name: t("T-599") }).fill("Miembro E2E");
  await page.getByRole("button", { name: t("T-250"), exact: true }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Miembro E2E" })
    .getByRole("button", { name: tList("T-598")[1], exact: true })
    .click();
  await expect(page.getByText(t("T-602", { nombre: "Miembro E2E" }))).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await sinViolaciones(page);

  // Otra vez: ya estaba registrado.
  await page.getByRole("textbox", { name: t("T-599") }).fill("Miembro E2E");
  await page.getByRole("button", { name: t("T-250"), exact: true }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "Miembro E2E" })
    .getByRole("button", { name: tList("T-598")[1], exact: true })
    .click();
  await expect(page.getByText(t("T-601", { nombre: "Miembro E2E" }))).toBeVisible();

  // La consola refleja el registro y el código rotativo se activa desde ahí.
  await page.goto(`/admin/ocasiones/${occasionId}`);
  await expect(page.locator("[data-contador='APPROVED']")).toHaveText("1");
  await page.getByRole("button", { name: tList("T-588")[0] }).click();
  await expect(page.getByText(copyPattern("T-587"))).toBeVisible();
  await expect(page.getByRole("button", { name: tList("T-588")[1] })).toBeVisible();
});

test("la consola avisa cuando el sondeo responde con error y deja de mostrar el QR y el código como vigentes", async ({
  page,
}) => {
  await page.goto(`/admin/ocasiones/${occasionId}`);
  await page.getByRole("button", { name: tList("T-588")[0] }).click();
  const code = page.getByText(copyPattern("T-587"));
  const qr = page.getByRole("img", { name: t("T-586") });
  // El enlace es lo que codifica el QR: lleva el código rotativo en claro (`?c=`).
  const link = page.getByText(copyPattern("T-611"));
  await expect(code).toBeVisible();
  await expect(qr).toBeVisible();
  await expect(link).toContainText("?c=");

  // La sesión del anfitrión vence a mitad del evento: cada sondeo responde 401.
  await page.route("**/api/ocasiones/*/live", (route) =>
    route.fulfill({ status: 401, json: { error: "sin sesión" } }),
  );
  const notice = page.getByText(t("T-3260"));
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(qr).toHaveCount(0);
  await expect(code).toHaveCount(0);
  // El código tampoco queda a la vista dentro del enlace.
  await expect(link).toHaveCount(0);
  await expect(page.getByText("?c=")).toHaveCount(0);
  await sinViolaciones(page);

  // La casa vuelve a responder: la consola se recupera sola en el siguiente sondeo.
  await page.unroute("**/api/ocasiones/*/live");
  await expect(qr).toBeVisible({ timeout: 15_000 });
  await expect(code).toBeVisible();
  await expect(link).toContainText("?c=");
  await expect(notice).toHaveCount(0);
});
