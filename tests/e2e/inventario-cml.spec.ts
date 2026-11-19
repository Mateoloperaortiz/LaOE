import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { createItemAs, readCatalog, setReservationGrantAs } from "@/modules/inventory";
import {
  inventoryIncident,
  inventoryItem,
  inventoryReservation,
  inventoryReservationLine,
} from "@/modules/inventory/schema";
import { listLogisticsSources } from "@/modules/people";
import { appointment, person, sanction } from "@/modules/people/schema";
import { workGroup, workGroupMembership } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedPerson,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { reserveFromApprovedList } from "../factories/inventory-loan";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// El CML en el modo de campo (ADR-150 reglas 5 a 8, ADR-191 regla 6): el miembro de pruebas es del CML
// solo durante la prueba. Entra a la Operación derecho al modo de campo, entrega una reserva leyendo la
// etiqueta (con la señal caída a mitad de camino) y recibe una devolución parcial con daño.

test.use({ storageState: "tests/e2e/.auth/member.json" });

const marca = randomBytes(3).toString("hex");
const limpiar = { appointments: [] as string[], memberships: [] as string[] };

test.afterEach(async () => {
  if (limpiar.memberships.length > 0)
    await getDb()
      .delete(workGroupMembership)
      .where(inArray(workGroupMembership.id, limpiar.memberships.splice(0)));
  if (limpiar.appointments.length > 0)
    await getDb()
      .delete(appointment)
      .where(inArray(appointment.id, limpiar.appointments.splice(0)));
  await closeDb();
});

test("el CML entrega con la señal caída y recibe una devolución parcial con daño", async ({
  page,
  context,
}) => {
  const [member] = await getDb().select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!member || !current) throw new Error("Faltan el miembro y el semestre sintéticos");
  const vp = await seedPerson(`e2e-vp-cml-${marca}@eafit.edu.co`, {
    firstName: "Vicepresidencia",
    lastName: `CML ${marca}`,
    source: "E2E",
  });
  await seedMembership(vp, current.id);
  limpiar.appointments.push(await seedAppointment(vp, current.id, "VP_ADMIN"));
  const director = await seedPerson(`e2e-director-cml-${marca}@eafit.edu.co`, {
    firstName: "Dirección",
    lastName: `Logística ${marca}`,
    source: "E2E",
  });
  await seedMembership(director, current.id);
  await getDb()
    .update(person)
    .set({ cardUid: `CC ${marca.slice(0, 2).toUpperCase()} 0D 0E` })
    .where(eq(person.id, director));
  const comite = await seedCommittee(`e2e-cml-${marca}`, `Comité CML ${marca}`);
  await seedCommitteeMembership(director, comite, current.id, "LOGISTICA");
  const source = (await listLogisticsSources(director)).find((row) => row.committeeId === comite);
  if (!source) throw new Error("Falta el cargo logístico sintético");
  await setReservationGrantAs(
    { personId: vp, ip: null },
    { sourceKind: source.kind, sourceId: source.id, enabled: true },
  );
  const created = await createItemAs(
    { personId: vp, ip: null },
    {
      name: `Cables CML ${marca}`,
      mode: "QUANTITY",
      total: 2,
      location: "Bodega sintética",
      box: "Caja E2E",
    },
  );
  const reserva = await reserveFromApprovedList(
    { personId: director, ip: null },
    {
      sourceKind: source.kind,
      sourceId: source.id,
      startsAt: new Date(Date.now() + 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      lines: [{ itemId: created.id, quantity: 2 }],
    },
  );
  // Ya pasó la hora de recoger.
  await getDb()
    .update(inventoryReservation)
    .set({ startsAt: new Date(Date.now() - 60_000) })
    .where(eq(inventoryReservation.id, reserva.id));
  const [existente] = await getDb()
    .select()
    .from(workGroup)
    .where(and(eq(workGroup.termId, current.id), eq(workGroup.code, "CML")));
  const cml =
    existente?.id ??
    (await seedWorkGroup(current.id, "CML sintético E2E", { kind: "WORK_COMMITTEE", code: "CML" }));
  limpiar.memberships.push(await seedWorkGroupMembership(cml, member.id));
  const item = (await readCatalog()).find((row) => row.id === created.id);
  if (!item) throw new Error("Falta la etiqueta del material sintético");
  await closeDb();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/campo$/);
  await expect(page.locator('a[href="/admin/personas"]')).toHaveCount(0);
  const [inventarioDeHoy, entregar] = tList("T-5070");
  const bloque = page.getByRole("region", { name: inventarioDeHoy });
  await bloque.getByRole("link", { name: entregar }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: t("T-4301") })).toBeVisible();

  await page.getByLabel(t("T-4369"), { exact: true }).fill(item.barcode.toLowerCase());
  await page.getByRole("button", { name: t("T-4370"), exact: true }).click();
  const ultima = page.getByRole("region", { name: t("T-5071") });
  await expect(ultima.getByText("Bodega sintética · Caja E2E")).toBeVisible();
  await sinViolaciones(page);

  // El borrador vive en el teléfono: sobrevive a una recarga.
  await page.reload();
  await expect(page.getByText(t("T-5072"))).toBeVisible();
  await expect(
    page.getByRole("region", { name: t("T-4374") }).getByText(item.barcode),
  ).toBeVisible();

  // Sin señal, la entrega queda pendiente y sale sola cuando vuelve.
  await context.setOffline(true);
  await page.getByRole("button", { name: t("T-4375"), exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(t("T-5073"));
  await context.setOffline(false);
  await expect(page.getByRole("main").getByRole("status")).toHaveText(t("T-4302"));
  const [entregada] = await getDb()
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.id, reserva.id));
  expect(entregada?.status).toBe("OUT");

  // Devolución parcial: uno vuelve, y con daño.
  await expect(page.getByRole("button", { name: t("T-4376"), exact: true })).toBeVisible();
  await page.getByLabel(t("T-4369"), { exact: true }).fill(item.barcode);
  await page.getByRole("button", { name: t("T-4370"), exact: true }).click();
  await page.getByLabel(t("T-4378"), { exact: true }).fill("1");
  await page.getByLabel(t("T-4379"), { exact: true }).fill("1");
  await page
    .getByRole("textbox", { name: t("T-4380"), exact: true })
    .fill("El cable volvió con el conector roto");
  await page.getByRole("button", { name: t("T-4376"), exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(t("T-4302"));
  const [linea] = await getDb()
    .select()
    .from(inventoryReservationLine)
    .where(eq(inventoryReservationLine.reservationId, reserva.id));
  expect(linea?.returned).toBe(1);
  const [danado] = await getDb().select().from(inventoryItem).where(eq(inventoryItem.id, item.id));
  expect(danado?.quarantined).toBe(1);
  const novedades = await getDb()
    .select()
    .from(inventoryIncident)
    .where(eq(inventoryIncident.reservationId, reserva.id));
  expect(novedades.length).toBeGreaterThan(0);
  const sanciones = await getDb().select().from(sanction).where(eq(sanction.personId, director));
  expect(sanciones).toHaveLength(0);
});
