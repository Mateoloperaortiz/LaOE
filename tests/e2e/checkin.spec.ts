import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { occasion } from "@/modules/participation/schema";
import { legacyAlias } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// El "listo cuando" del QR (10-verificacion): sin sesión → ingreso → vuelve al QR → puntos acreditados.
// Contexto sin sesión: la persona escanea el QR con el celular limpio.
test.use({ storageState: { cookies: [], origins: [] } });

const CODE = process.env.OTP_FIXED_CODE ?? "123456";
const PUBLIC_ID = "e2eqr00001";
const LEGACY_ID = "e2elegacy1";

test.beforeAll(async () => {
  const db = getDb();
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  if (!current) throw new Error("sin término");
  const now = Date.now();
  const [row] = await db
    .insert(occasion)
    .values({
      publicId: PUBLIC_ID,
      termId: current.id,
      title: "e2e-Integración por QR",
      category: "INTEGRATION",
      location: "Bloque 38",
      points: 20,
      status: "OPEN",
      startsAt: new Date(now),
      checkInOpensAt: new Date(now - 3_600_000),
      checkInClosesAt: new Date(now + 3_600_000),
    })
    .returning({ id: occasion.id });
  if (!row) throw new Error("sin ocasión");
  await db.delete(legacyAlias).where(eq(legacyAlias.path, `/asamblea/${LEGACY_ID}`));
  await db.insert(legacyAlias).values({ path: `/asamblea/${LEGACY_ID}`, targetId: row.id });
});

test.afterAll(async () => {
  const db = getDb();
  await db.delete(legacyAlias).where(eq(legacyAlias.path, `/asamblea/${LEGACY_ID}`));
  await closeDb();
});

test("sin sesión el QR lleva a entrar, vuelve solo y acredita los puntos una sola vez", async ({
  page,
}) => {
  await page.goto(`/a/${PUBLIC_ID}`);
  await expect(page).toHaveURL(/\/ingresar\?next=%2Fa%2Fe2eqr00001$/);
  await expect(
    page.getByText("Para registrarte primero entrá a Mi OE. Volvés aquí solo."),
  ).toBeVisible();
  await page.getByLabel("Correo @eafit.edu.co").fill(E2E_MEMBER_EMAIL);
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(new RegExp(`/a/${PUBLIC_ID}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e-Integración por QR");
  await expect(page.getByText("Da 20 GH Points")).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page).toHaveURL(new RegExp(`/a/${PUBLIC_ID}\\?r=puntos$`));
  await expect(page.getByText("¡Listo! Sumaste 20 GH Points.")).toBeVisible();
  await expect(page.getByText("¡OE OE OE!")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver mis GH Points" })).toBeVisible();
  await sinViolaciones(page);

  // El mismo enlace otra vez: ya registrado, sin segundo crédito.
  await page.goto(`/a/${PUBLIC_ID}`);
  await expect(page.getByText("Ya te habías registrado en esta actividad.")).toBeVisible();

  // El alias legado de una asamblea vieja redirige al check-in nuevo.
  await page.goto(`/asamblea/${LEGACY_ID}`);
  await expect(page).toHaveURL(new RegExp(`/a/${PUBLIC_ID}$`));

  // Un publicId que no existe explica qué hacer.
  await page.goto("/a/zzzzzzzzzz");
  await expect(page.getByText("Este enlace no corresponde a ninguna actividad.")).toBeVisible();
});
