import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import QRCode from "qrcode";
import { closeDb, getDb } from "@/db/client";
import { event } from "@/modules/events/schema";
import { form } from "@/modules/forms/schema";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { seedEdition, seedEvent, seedForm } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

// La entrada externa (ADR-187): alguien de afuera se inscribe a una edición por el formulario propio,
// recibe su entrada con el QR, y la puerta la lee desde una foto con la sesión de ADMIN.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const marca = Math.random().toString(36).slice(2, 8);
const slug = `e2e-entrada-${marca}`;
const correo = `e2e-visitante-${marca}@example.com`;
const [verEntrada] = tList("T-5032");
const [tituloEntrada] = tList("T-5024");
let ids: { eventId: string; editionId: string };

test.beforeEach(async () => {
  const eventId = await seedEvent(`e2e-evento-${marca}`, `e2e-Evento ${marca}`, {
    publicationStatus: "PUBLISHED",
  });
  const editionId = await seedEdition(eventId, "2026-2", "2026-2", {
    startsAt: new Date(Date.now() + 10 * 86_400_000),
    publicationStatus: "PUBLISHED",
  });
  await seedForm(slug, {
    fields: [],
    consentRequired: false,
    actions: { createPerson: true, editionId },
  });
  ids = { eventId, editionId };
});

test.afterEach(async () => {
  // Primero lo que dejó la inscripción en el outbox: sus efectos todavía nombran a la persona.
  await drenarOutbox();
  const db = getDb();
  await db.delete(form).where(eq(form.slug, slug));
  await db.delete(event).where(eq(event.id, ids.eventId));
  await db.delete(person).where(like(person.email, correo));
  await closeDb();
});

test("alguien de afuera se inscribe, recibe su entrada y la puerta la lee una vez", async ({
  page,
  browser,
}) => {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const visitante = await contexto.newPage();
  const [nombre, apellido, email] = tList("T-851");
  await visitante.goto(`/f/${slug}`);
  await visitante.getByLabel(nombre ?? "").fill("Visitante");
  await visitante.getByLabel(apellido ?? "").fill(`Externa ${marca}`);
  await visitante.getByLabel(email ?? "").fill(correo);
  await visitante.getByRole("button", { name: t("T-852") }).click();
  await expect(visitante.getByText(t("T-859"))).toBeVisible();
  await visitante.getByRole("link", { name: verEntrada }).click();
  await expect(visitante).toHaveURL(/\/entrada\/[A-Za-z0-9_-]{24}$/);
  await expect(visitante.getByRole("heading", { level: 1 })).toHaveText(tituloEntrada ?? "");
  await expect(visitante.getByRole("img", { name: t("T-5031") })).toBeVisible();
  await sinViolaciones(visitante);
  const enlace = visitante.url();
  await contexto.close();

  // La puerta lee el QR desde una foto, como cuando la cámara no abre.
  const foto = join(mkdtempSync(join(tmpdir(), "entrada-")), "entrada.png");
  await QRCode.toFile(foto, enlace, { width: 480, margin: 2 });
  await page.goto(`/admin/eventos/${ids.eventId}/ediciones/${ids.editionId}/entrada`);
  await expect(page.getByText(t("T-5029", { adentro: 0, total: 1 }))).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(foto);
  await expect(page.getByText(t("T-5028", { nombre: `Visitante Externa ${marca}` }))).toBeVisible();
  await page.reload();
  await expect(page.getByText(t("T-5029", { adentro: 1, total: 1 }))).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(foto);
  await expect(page.getByText(new RegExp(`Visitante Externa ${marca} ya entró`))).toBeVisible();
});
