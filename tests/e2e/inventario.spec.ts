import { expect, type Page, type TestInfo } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { createItemAs, readCatalog, reserveAs, setReservationGrantAs } from "@/modules/inventory";
import {
  inventoryIncident,
  inventoryItem,
  inventoryReservation,
  inventoryReservationLine,
} from "@/modules/inventory/schema";
import { listLogisticsSources } from "@/modules/people";
import { person, sanction } from "@/modules/people/schema";
import { workGroup } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { utcToBogotaInput } from "@/shared/lib/dates";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedPerson,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM, withinTermInput } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/member.json" });

async function captureInventory(page: Page, testInfo: TestInfo, surface: string): Promise<void> {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        localStorage.setItem("oe-tema", value);
        document.documentElement.setAttribute("data-theme", value);
      }, theme);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const path = testInfo.outputPath(`${surface}-${width}-${theme}.png`);
      await page.screenshot({ path, fullPage: true, animations: "disabled" });
      await testInfo.attach(`${surface}-${width}-${theme}`, { path, contentType: "image/png" });
    }
  }
}

async function identities() {
  const [member] = await getDb().select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!member || !current) throw new Error("Faltan identidades sintéticas del inventario");
  return { member, current };
}

async function prepare(borrowerIsMember: boolean) {
  const { member, current } = await identities();
  const vp = await seedPerson("e2e-vp-inventario@eafit.edu.co", {
    firstName: "Vicepresidencia",
    lastName: "Sintética",
    source: "E2E",
  });
  await seedMembership(vp, current.id);
  await seedAppointment(vp, current.id, "VP_ADMIN");
  const borrowerId = borrowerIsMember
    ? member.id
    : await seedPerson("e2e-logistica-inventario@eafit.edu.co", {
        firstName: "Logística",
        lastName: "Sintética",
        source: "E2E",
      });
  if (!borrowerIsMember) await seedMembership(borrowerId, current.id);
  await getDb().update(person).set({ cardUid: "AA BB CC 19" }).where(eq(person.id, borrowerId));
  const committeeId = await seedCommittee("e2e-inventario", "Comité sintético del inventario");
  await seedCommitteeMembership(borrowerId, committeeId, current.id, "LOGISTICA");
  const source = (await listLogisticsSources(borrowerId)).find(
    (entry) => entry.committeeId === committeeId,
  );
  if (!source) throw new Error("Falta el cargo logístico sintético");
  await setReservationGrantAs(
    { personId: vp, ip: null },
    { sourceKind: source.kind, sourceId: source.id, enabled: true },
  );
  const created = await createItemAs(
    { personId: vp, ip: null },
    {
      name: "Cables sintéticos E2E",
      mode: "QUANTITY",
      total: 2,
      location: "Bodega sintética",
      box: "Caja E2E",
    },
  );
  return { member, current, vp, borrowerId, committeeId, source, itemId: created.id };
}

test("un miembro consulta el inventario y fechas inválidas sin recibir facultades administrativas", async ({
  page,
}) => {
  await page.goto("/app/inventario");
  await expect(page.getByRole("heading", { level: 1, name: t("T-4300") })).toBeVisible();
  await expect(page.getByRole("button", { name: t("T-4314") })).toHaveCount(0);
  await expect(page.getByRole("link", { name: t("T-4303") })).toHaveCount(0);
  await page.goto("/admin/inventario");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/cml");
  await expect(page).toHaveURL(/\/app\/inventario$/);
  await page.goto("/app/inventario?desde=2026-99-99T08:00&hasta=2026-99-99T18:00");
  await expect(page.locator(".inventory").getByRole("alert")).toHaveText(t("T-4408"));
  await sinViolaciones(page);
});

