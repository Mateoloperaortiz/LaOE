import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { notificationRequested } from "@/domain-events/comms";
import {
  checkoutAs,
  createItemAs,
  readCatalog,
  reserveAs,
  setReservationGrantAs,
} from "@/modules/inventory";
import { sendReturnReminders } from "@/modules/inventory/domain/reminders";
import { listLogisticsSources } from "@/modules/people";
import { updateOwnContact } from "@/modules/people/domain/own-data";
import { outbox } from "@/modules/system/schema";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
  seedVeteran,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { truncateAll } from "./db";

// Los avisos de devolución (ADR-191 regla 8): uno cuando faltan 24 horas y otro al vencerse, a quien
// reservó y a quien recoge, una sola vez cada uno aunque la pasada horaria vuelva a mirar.

const actor = (personId: string) => ({ personId, ip: null, isAdmin: false });
const interval = { startsAt: "2026-10-30T13:00:00Z", endsAt: "2026-10-30T16:00:00Z" };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

async function prestamo() {
  const termId = await seedTerm("2026-2");
  const vp = await seedMember("vp.avisos.sintetica@eafit.edu.co");
  await seedAppointment(vp, termId, "VP_ADMIN");
  const committeeId = await seedCommittee("avisos-sinteticos", "Comité sintético de avisos");
  const director = await seedVeteran("director.avisos.sintetico@eafit.edu.co");
  await seedCommitteeMembership(director, committeeId, termId, "LOGISTICA");
  const delegate = await seedMember("delegado.avisos.sintetico@eafit.edu.co");
  await seedCommitteeMembership(delegate, committeeId, termId);
  const cml = await seedMember("cml.avisos.sintetico@eafit.edu.co");
  const group = await seedWorkGroup(termId, "CML sintético", {
    kind: "WORK_COMMITTEE",
    code: "CML",
  });
  await seedWorkGroupMembership(group, cml);
  const [source] = await listLogisticsSources(director);
  if (!source) throw new Error("Falta el cargo logístico de prueba");
  const ref = { sourceKind: source.kind, sourceId: source.id };
  await setReservationGrantAs(actor(vp), { ...ref, enabled: true });
  await runCommand(actor(delegate), (ctx) =>
    updateOwnContact(ctx, delegate, { cardUid: "00112233", phone: "", personalEmail: "" }),
  );
  const item = await createItemAs(actor(vp), {
    name: "Cables sintéticos",
    mode: "QUANTITY",
    total: 5,
    location: "Bodega sintética",
    box: "Caja A",
  });
  const reserva = await reserveAs(actor(director), {
    ...ref,
    ...interval,
    collectorId: delegate,
    lines: [{ itemId: item.id, quantity: 2 }],
  });
  const [catalog] = await readCatalog();
  if (!catalog) throw new Error("Falta el implemento");
  vi.setSystemTime(new Date(interval.startsAt));
  await checkoutAs(actor(cml), {
    reservationId: reserva.id,
    requestId: "retiro-avisos-1",
    collectorId: delegate,
    barcodes: [catalog.barcode],
  });
  return { reserva, director, delegate };
}

async function avisos() {
  return (
    await getDb().select().from(outbox).where(eq(outbox.eventType, notificationRequested.type))
  ).map((row) => row.payload as { dedupeKey: string; recipients: Array<{ personId: string }> });
}

const correr = (at: string) =>
  runCommand(SYSTEM_ACTOR, (ctx) => sendReturnReminders(ctx, new Date(at)));

describe("los avisos de devolución del inventario", () => {
  it("avisa un día antes y al vencerse, a quien reservó y a quien recoge", async () => {
    const { reserva, director, delegate } = await prestamo();
    expect(await correr("2026-10-29T15:00:00Z")).toEqual({ soon: 0, overdue: 0 });
    expect(await correr("2026-10-29T16:00:00Z")).toEqual({ soon: 1, overdue: 0 });
    expect(await correr("2026-10-30T17:00:00Z")).toEqual({ soon: 0, overdue: 1 });
    expect(await correr("2026-10-30T19:00:00Z")).toEqual({ soon: 0, overdue: 0 });
    const enviados = await avisos();
    expect(enviados.map((row) => row.dedupeKey).sort()).toEqual([
      `inventario-devolver:${reserva.id}`,
      `inventario-vencido:${reserva.id}`,
    ]);
    for (const aviso of enviados)
      expect(aviso.recipients.map((row) => row.personId).sort()).toEqual(
        [director, delegate].sort(),
      );
  });

  it("dos pasadas dentro de la misma ventana piden el aviso con la misma clave", async () => {
    const { reserva } = await prestamo();
    await correr("2026-10-30T16:30:00Z");
    await correr("2026-10-30T17:30:00Z");
    const claves = (await avisos()).map((row) => row.dedupeKey);
    expect(new Set(claves)).toEqual(new Set([`inventario-vencido:${reserva.id}`]));
  });
});
