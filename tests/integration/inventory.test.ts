import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { inventoryIncidentReferred } from "@/domain-events/inventory";
import {
  adjustStockAs,
  cancelReservationAs,
  checkoutAs,
  createItemAs,
  exportOwnInventoryData,
  getAvailability,
  getIncidentForReview,
  getInventoryContext,
  listIncidents,
  listReservations,
  manageIncidentAs,
  readCatalog,
  recordIncidentAs,
  referIncidentAs,
  reserveAs,
  returnAs,
  setReservationGrantAs,
  writeOffAs,
} from "@/modules/inventory";
import { inventoryItem, inventoryMovement, inventoryReservation } from "@/modules/inventory/schema";
import { listLogisticsSources, setLogisticsDirectorAs } from "@/modules/people";
import { updateOwnContact } from "@/modules/people/domain/own-data";
import { sanction } from "@/modules/people/schema";
import { outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedEdition,
  seedEvent,
  seedMember,
  seedTerm,
  seedVeteran,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { firstThenSecond, holdTransaction } from "../helpers/locks";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

const actor = (personId: string) => ({ personId, ip: null, isAdmin: false });
const now = "2026-10-29T12:00:00Z";
const interval = { startsAt: "2026-10-30T13:00:00Z", endsAt: "2026-10-30T16:00:00Z" };
const laterInterval = { startsAt: "2026-11-02T13:00:00Z", endsAt: "2026-11-02T16:00:00Z" };

async function fixture() {
  const termId = await seedTerm("2026-2");
  const vp = await seedMember("vp.inventario.sintetica@eafit.edu.co");
  await seedAppointment(vp, termId, "VP_ADMIN");
  const committeeId = await seedCommittee("materiales-sinteticos", "Comité sintético");
  const director = await seedVeteran("director.inventario.sintetico@eafit.edu.co");
  await seedCommitteeMembership(director, committeeId, termId, "LOGISTICA");
  const delegate = await seedMember("delegado.inventario.sintetico@eafit.edu.co");
  await seedCommitteeMembership(delegate, committeeId, termId);
  const cml = await seedMember("cml.inventario.sintetico@eafit.edu.co");
  const group = await seedWorkGroup(termId, "CML sintético", {
    kind: "WORK_COMMITTEE",
    code: "CML",
    leaderPersonId: vp,
  });
  await seedWorkGroupMembership(group, cml);
  const [source] = await listLogisticsSources(director);
  if (!source) throw new Error("Falta el cargo logístico de prueba");
  const ref = { sourceKind: source.kind, sourceId: source.id };
  await setReservationGrantAs(actor(vp), { ...ref, enabled: true });
  await runCommand(actor(delegate), (ctx) =>
    updateOwnContact(ctx, delegate, { cardUid: "00112233", phone: "", personalEmail: "" }),
  );
  return { termId, vp, committeeId, director, delegate, cml, source, ref };
}

async function createQuantity(vp: string, total = 10) {
  return createItemAs(actor(vp), {
    name: "Cables sintéticos",
    mode: "QUANTITY",
    total,
    location: "Bodega sintética",
    box: "Caja A",
  });
}

async function reservationView(personId: string, id: string) {
  const row = (await listReservations(personId)).find((entry) => entry.id === id);
  if (!row) throw new Error("Falta la reserva de prueba");
  return row;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

describe("inventario y préstamos de la OE", () => {
  it("la VP administra y CML opera, sin conceder esas facultades a otro director", async () => {
    const f = await fixture();
    expect(await getInventoryContext(f.vp)).toMatchObject({ canManage: true, canOperate: true });
    expect(await getInventoryContext(f.cml)).toMatchObject({
      canManage: false,
      canOperate: true,
      canReserve: false,
    });
    expect(await getInventoryContext(f.director)).toMatchObject({
      canManage: false,
      canOperate: false,
      canReserve: true,
    });
    await expect(createQuantity(f.cml)).rejects.toThrow(t("T-4200"));
    await expect(
      setReservationGrantAs(actor(f.director), { ...f.ref, enabled: false }),
    ).rejects.toThrow(t("T-4200"));
    await createQuantity(f.vp);
    const catalog = await readCatalog();
    expect(catalog[0]).toMatchObject({
      total: 10,
      location: "Bodega sintética",
      box: "Caja A",
      mode: "QUANTITY",
    });
    expect(catalog[0]?.barcode).toMatch(/^OE-I-/);
  });

  it("confirma directamente, permite horarios consecutivos y calcula el pico de cantidades", async () => {
    const f = await fixture();
    const item = await createQuantity(f.vp, 10);
    await reserveAs(actor(f.director), {
      ...f.ref,
      ...interval,
      lines: [{ itemId: item.id, quantity: 6 }],
    });
    await reserveAs(actor(f.director), {
      ...f.ref,
      startsAt: interval.endsAt,
      endsAt: "2026-10-30T18:00:00Z",
      lines: [{ itemId: item.id, quantity: 6 }],
    });
    const [available] = await getAvailability({
      startsAt: interval.startsAt,
      endsAt: "2026-10-30T18:00:00Z",
    });
    expect(available?.available).toBe(4);
    await expect(
      reserveAs(actor(f.director), {
        ...f.ref,
        ...interval,
        lines: [{ itemId: item.id, quantity: 5 }],
      }),
    ).rejects.toThrow(t("T-4203"));
    expect(await listReservations(f.delegate)).toHaveLength(2);
  });

  it("dos directores con una sola existencia no confirman dos reservas a la vez", async () => {
    const f = await fixture();
    const item = await createQuantity(f.vp, 1);
    const otherCommittee = await seedCommittee("otro-inventario-sintetico");
    const other = await seedVeteran("otro.director.inventario.sintetico@eafit.edu.co");
    await seedCommitteeMembership(other, otherCommittee, f.termId, "LOGISTICA");
    const [source] = await listLogisticsSources(other);
    if (!source) throw new Error("Falta la segunda fuente");
    const otherRef = { sourceKind: source.kind, sourceId: source.id };
    await setReservationGrantAs(actor(f.vp), { ...otherRef, enabled: true });
    await warmPool();
    const held = await holdTransaction((tx) =>
      tx.select().from(inventoryItem).where(eq(inventoryItem.id, item.id)).for("update"),
    );
    const results = await firstThenSecond(
      held,
      () =>
        reserveAs(actor(f.director), {
          ...f.ref,
          ...interval,
          lines: [{ itemId: item.id, quantity: 1 }],
        }),
      () =>
        reserveAs(actor(other), {
          ...otherRef,
          ...interval,
          lines: [{ itemId: item.id, quantity: 1 }],
        }),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await getDb().select().from(inventoryReservation)).toHaveLength(1);
  });

  it("revocar impide reservar de nuevo y conserva la reserva y la cancelación propia", async () => {
    const f = await fixture();
    const item = await createQuantity(f.vp);
    const r = await reserveAs(actor(f.director), {
      ...f.ref,
      ...interval,
      lines: [{ itemId: item.id, quantity: 2 }],
    });
    await setReservationGrantAs(actor(f.vp), { ...f.ref, enabled: false });
    await expect(
      reserveAs(actor(f.director), {
        ...f.ref,
        ...interval,
        lines: [{ itemId: item.id, quantity: 1 }],
      }),
    ).rejects.toThrow(t("T-4206"));
    await expect(cancelReservationAs(actor(f.delegate), { reservationId: r.id })).rejects.toThrow(
      t("T-032"),
    );
    await expect(cancelReservationAs(actor(f.vp), { reservationId: r.id })).rejects.toThrow(
      t("T-4208"),
    );
    await cancelReservationAs(actor(f.director), { reservationId: r.id });
    expect(await reservationView(f.director, r.id)).toMatchObject({ status: "CANCELLED" });
  });

  it("una fuente retirada y reemplazada no hereda su permiso anterior", async () => {
    const f = await fixture();
    await setLogisticsDirectorAs(
      actor(f.vp),
      { kind: "COMMITTEE", committeeId: f.committeeId, termId: f.termId },
      { personId: f.director, assigned: false, coDirector: false },
    );
    await setLogisticsDirectorAs(
      actor(f.vp),
      { kind: "COMMITTEE", committeeId: f.committeeId, termId: f.termId },
      { personId: f.director, assigned: true, coDirector: false },
    );
    const [source] = await listLogisticsSources(f.director);
    expect(source?.id).not.toBe(f.source.id);
    expect(await getInventoryContext(f.director)).toMatchObject({ canReserve: false });
  });

  it("entrega solo dentro del horario, al mismo comité y con UID, y el reintento no duplica", async () => {
    const f = await fixture();
    const item = await createQuantity(f.vp);
    const r = await reserveAs(actor(f.director), {
      ...f.ref,
      ...interval,
      collectorId: f.delegate,
      lines: [{ itemId: item.id, quantity: 3 }],
    });
    const [catalog] = await readCatalog();
    if (!catalog) throw new Error("Falta el implemento");
    const input = {
      reservationId: r.id,
      requestId: "retiro-sintetico-1",
      collectorId: f.delegate,
      barcodes: [catalog.barcode],
    };
    await expect(checkoutAs(actor(f.cml), input)).rejects.toThrow(t("T-4207"));
    vi.setSystemTime(new Date(interval.startsAt));
    await expect(checkoutAs(actor(f.cml), { ...input, collectorId: f.director })).rejects.toThrow(
      t("T-4205"),
    );
    await expect(checkoutAs(actor(f.cml), { ...input, collectorId: f.cml })).rejects.toThrow(
      t("T-4204"),
    );
    await setReservationGrantAs(actor(f.vp), { ...f.ref, enabled: false });
    await checkoutAs(actor(f.cml), input);
    await checkoutAs(actor(f.cml), input);
    expect(await getDb().select().from(inventoryMovement)).toHaveLength(1);
    expect(await reservationView(f.director, r.id)).toMatchObject({
      status: "OUT",
      collectorId: f.delegate,
    });
    await expect(checkoutAs(actor(f.cml), { ...input, barcodes: ["OTRO"] })).rejects.toThrow(
      t("T-4210"),
    );
  });

  it("la devolución parcial conserva faltantes, el daño va a cuarentena y una pérdida no inventa regreso", async () => {
    const f = await fixture();
    const item = await createQuantity(f.vp, 10);
    const r = await reserveAs(actor(f.director), {
      ...f.ref,
      ...interval,
      collectorId: f.delegate,
      lines: [{ itemId: item.id, quantity: 5 }],
    });
    const future = await reserveAs(actor(f.director), {
      ...f.ref,
      ...laterInterval,
      lines: [{ itemId: item.id, quantity: 8 }],
    });
    expect(await reservationView(f.cml, future.id)).toMatchObject({
      conflicted: false,
      status: "CONFIRMED",
    });
    vi.setSystemTime(new Date(interval.startsAt));
    const [catalog] = await readCatalog();
    if (!catalog) throw new Error("Falta el material");
    await checkoutAs(actor(f.cml), {
      reservationId: r.id,
      requestId: "retiro-sintetico-2",
      collectorId: f.delegate,
      barcodes: [catalog.barcode],
    });
    const line = (await reservationView(f.cml, r.id)).lines[0];
    if (!line) throw new Error("Falta la línea");
    const returned = {
      reservationId: r.id,
      requestId: "entrada-sintetica-2",
      note: "Dos cables aún pendientes y uno averiado",
      lines: [{ lineId: line.id, quantity: 3, damagedQuantity: 1 }],
    };
    await returnAs(actor(f.cml), returned);
    await returnAs(actor(f.cml), returned);
    expect((await reservationView(f.cml, r.id)).lines[0]).toMatchObject({
      outstanding: 2,
      returned: 3,
    });
    const [during] = await getAvailability(interval);
    expect(during).toMatchObject({ available: 7, quarantined: 1, total: 10 });
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    const [late] = await getAvailability(laterInterval);
    expect(late?.available).toBe(0);
    expect(await reservationView(f.cml, r.id)).toMatchObject({ overdue: true, status: "OUT" });
    expect(await reservationView(f.cml, future.id)).toMatchObject({
      conflicted: true,
      status: "CONFIRMED",
    });
    await expect(
      writeOffAs(actor(f.cml), {
        reservationId: r.id,
        requestId: "perdida-sintetica-1",
        lineId: line.id,
        quantity: 2,
        reason: "Pérdida revisada",
      }),
    ).rejects.toThrow(t("T-4200"));
    await writeOffAs(actor(f.vp), {
      reservationId: r.id,
      requestId: "perdida-sintetica-1",
      lineId: line.id,
      quantity: 2,
      reason: "Pérdida revisada con el responsable",
    });
    await writeOffAs(actor(f.vp), {
      reservationId: r.id,
      requestId: "perdida-sintetica-1",
      lineId: line.id,
      quantity: 2,
      reason: "Pérdida revisada con el responsable",
    });
    expect(await reservationView(f.cml, r.id)).toMatchObject({ status: "RETURNED" });
    expect((await readCatalog())[0]).toMatchObject({ total: 8, quarantined: 1 });
    expect(await getDb().select().from(inventoryMovement)).toHaveLength(3);
    expect(await reservationView(f.cml, future.id)).toMatchObject({
      conflicted: true,
      status: "CONFIRMED",
    });
    await adjustStockAs(actor(f.vp), {
      itemId: item.id,
      delta: 1,
      reason: "Se reemplazó un cable perdido",
    });
    expect(await reservationView(f.cml, future.id)).toMatchObject({
      conflicted: false,
      status: "CONFIRMED",
    });
  });

  it("asigna etiquetas por unidad y rechaza devolver o dañar una unidad ajena", async () => {
    const f = await fixture();
    const item = await createItemAs(actor(f.vp), {
      name: "Sonido sintético",
      mode: "UNIT",
      total: 2,
      location: "Bodega",
      box: "Caja B",
    });
    const r = await reserveAs(actor(f.director), {
      ...f.ref,
      ...interval,
      collectorId: f.delegate,
      lines: [{ itemId: item.id, quantity: 2 }],
    });
    const future = await reserveAs(actor(f.director), {
      ...f.ref,
      ...laterInterval,
      lines: [{ itemId: item.id, quantity: 1 }],
    });
    const futureLine = (await reservationView(f.cml, future.id)).lines[0];
    const futureUnitId = futureLine?.units[0]?.id;
    expect(await reservationView(f.cml, future.id)).toMatchObject({ conflicted: false });
    vi.setSystemTime(new Date(interval.startsAt));
    const line = (await reservationView(f.cml, r.id)).lines[0];
    if (!line) throw new Error("Falta la línea por unidad");
    expect(new Set(line.units.map((unit) => unit.barcode)).size).toBe(2);
    await checkoutAs(actor(f.cml), {
      reservationId: r.id,
      requestId: "retiro-unidades-1",
      collectorId: f.delegate,
      barcodes: line.units.map((unit) => unit.barcode),
    });
    const selected = line.units.find((unit) => unit.id === futureUnitId);
    const other = line.units.find((unit) => unit.id !== futureUnitId);
    if (!selected || !other) throw new Error("Faltan las unidades asignadas");
    await expect(
      returnAs(actor(f.cml), {
        reservationId: r.id,
        requestId: "entrada-unidades-ajena",
        lines: [{ lineId: line.id, quantity: 1, unitIds: ["ajena"] }],
      }),
    ).rejects.toThrow(t("T-4211"));
    await returnAs(actor(f.cml), {
      reservationId: r.id,
      requestId: "entrada-otra-unidad-1",
      lines: [{ lineId: line.id, quantity: 1, unitIds: [other.id] }],
    });
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    // Queda otra unidad libre: el conflicto es de la etiqueta asignada, no de capacidad total.
    expect(await reservationView(f.cml, future.id)).toMatchObject({
      conflicted: true,
      status: "CONFIRMED",
    });
    await returnAs(actor(f.cml), {
      reservationId: r.id,
      requestId: "entrada-unidades-1",
      note: "Se recibió con daño en el conector",
      lines: [
        {
          lineId: line.id,
          quantity: 1,
          unitIds: [selected.id],
          damagedQuantity: 1,
          damagedUnitIds: [selected.id],
        },
      ],
    });
    expect((await readCatalog())[0]?.units.find((unit) => unit.id === selected.id)?.state).toBe(
      "QUARANTINED",
    );
    expect(await reservationView(f.cml, future.id)).toMatchObject({ conflicted: true });
    await adjustStockAs(actor(f.vp), {
      itemId: item.id,
      delta: 0,
      reason: "Unidad reparada y revisada",
      releaseQuarantine: 1,
      unitIds: [selected.id],
    });
    expect((await readCatalog())[0]?.units.find((unit) => unit.id === selected.id)?.state).toBe(
      "AVAILABLE",
    );
    expect(await reservationView(f.cml, future.id)).toMatchObject({
      conflicted: false,
      status: "CONFIRMED",
    });
  });

  it("CML anota, VP gestiona y remite una vez sin registrar sanciones ni liberar pendientes", async () => {
    const f = await fixture();
    const item = await createQuantity(f.vp);
    const r = await reserveAs(actor(f.director), {
      ...f.ref,
      ...interval,
      collectorId: f.delegate,
      lines: [{ itemId: item.id, quantity: 2 }],
    });
    vi.setSystemTime(new Date(interval.startsAt));
    const [catalog] = await readCatalog();
    if (!catalog) throw new Error("Falta el material");
    await checkoutAs(actor(f.cml), {
      reservationId: r.id,
      requestId: "retiro-incidencia-1",
      collectorId: f.delegate,
      barcodes: [catalog.barcode],
    });
    const incident = await recordIncidentAs(actor(f.cml), {
      reservationId: r.id,
      note: "Falta devolver ambos cables del préstamo",
    });
    await expect(listIncidents(f.director)).rejects.toThrow(t("T-4200"));
    await expect(referIncidentAs(actor(f.vp), { incidentId: incident.id })).rejects.toThrow(
      t("T-4212"),
    );
    await expect(
      manageIncidentAs(actor(f.cml), {
        incidentId: incident.id,
        management: "Se contactó al responsable",
      }),
    ).rejects.toThrow(t("T-4200"));
    await manageIncidentAs(actor(f.vp), {
      incidentId: incident.id,
      management: "Se contactó al responsable, aún no ha respondido",
      status: "RESOLVED",
    });
    expect((await reservationView(f.cml, r.id)).lines[0]?.outstanding).toBe(2);
    await referIncidentAs(actor(f.vp), { incidentId: incident.id });
    await referIncidentAs(actor(f.vp), { incidentId: incident.id });
    const events = await getDb()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, inventoryIncidentReferred.type));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).not.toHaveProperty("management");
    expect(await getDb().select().from(sanction)).toHaveLength(0);
    expect(await getIncidentForReview(incident.id, f.director)).toBeNull();
    const own = await exportOwnInventoryData(f.delegate);
    expect(own.data.inventoryReservations[0]).toMatchObject({
      id: r.id,
      asRequester: false,
      asCollector: true,
    });
    expect(own.data.inventoryIncidents[0]).toMatchObject({ id: incident.id, status: "REFERRED" });
    const serialized = JSON.stringify(own);
    expect(serialized).not.toContain("Falta devolver");
    expect(serialized).not.toContain("no ha respondido");
    expect(serialized).not.toContain(f.director);
    expect(serialized).not.toContain(f.cml);
    expect(serialized).not.toContain("00 11 22 33");
    expect(await getIncidentForReview(incident.id, f.delegate)).toMatchObject({
      status: "REFERRED",
      personId: f.delegate,
    });
  });

  it("un macroevento permite recoger solo a la dirección que reservó", async () => {
    const f = await fixture();
    const eventId = await seedEvent("inventiva", "Macroevento sintético");
    const editionId = await seedEdition(eventId, "sintetico", "Edición sintética", {
      startsAt: new Date("2026-11-20T12:00:00Z"),
    });
    await setLogisticsDirectorAs(
      actor(f.vp),
      { kind: "MACROEVENT", editionId },
      { personId: f.director, assigned: true, coDirector: true },
    );
    const source = (await listLogisticsSources(f.director)).find(
      (entry) => entry.editionId === editionId,
    );
    if (!source) throw new Error("Falta la fuente de macroevento");
    const ref = { sourceKind: source.kind, sourceId: source.id };
    await setReservationGrantAs(actor(f.vp), { ...ref, enabled: true });
    const item = await createQuantity(f.vp);
    await expect(
      reserveAs(actor(f.director), {
        ...ref,
        ...interval,
        collectorId: f.delegate,
        lines: [{ itemId: item.id, quantity: 1 }],
      }),
    ).rejects.toThrow(t("T-4204"));
    const r = await reserveAs(actor(f.director), {
      ...ref,
      ...interval,
      lines: [{ itemId: item.id, quantity: 1 }],
    });
    expect(await reservationView(f.director, r.id)).toMatchObject({
      editionId,
      collectorId: f.director,
      committeeId: null,
    });
  });
});