test("la VP sin ADMIN gestiona materiales y etiquetas sin acceder a Personas", async ({
  page,
}, testInfo) => {
  const { member, current } = await identities();
  await seedAppointment(member.id, current.id, "VP_ADMIN");
  await closeDb();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/inventario$/);
  await expect(page.locator('.admin-sidebar a[href="/admin/personas"]')).toHaveCount(0);
  const create = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: t("T-4338"), exact: true }) });
  if (!(await create.getByLabel(t("T-4334"), { exact: true }).isVisible())) {
    await page.getByText(t("T-4333"), { exact: true }).click();
  }
  await create.getByLabel(t("T-4334"), { exact: true }).fill("Parlante sintético E2E");
  await create.getByLabel(t("T-4310"), { exact: true }).fill("2");
  await create.getByLabel(t("T-4311"), { exact: true }).fill("Bodega E2E");
  await create.getByLabel(t("T-4312"), { exact: true }).fill("Caja E2E");
  await create.getByRole("button", { name: t("T-4338"), exact: true }).click();
  await expect(page.getByRole("heading", { name: "Parlante sintético E2E" })).toBeVisible();
  await sinViolaciones(page);
  await captureInventory(page, testInfo, "inventario-vp");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const [item] = await getDb()
    .select()
    .from(inventoryItem)
    .where(eq(inventoryItem.name, "Parlante sintético E2E"));
  if (!item) throw new Error("No se guardó el material desde el formulario");
  await page.goto(`/admin/inventario/etiquetas?material=${item.id}`);
  await expect(page.getByRole("img")).toHaveCount(2);
  const src = await page.getByRole("img").first().getAttribute("src");
  if (!src) throw new Error("Falta la etiqueta");
  const label = await page.request.get(src);
  expect(label.status()).toBe(200);
  expect(label.headers()["content-type"]).toContain("image/svg+xml");
  expect(await label.text()).toContain("<svg");
  await page.goto("/admin/personas");
  await expect(page).toHaveURL(/\/app$/);
});

test("Logística reserva y conserva su historial al perder el permiso", async ({
  page,
}, testInfo) => {
  const prepared = await prepare(true);
  await closeDb();
  await page.goto(`/app/inventario?desde=${withinTermInput(8)}&hasta=${withinTermInput(18)}`);
  await captureInventory(page, testInfo, "inventario-miembro");
  await sinViolaciones(page);
  await page.getByLabel(`${t("T-4313")} · Cables sintéticos E2E`, { exact: true }).fill("1");
  await page.getByRole("button", { name: t("T-4314"), exact: true }).click();
  await expect(page.getByText(t("T-4302"), { exact: true })).toBeVisible();
  const [reservation] = await getDb()
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.requesterId, prepared.member.id));
  expect(reservation?.status).toBe("CONFIRMED");
  await setReservationGrantAs(
    { personId: prepared.vp, ip: null },
    { sourceKind: prepared.source.kind, sourceId: prepared.source.id, enabled: false },
  );
  await closeDb();
  await page.reload();
  await expect(page.getByRole("button", { name: t("T-4314"), exact: true })).toHaveCount(0);
  await expect(page.getByText(t("T-4327"), { exact: true })).toBeVisible();
  const row = page.locator(".inventory-reservation").filter({ hasText: "Cables sintéticos E2E" });
  await row.getByText(t("T-4325"), { exact: true }).first().click();
  await row.getByLabel(t("T-4326"), { exact: true }).fill("Cambio sintético del evento");
  await row.getByRole("button", { name: t("T-4325"), exact: true }).click();
  await expect(page.getByText(t("T-4330"), { exact: true })).toBeVisible();
  const [cancelled] = await getDb()
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.id, reservation?.id ?? ""));
  expect(cancelled?.status).toBe("CANCELLED");
});

