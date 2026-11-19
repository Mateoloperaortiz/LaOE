import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { createItemAs, setReservationGrantAs } from "@/modules/inventory";
import { inventoryReservation } from "@/modules/inventory/schema";
import { listLogisticsSources } from "@/modules/people";
import { appointment, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedPerson,
} from "../factories";
import { reserveFromApprovedList } from "../factories/inventory-loan";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

// Reservar desde Mi OE (ADR-191 regla 5) y verlo en la Operación (regla 4): el miembro de pruebas es
// dirección logística de un comité sintético con el permiso de la VP; reserva con el carrito, «Hoy» le
// recuerda recoger y, como VP por un momento, ve la reserva en la línea de tiempo y en el Calendario.

test.use({ storageState: "tests/e2e/.auth/member.json" });

const marca = randomBytes(3).toString("hex");
const appointments: string[] = [];

async function preparar() {
  const [member] = await getDb().select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!member || !current) throw new Error("Faltan el miembro y el semestre sintéticos");
  await getDb().update(person).set({ cardUid: "AB CD EF 12" }).where(eq(person.id, member.id));
  const vp = await seedPerson(`e2e-vp-reservas-${marca}@eafit.edu.co`, {
    firstName: "Vicepresidencia",
    lastName: `Sintética ${marca}`,
    source: "E2E",
  });
  await seedMembership(vp, current.id);
  appointments.push(await seedAppointment(vp, current.id, "VP_ADMIN"));
  const comite = await seedCommittee(`e2e-reservas-${marca}`, `Comité de reservas ${marca}`);
  await seedCommitteeMembership(member.id, comite, current.id, "LOGISTICA");
  const source = (await listLogisticsSources(member.id)).find(
    (entry) => entry.committeeId === comite,
  );
  if (!source) throw new Error("Falta el cargo logístico sintético");
  await setReservationGrantAs(
    { personId: vp, ip: null },
    { sourceKind: source.kind, sourceId: source.id, enabled: true },
  );
  const material = `Micrófono sintético ${marca}`;
  const item = await createItemAs(
    { personId: vp, ip: null },
    { name: material, mode: "QUANTITY", total: 3, location: "Bodega sintética", box: "Caja R" },
  );
  return { member, current, source, material, itemId: item.id };
}

test.afterEach(async () => {
  if (appointments.length > 0)
    await getDb()
      .delete(appointment)
      .where(inArray(appointment.id, appointments.splice(0)));
  await closeDb();
});

test("la dirección logística reserva con el carrito y «Hoy» le recuerda recoger", async ({
  page,
  browser,
}) => {
  const preparado = await preparar();
  await closeDb();
  await page.goto("/app/inventario");
  await expect(page.getByRole("heading", { level: 1, name: t("T-4300") })).toBeVisible();
  const agregar = page.getByRole("button", {
    name: t("T-5068", { material: preparado.material }),
  });
  await agregar.click();
  await agregar.click();
  const [, varios] = tList("T-5069");
  await expect(page.getByText((varios ?? "").replace("{n}", "2"))).toBeVisible();
  await sinViolaciones(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const labels = tList("T-5189");
  await page.getByLabel(labels[6]).selectOption("OTHER");
  await page.getByLabel(labels[13]).fill("Acta logística de la jornada de prueba");
  await page.getByLabel(t("T-335"), { exact: true }).fill("Préstamo sintético del comité");
  await page.getByLabel(labels[12]).fill("Acta de planeación del comité");
  await page.getByRole("button", { name: labels[1], exact: true }).click();
  await expect(page.getByText(labels[17], { exact: true })).toBeVisible();
  const [admin] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_EMAIL));
  if (!admin) throw new Error("Falta la persona de Operación");
  appointments.push(await seedAppointment(admin.id, preparado.current.id, "VP_ADMIN"));
  const context = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
  try {
    const vp = await context.newPage();
    await vp.goto("/admin/inventario/prestamos");
    await vp
      .getByRole("article")
      .filter({ hasText: "Préstamo sintético del comité" })
      .getByRole("button", { name: tList("T-5086")[0], exact: true })
      .click();
    await expect(vp).toHaveURL(/guardado=1/);
  } finally {
    await context.close();
  }
  await page.reload();
  await page.getByRole("button", { name: labels[16], exact: true }).click();
  await expect(page.getByText(t("T-4302"), { exact: true })).toBeVisible();
  const misReservas = page.getByRole("region", { name: t("T-4405") });
  await expect(misReservas.getByText(`2 × ${preparado.material}`)).toBeVisible();
  const [reserva] = await getDb()
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.requesterId, preparado.member.id));
  expect(reserva?.status).toBe("CONFIRMED");

  // Una reserva que empieza en dos horas entra a «Te toca».
  await reserveFromApprovedList(
    { personId: preparado.member.id, ip: null },
    {
      sourceKind: preparado.source.kind,
      sourceId: preparado.source.id,
      startsAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 5 * 3_600_000).toISOString(),
      lines: [{ itemId: preparado.itemId, quantity: 1 }],
    },
  );
  await closeDb();
  await page.goto("/app");
  const [, teToca] = tList("T-4890");
  const recoger = (tList("T-4891")[7] ?? "").replace("{asunto}", preparado.source.label);
  await expect(
    page
      .getByRole("region", { name: teToca, exact: true })
      .getByRole("link", { name: recoger })
      .first(),
  ).toBeVisible();
});

test("la VP ve la reserva en la línea de tiempo y en el Calendario", async ({ page }) => {
  const preparado = await preparar();
  appointments.push(await seedAppointment(preparado.member.id, preparado.current.id, "VP_ADMIN"));
  const inicio = new Date(Date.now() + 26 * 3_600_000);
  await reserveFromApprovedList(
    { personId: preparado.member.id, ip: null },
    {
      sourceKind: preparado.source.kind,
      sourceId: preparado.source.id,
      startsAt: inicio.toISOString(),
      endsAt: new Date(inicio.getTime() + 3 * 3_600_000).toISOString(),
      lines: [{ itemId: preparado.itemId, quantity: 1 }],
    },
  );
  await closeDb();

  await page.goto("/admin/inventario/prestamos");
  const [lineaDeTiempo] = tList("T-5065");
  const linea = page.getByRole("region", { name: lineaDeTiempo });
  const barra = linea.getByRole("link", { name: new RegExp(`^${preparado.source.label}`) });
  await expect(barra).toBeVisible();
  await expect(linea.getByText(preparado.material)).toBeVisible();
  await sinViolaciones(page);
  await barra.click();
  await expect(page).toHaveURL(/reserva=/);
  await expect(page.getByRole("heading", { name: preparado.source.label })).toBeVisible();

  await page.goto("/admin/calendario?capas=RESERVATION&vista=mes");
  await expect(
    page.getByRole("link", { name: new RegExp(preparado.source.label) }).first(),
  ).toBeVisible();
});
