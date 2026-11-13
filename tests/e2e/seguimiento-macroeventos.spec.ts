import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { event } from "@/modules/events/schema";
import { appointment, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import { seedAppointment, seedEdition, seedEvent, seedMacroeventDirector } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// El seguimiento de los macroeventos (ADR-197 regla 5): sin el empalme de cada cargo de la mesa, la
// Presidencia no cierra el seguimiento de la edición; la dirección entrega el suyo desde «Tu empalme» y
// entonces sí se cierra. El miembro de pruebas es Presidencia y Dirección General solo en la prueba.

const marca = randomBytes(3).toString("hex");
const cargos: string[] = [];
const eventos: string[] = [];

test.afterEach(async () => {
  const db = getDb();
  if (cargos.length > 0)
    await db.delete(appointment).where(inArray(appointment.id, cargos.splice(0)));
  if (eventos.length > 0) await db.delete(event).where(inArray(event.id, eventos.splice(0)));
  await closeDb();
});

test.describe("la Presidencia y la mesa de un macroevento", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("el seguimiento no se cierra hasta que la dirección entrega su empalme", async ({
    page,
  }) => {
    const db = getDb();
    const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
    const [member] = await db.select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
    if (!current || !member) throw new Error("Faltan el semestre y el miembro sintéticos");
    cargos.push(await seedAppointment(member.id, current.id, "PRESIDENT"));
    const eventId = await seedEvent(`e2e-macro-${marca}`, `Macroevento ${marca}`);
    eventos.push(eventId);
    const edicion = await seedEdition(eventId, `e2e-edicion-${marca}`, "Edición de prueba", {
      startsAt: new Date(Date.now() - 20 * 86_400_000),
      endsAt: new Date(Date.now() - 18 * 86_400_000),
    });
    cargos.push(await seedMacroeventDirector(member.id, current.id, edicion, "GENERAL"));
    await closeDb();

    const [titulo] = tList("T-5135");
    const [, , , , , , , , cerrar] = tList("T-5137");
    await page.goto("/admin/cap/ediciones");
    await expect(page.getByRole("heading", { level: 1, name: titulo ?? "" })).toBeVisible();
    await page.getByRole("link", { name: `Macroevento ${marca} · Edición de prueba` }).click();
    await page.getByRole("button", { name: cerrar ?? "", exact: true }).click();
    const [, , falta] = tList("T-5136");
    await expect(
      page.getByText((falta ?? "").replace("{cargos}", "Dirección General"), { exact: true }),
    ).toBeVisible();
    await sinViolaciones(page);

    const [, , , entregar, entregado] = tList("T-5139");
    const [primera] = tList("T-5128");
    await page.goto("/app/yo/empalme");
    await page.getByLabel(primera ?? "", { exact: true }).fill("Empezar la convocatoria antes");
    await page.getByRole("button", { name: entregar ?? "", exact: true }).click();
    await expect(page.getByText(entregado ?? "", { exact: true })).toBeVisible();
    await sinViolaciones(page);

    await page.goto(`/admin/cap/ediciones/${edicion}`);
    await page.getByRole("button", { name: cerrar ?? "", exact: true }).click();
    const [, , , , , , , , , cerradoEl] = tList("T-5137");
    await expect(
      page.getByText(new RegExp((cerradoEl ?? "").split("{fecha}")[0] ?? "")),
    ).toBeVisible();
  });
});