test("el CML revisa códigos antes de entregar y recibe un retorno parcial con daño sin crear un LA", async ({
  page,
}, testInfo) => {
  const prepared = await prepare(false);
  const [existingCml] = await getDb()
    .select()
    .from(workGroup)
    .where(and(eq(workGroup.termId, prepared.current.id), eq(workGroup.code, "CML")));
  const groupId =
    existingCml?.id ??
    (await seedWorkGroup(prepared.current.id, "CML sintético E2E", {
      kind: "WORK_COMMITTEE",
      code: "CML",
    }));
  await seedWorkGroupMembership(groupId, prepared.member.id);
  const reservation = await reserveAs(
    { personId: prepared.borrowerId, ip: null },
    {
      sourceKind: prepared.source.kind,
      sourceId: prepared.source.id,
      startsAt: new Date(Date.now() + 60_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      lines: [{ itemId: prepared.itemId, quantity: 2 }],
    },
  );
  // Simula que pasó el instante de recogida; la reserva conserva los hechos que dejó el comando.
  await getDb()
    .update(inventoryReservation)
    .set({ startsAt: new Date(Date.now() - 60_000) })
    .where(eq(inventoryReservation.id, reservation.id));
  const item = (await readCatalog()).find((entry) => entry.id === prepared.itemId);
  if (!item) throw new Error("Falta la etiqueta del material sintético");
  await closeDb();
  await page.goto("/app/cml");
  await expect(page.getByRole("heading", { level: 1, name: t("T-4301") })).toBeVisible();
  await page.getByRole("combobox", { name: t("T-4382"), exact: true }).selectOption(reservation.id);
  await page.getByLabel(t("T-4369"), { exact: true }).fill(item.barcode);
  await page.getByRole("button", { name: t("T-4370"), exact: true }).click();
  await expect(page.getByText("Bodega sintética · Caja E2E", { exact: true })).toBeVisible();
  await captureInventory(page, testInfo, "inventario-cml");
  await sinViolaciones(page);
  const [before] = await getDb()
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.id, reservation.id));
  expect(before?.status).toBe("CONFIRMED");
  await page.getByRole("button", { name: t("T-4375"), exact: true }).click();
  await expect(page.getByRole("button", { name: t("T-4376"), exact: true })).toBeVisible();
  await page.getByLabel(t("T-4369"), { exact: true }).fill(item.barcode);
  await page.getByRole("button", { name: t("T-4370"), exact: true }).click();
  await page.getByLabel(t("T-4378"), { exact: true }).fill("1");
  await page.getByLabel(t("T-4379"), { exact: true }).fill("1");
  const scanner = page
    .locator(".inventory-panel")
    .filter({ has: page.getByRole("button", { name: t("T-4376"), exact: true }) });
  await page.getByRole("button", { name: t("T-4376"), exact: true }).click();
  await expect(scanner.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel(t("T-4378"), { exact: true })).toHaveValue("1");
  await expect(page.getByLabel(t("T-4379"), { exact: true })).toHaveValue("1");
  await scanner
    .getByLabel(t("T-4380"), { exact: true })
    .fill("El cable sintético regresó con daño");
  await page.getByRole("button", { name: t("T-4376"), exact: true }).click();
  await expect(page.getByRole("status")).toContainText(t("T-4302"));
  const [line] = await getDb()
    .select()
    .from(inventoryReservationLine)
    .where(eq(inventoryReservationLine.reservationId, reservation.id));
  expect(line?.returned).toBe(1);
  const [damagedItem] = await getDb()
    .select()
    .from(inventoryItem)
    .where(eq(inventoryItem.id, item.id));
  expect(damagedItem?.quarantined).toBe(1);
  const incidents = await getDb()
    .select()
    .from(inventoryIncident)
    .where(eq(inventoryIncident.reservationId, reservation.id));
  expect(incidents).toHaveLength(1);
  expect(
    await getDb().select().from(sanction).where(eq(sanction.personId, prepared.borrowerId)),
  ).toHaveLength(0);
  await page.goto("/admin/inventario");
  await expect(page).toHaveURL(/\/app$/);
});

test("una reserva futura conserva su confirmación y avisa si un préstamo anterior se atrasa", async ({
  page,
}) => {
  const prepared = await prepare(true);
  const now = Date.now();
  const first = await reserveAs(
    { personId: prepared.borrowerId, ip: null },
    {
      sourceKind: prepared.source.kind,
      sourceId: prepared.source.id,
      startsAt: new Date(now + 3_600_000).toISOString(),
      endsAt: new Date(now + 7_200_000).toISOString(),
      lines: [{ itemId: prepared.itemId, quantity: 1 }],
    },
  );
  const secondStart = new Date(now + 10_800_000);
  const secondEnd = new Date(now + 14_400_000);
  await reserveAs(
    { personId: prepared.borrowerId, ip: null },
    {
      sourceKind: prepared.source.kind,
      sourceId: prepared.source.id,
      startsAt: secondStart.toISOString(),
      endsAt: secondEnd.toISOString(),
      lines: [{ itemId: prepared.itemId, quantity: 2 }],
    },
  );
  // La salida de ayer sigue pendiente; no cambia las cantidades físicas ni cancela la siguiente.
  await getDb()
    .update(inventoryReservation)
    .set({
      status: "OUT",
      startsAt: new Date(now - 172_800_000),
      endsAt: new Date(now - 86_400_000),
      checkedOutAt: new Date(now - 172_800_000),
    })
    .where(eq(inventoryReservation.id, first.id));
  await closeDb();
  const query = new URLSearchParams({
    desde: utcToBogotaInput(secondStart),
    hasta: utcToBogotaInput(secondEnd),
  });
  await page.goto(`/app/inventario?${query.toString()}`);
  const affected = page.locator(".inventory-reservation").filter({ hasText: t("T-4502") });
  await expect(affected.getByText(t("T-4502"), { exact: true })).toBeVisible();
  await expect(affected.getByText(t("T-4327"), { exact: true })).toBeVisible();
});
