import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { checkIn, occasion } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { legacyAlias } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { seedAlias, seedCheckIn, seedOccasion } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

// El "listo cuando" del QR (10-verificacion): sin sesión → ingreso → vuelve al QR → puntos acreditados.
// Contexto sin sesión: la persona escanea el QR con el celular limpio.
test.use({ storageState: { cookies: [], origins: [] } });

const CODE = process.env.OTP_FIXED_CODE ?? "123456";
const PUBLIC_ID = "e2eqr00001";
const LEGACY_ID = "e2elegacy1";

test.beforeEach(async () => {
  const db = getDb();
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("sin término");
  const now = Date.now();
  const row = await seedOccasion(current.id, {
    publicId: PUBLIC_ID,
    title: "e2e-Integración por QR",
    category: "INTEGRATION",
    location: "Bloque 38",
    points: 20,
    status: "OPEN",
    startsAt: new Date(now),
    checkInOpensAt: new Date(now - 3_600_000),
    checkInClosesAt: new Date(now + 3_600_000),
  });
  await db.delete(legacyAlias).where(eq(legacyAlias.path, `/asamblea/${LEGACY_ID}`));
  await seedAlias(`/asamblea/${LEGACY_ID}`, row.id);
});

test.afterEach(async () => {
  await drenarOutbox();
  const db = getDb();
  await db.delete(legacyAlias).where(eq(legacyAlias.path, `/asamblea/${LEGACY_ID}`));
  await closeDb();
});

test("sin sesión el QR lleva a entrar, vuelve solo y acredita los puntos una sola vez", async ({
  page,
}) => {
  await page.goto(`/a/${PUBLIC_ID}`);
  await expect(page).toHaveURL(/\/ingresar\?next=%2Fa%2Fe2eqr00001$/);
  await expect(page.getByText(t("T-100"))).toBeVisible();
  await page.getByRole("link", { name: t("T-2099") }).click();
  await expect(page).toHaveURL(/\/ingresar\/codigo\?next=%2Fa%2Fe2eqr00001$/);
  await page.getByLabel(t("T-042")).fill(E2E_MEMBER_EMAIL);
  await page.getByRole("button", { name: t("T-043") }).click();
  await page.getByLabel(t("T-238")).fill(CODE);
  await page.getByRole("button", { name: t("T-046") }).click();
  await expect(page).toHaveURL(new RegExp(`/a/${PUBLIC_ID}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e-Integración por QR");
  await expect(page.getByText(t("T-529", { n: 20 }))).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("button", { name: t("T-091") }).click();
  await expect(page).toHaveURL(new RegExp(`/a/${PUBLIC_ID}\\?r=puntos$`));
  await expect(page.getByText(t("T-092", { n: 20 }).replace(t("T-037"), "").trim())).toBeVisible();
  await expect(page.getByText(t("T-037"))).toBeVisible();
  await expect(page.getByRole("link", { name: t("T-531") })).toBeVisible();
  await sinViolaciones(page);

  // El mismo enlace otra vez: ya registrado, sin segundo crédito.
  await page.goto(`/a/${PUBLIC_ID}`);
  await expect(page.getByText(t("T-095"))).toBeVisible();

  // El alias legado de una asamblea vieja redirige al check-in nuevo.
  await page.goto(`/asamblea/${LEGACY_ID}`);
  await expect(page).toHaveURL(new RegExp(`/a/${PUBLIC_ID}$`));

  // Un publicId que no existe explica qué hacer.
  await page.goto("/a/zzzzzzzzzz");
  await expect(page.getByText(t("T-527"))).toBeVisible();
});

// DT-289, ADR-120 regla 6: el `r` de la dirección elige el texto de una asistencia que existe y
// que dice lo mismo. Escrito a mano no inventa un registro ni le cambia el estado al que hay.
test.describe("la dirección de un resultado, abierta a mano", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  const exito = t("T-092", { n: 20 }).replace(t("T-037"), "").trim();

  test("sin asistencia no pinta el sello ni el éxito: ofrece registrarse", async ({ page }) => {
    for (const resultado of ["puntos", "registrado", "pendiente"]) {
      await page.goto(`/a/${PUBLIC_ID}?r=${resultado}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e-Integración por QR");
      await expect(page.getByText(t("T-037")), `sello con r=${resultado}`).toHaveCount(0);
      await expect(page.getByText(exito), `éxito con r=${resultado}`).toHaveCount(0);
      await expect(page.locator("[data-resultado]"), `mensaje con r=${resultado}`).toHaveCount(0);
      await expect(page.getByRole("link", { name: t("T-531") })).toHaveCount(0);
      await expect(page.getByRole("button", { name: t("T-091") })).toBeVisible();
    }
  });

  test("con una asistencia pendiente o rechazada dice su estado, no el de la dirección", async ({
    page,
  }) => {
    const db = getDb();
    const [who] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    const [row] = await db
      .select({ id: occasion.id })
      .from(occasion)
      .where(eq(occasion.publicId, PUBLIC_ID));
    if (!who || !row) throw new Error("sin miembro o sin ocasión");
    const attendance = {
      id: await seedCheckIn(row.id, who.id, "PENDING", { source: "SELF_QR" }),
    };

    await page.goto(`/a/${PUBLIC_ID}?r=puntos`);
    await expect(page.locator('[data-resultado="estado"]')).toHaveText(t("T-094"));
    await expect(page.getByText(t("T-037"))).toHaveCount(0);
    await expect(page.getByText(exito)).toHaveCount(0);

    // La pendiente que acaba de nacer conserva su pantalla: el texto y el camino a los puntos.
    await page.goto(`/a/${PUBLIC_ID}?r=pendiente`);
    await expect(page.locator('[data-resultado="pendiente"]')).toHaveText(t("T-094"));
    await expect(page.getByRole("link", { name: t("T-531") })).toBeVisible();

    await db.update(checkIn).set({ status: "REJECTED" }).where(eq(checkIn.id, attendance.id));
    for (const resultado of ["puntos", "registrado", "pendiente"]) {
      await page.goto(`/a/${PUBLIC_ID}?r=${resultado}`);
      await expect(page.locator('[data-resultado="estado"]')).toHaveText(t("T-532"));
      await expect(page.getByText(t("T-037"))).toHaveCount(0);
      await expect(page.getByRole("link", { name: t("T-531") })).toHaveCount(0);
    }
  });
});
