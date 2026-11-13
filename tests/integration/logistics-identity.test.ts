import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { checkoutAs, createItemAs, reserveAs, setReservationGrantAs } from "@/modules/inventory";
import { inventoryItem, inventoryReservation } from "@/modules/inventory/schema";
import {
  hasCurrentVpAdmin,
  listLogisticsSources,
  removeAppointmentAs,
  resolveLogisticsSource,
  setLogisticsDirectorAs,
} from "@/modules/people";
import { listDirectory } from "@/modules/people/domain/directory";
import { anonymizePerson } from "@/modules/people/domain/membership";
import {
  collectPersonalData,
  ownContactSchema,
  requestDeletion,
  updateOwnContact,
} from "@/modules/people/domain/own-data";
import { getPersonRecord } from "@/modules/people/domain/persons";
import { appointment, committeeRoleAssignment, membership, person } from "@/modules/people/schema";
import { removeMemberAs } from "@/modules/permanence";
import { hasCurrentCmlMembership } from "@/modules/permanence/domain/groups";
import { workGroupMembership } from "@/modules/permanence/schema";
import { auditLog } from "@/modules/system/schema";
import { DomainError } from "@/shared/lib/errors";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedEdition,
  seedEvent,
  seedMember,
  seedPermission,
  seedTerm,
  seedVeteran,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { firstThenSecond, holdTransaction, outcome } from "../helpers/locks";
import { truncateAll } from "./db";

const manager = (personId: string) => ({ personId, isAdmin: false, ip: null });

async function fixture() {
  const termId = await seedTerm("2026-2");
  const vp = await seedMember("vp.admin.sintetica@eafit.edu.co");
  await seedAppointment(vp, termId, "VP_ADMIN");
  const committeeId = await seedCommittee("inventario-sintetico");
  const candidate = await seedVeteran("logistica.sintetica@eafit.edu.co");
  await seedCommitteeMembership(candidate, committeeId, termId, "MERCADEO", { coDirector: true });
  return { termId, vp, committeeId, candidate };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T17:00:00Z"));
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

describe("dirección logística con alcance limitado", () => {
  it("la VP vigente asigna y retira solo Logística conservando Mercadeo y la historia del origen", async () => {
    const f = await fixture();
    const scope = { kind: "COMMITTEE" as const, committeeId: f.committeeId, termId: f.termId };
    expect(await hasCurrentVpAdmin(f.vp)).toBe(true);
    await setLogisticsDirectorAs(manager(f.vp), scope, {
      personId: f.candidate,
      assigned: true,
      coDirector: false,
    });
    const sources = await listLogisticsSources(f.candidate);
    expect(sources).toHaveLength(1);
    const source = sources[0];
    if (!source) throw new Error("Falta la fuente logística sintética");
    expect(source).toMatchObject({
      kind: "COMMITTEE_ASSIGNMENT",
      personId: f.candidate,
      committeeId: f.committeeId,
      editionId: null,
      live: true,
    });
    await setLogisticsDirectorAs(manager(f.vp), scope, {
      personId: f.candidate,
      assigned: false,
      coDirector: false,
    });
    expect(await resolveLogisticsSource(source)).toMatchObject({ live: false });
    const live = await getDb()
      .select()
      .from(committeeRoleAssignment)
      .where(
        and(
          eq(committeeRoleAssignment.personId, f.candidate),
          isNull(committeeRoleAssignment.endedAt),
        ),
      );
    expect(live.map((row) => row.roleCode)).toEqual(["MERCADEO"]);
    await setLogisticsDirectorAs(manager(f.vp), scope, {
      personId: f.candidate,
      assigned: true,
      coDirector: false,
    });
    expect((await listLogisticsSources(f.candidate))[0]?.id).not.toBe(source.id);
  });

  it("rechaza una VP de otro semestre y una asignación sin pertenencia al comité", async () => {
    const f = await fixture();
    const past = await seedTerm("2026-1");
    const oldVp = await seedMember("vp.anterior.sintetica@eafit.edu.co");
    await seedAppointment(oldVp, past, "VP_ADMIN");
    expect(await hasCurrentVpAdmin(oldVp)).toBe(false);
    const scope = { kind: "COMMITTEE" as const, committeeId: f.committeeId, termId: f.termId };
    const input = { personId: f.candidate, assigned: true, coDirector: false };
    await expect(setLogisticsDirectorAs(manager(oldVp), scope, input)).rejects.toThrow(DomainError);
    const outsider = await seedVeteran("sin.comite.sintetica@eafit.edu.co");
    await expect(
      setLogisticsDirectorAs(manager(f.vp), scope, { ...input, personId: outsider }),
    ).rejects.toThrow(DomainError);
    expect(await listLogisticsSources(f.candidate)).toEqual([]);
  });

  it("respeta las inhabilidades y no desplaza al titular de Logística de otra persona", async () => {
    const f = await fixture();
    const scope = { kind: "COMMITTEE" as const, committeeId: f.committeeId, termId: f.termId };
    const newbie = await seedMember("nuevo.logistica.sintetico@eafit.edu.co");
    await seedCommitteeMembership(newbie, f.committeeId, f.termId);
    await expect(
      setLogisticsDirectorAs(manager(f.vp), scope, {
        personId: newbie,
        assigned: true,
        coDirector: false,
      }),
    ).rejects.toThrow(DomainError);
    await setLogisticsDirectorAs(manager(f.vp), scope, {
      personId: f.candidate,
      assigned: true,
      coDirector: false,
    });
    const other = await seedVeteran("otra.logistica.sintetica@eafit.edu.co");
    await seedCommitteeMembership(other, f.committeeId, f.termId);
    await expect(
      setLogisticsDirectorAs(manager(f.vp), scope, {
        personId: other,
        assigned: true,
        coDirector: false,
      }),
    ).rejects.toThrow(DomainError);
    expect(await listLogisticsSources(other)).toEqual([]);
    expect(await listLogisticsSources(f.candidate)).toHaveLength(1);
  });

  it("habilita la mesa logística de una edición futura sin duplicar cargos ni tocar otras áreas", async () => {
    const f = await fixture();
    const future = await seedTerm("2027-1");
    const eventId = await seedEvent("inventiva", "Inventiva sintética");
    const editionId = await seedEdition(eventId, "sintetica-2027", "Edición sintética", {
      startsAt: new Date("2027-03-15T15:00:00Z"),
    });
    const scope = { kind: "MACROEVENT" as const, editionId };
    const input = { personId: f.candidate, assigned: true, coDirector: true };
    await setLogisticsDirectorAs(manager(f.vp), scope, input);
    const sources = await listLogisticsSources(f.candidate);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      kind: "MACROEVENT_APPOINTMENT",
      termId: future,
      editionId,
      live: true,
    });
    expect(await setLogisticsDirectorAs(manager(f.vp), scope, input)).toEqual({ changed: false });
    const before = sources[0];
    if (!before) throw new Error("Falta el cargo de macroevento sintético");
    await setLogisticsDirectorAs(manager(f.vp), scope, { ...input, assigned: false });
    expect(await resolveLogisticsSource(before)).toBeNull();
    expect(
      await getDb().select().from(appointment).where(eq(appointment.editionId, editionId)),
    ).toEqual([]);
  });

  it("no habilita fuentes de semestres pasados ni personas en licencia", async () => {
    const f = await fixture();
    const scope = { kind: "COMMITTEE" as const, committeeId: f.committeeId, termId: f.termId };
    await setLogisticsDirectorAs(manager(f.vp), scope, {
      personId: f.candidate,
      assigned: true,
      coDirector: false,
    });
    const [source] = await listLogisticsSources(f.candidate);
    if (!source) throw new Error("Falta la fuente sintética");
    await getDb()
      .update(membership)
      .set({ status: "ON_LEAVE" })
      .where(eq(membership.personId, f.candidate));
    expect(await resolveLogisticsSource(source)).toMatchObject({ live: false });
    vi.setSystemTime(new Date("2027-02-01T17:00:00Z"));
    expect(await hasCurrentVpAdmin(f.vp)).toBe(false);
    expect(await listLogisticsSources(f.candidate)).toEqual([]);
  });

  it("reconoce solo la pertenencia viva al CML del semestre vigente", async () => {
    const f = await fixture();
    const groupId = await seedWorkGroup(f.termId, "CML sintético", {
      kind: "WORK_COMMITTEE",
      code: "CML",
    });
    const rowId = await seedWorkGroupMembership(groupId, f.candidate);
    expect(await hasCurrentCmlMembership(f.candidate, f.termId)).toBe(true);
    await getDb()
      .update(workGroupMembership)
      .set({ leftAt: new Date() })
      .where(eq(workGroupMembership.id, rowId));
    expect(await hasCurrentCmlMembership(f.candidate, f.termId)).toBe(false);
    await getDb()
      .update(workGroupMembership)
      .set({ leftAt: null })
      .where(eq(workGroupMembership.id, rowId));
    const past = await seedTerm("2026-1");
    expect(await hasCurrentCmlMembership(f.candidate, past)).toBe(false);
    await getDb()
      .update(membership)
      .set({ status: "ON_LEAVE" })
      .where(eq(membership.personId, f.candidate));
    expect(await hasCurrentCmlMembership(f.candidate, f.termId)).toBe(false);
  });
});

describe("UID privado del carnet universitario", () => {
  it("exige UID al guardar el perfil y evita que dos integrantes compartan el mismo carnet", async () => {
    const f = await fixture();
    expect(ownContactSchema.safeParse({ phone: "", personalEmail: "" }).success).toBe(false);
    await runCommand({ personId: f.candidate, ip: null }, (ctx) =>
      updateOwnContact(ctx, f.candidate, { cardUid: "001122aa", phone: "", personalEmail: "" }),
    );
    expect(await getPersonRecord(f.candidate)).toMatchObject({ cardUid: "00 11 22 AA" });
    await expect(
      runCommand({ personId: f.vp, ip: null }, (ctx) =>
        updateOwnContact(ctx, f.vp, { cardUid: "00:11:22:aa", phone: "", personalEmail: "" }),
      ),
    ).rejects.toThrow(DomainError);
    expect((await getPersonRecord(f.vp))?.cardUid).toBeNull();
    expect((await collectPersonalData(f.candidate))?.person.cardUid).toBe("00 11 22 AA");
    expect(
      JSON.stringify(await listDirectory({ q: "", committeeId: null, page: 1, pageSize: 20 })),
    ).not.toContain("00 11 22 AA");
  });

  it("anonimiza el UID y elimina su valor de la auditoría personal", async () => {
    const f = await fixture();
    await runCommand({ personId: f.candidate, ip: null }, (ctx) =>
      updateOwnContact(ctx, f.candidate, { cardUid: "00 11 22 AA", phone: "", personalEmail: "" }),
    );
    await runCommand({ personId: f.candidate, ip: null }, (ctx) =>
      requestDeletion(ctx, f.candidate),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) => anonymizePerson(ctx, f.candidate));
    const [row] = await getDb().select().from(person).where(eq(person.id, f.candidate));
    expect(row?.cardUid).toBeNull();
    expect(
      JSON.stringify(
        await getDb().select().from(auditLog).where(eq(auditLog.entityId, f.candidate)),
      ),
    ).not.toContain("00 11 22 AA");
  });
});

describe("barreras de retiro de cargos y pertenencias logísticas", () => {
  async function macroFixture() {
    const f = await fixture();
    const support = await seedMember("soporte.barrera.sintetica@eafit.edu.co");
    await seedPermission(support, "ADMIN");
    const eventId = await seedEvent("inventiva", "Inventiva sintética");
    const editionId = await seedEdition(eventId, "barrera-sintetica", "Edición de barrera", {
      startsAt: new Date("2026-11-15T15:00:00Z"),
    });
    await setLogisticsDirectorAs(
      manager(f.vp),
      { kind: "MACROEVENT", editionId },
      { personId: f.candidate, assigned: true },
    );
    const [source] = await listLogisticsSources(f.candidate);
    if (!source) throw new Error("Falta el origen de la barrera sintética");
    await setReservationGrantAs(manager(f.vp), {
      sourceKind: source.kind,
      sourceId: source.id,
      enabled: true,
    });
    const item = await createItemAs(manager(f.vp), {
      name: "Material sintético",
      mode: "QUANTITY",
      total: 1,
      location: "Bodega sintética",
      box: "Caja sintética",
    });
    const reserve = () =>
      reserveAs(
        { personId: f.candidate, ip: null },
        {
          sourceKind: source.kind,
          sourceId: source.id,
          startsAt: "2026-10-30T15:00:00Z",
          endsAt: "2026-10-30T16:00:00Z",
          lines: [{ itemId: item.id, quantity: 1 }],
        },
      );
    const remove = () =>
      removeAppointmentAs({ personId: support, ip: null }, source.id, { editionId });
    return { ...f, source, item, reserve, remove };
  }

  it("el retiro desde la mesa existente espera a una reserva que ya pasó la guarda", async () => {
    const f = await macroFixture();
    const held = await holdTransaction(async (tx) => {
      await tx.select().from(inventoryItem).where(eq(inventoryItem.id, f.item.id)).for("update");
    });
    const results = await firstThenSecond(held, f.reserve, f.remove);
    expect(results.map(outcome)).toEqual(["ok", "ok"]);
    expect(await resolveLogisticsSource(f.source)).toBeNull();
    expect(await getDb().select().from(inventoryReservation)).toHaveLength(1);
    await expect(f.reserve()).rejects.toThrow(DomainError);
  });

  it("reservar espera al retiro ya iniciado y relee que el cargo dejó de existir", async () => {
    const f = await macroFixture();
    const held = await holdTransaction(async (tx) => {
      await tx.select().from(appointment).where(eq(appointment.id, f.source.id)).for("update");
    });
    const results = await firstThenSecond(held, f.remove, f.reserve);
    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]?.status).toBe("rejected");
    expect(await getDb().select().from(inventoryReservation)).toEqual([]);
    expect(await resolveLogisticsSource(f.source)).toBeNull();
  });

  it("retirar del CML espera a la salida física que ya pasó la guarda del operador", async () => {
    const f = await fixture();
    await setLogisticsDirectorAs(
      manager(f.vp),
      { kind: "COMMITTEE", committeeId: f.committeeId, termId: f.termId },
      { personId: f.candidate, assigned: true },
    );
    const [source] = await listLogisticsSources(f.candidate);
    if (!source) throw new Error("Falta el origen sintético");
    await setReservationGrantAs(manager(f.vp), {
      sourceKind: source.kind,
      sourceId: source.id,
      enabled: true,
    });
    await getDb().update(person).set({ cardUid: "00 11 22 AA" }).where(eq(person.id, f.candidate));
    const operator = await seedMember("cml.barrera.sintetica@eafit.edu.co");
    const groupId = await seedWorkGroup(f.termId, "CML de barrera", {
      kind: "WORK_COMMITTEE",
      code: "CML",
    });
    await seedWorkGroupMembership(groupId, operator);
    const item = await createItemAs(manager(f.vp), {
      name: "Material de salida",
      mode: "QUANTITY",
      total: 1,
      location: "Bodega sintética",
      box: "Caja sintética",
    });
    const reservation = await reserveAs(
      { personId: f.candidate, ip: null },
      {
        sourceKind: source.kind,
        sourceId: source.id,
        startsAt: "2026-10-29T17:01:00Z",
        endsAt: "2026-10-29T18:00:00Z",
        lines: [{ itemId: item.id, quantity: 1 }],
      },
    );
    vi.setSystemTime(new Date("2026-10-29T17:02:00Z"));
    const [stored] = await getDb()
      .select()
      .from(inventoryItem)
      .where(eq(inventoryItem.id, item.id));
    if (!stored) throw new Error("Falta el material sintético");
    const held = await holdTransaction(async (tx) => {
      await tx.select().from(inventoryItem).where(eq(inventoryItem.id, item.id)).for("update");
    });
    const checkout = () =>
      checkoutAs(
        { personId: operator, ip: null },
        {
          reservationId: reservation.id,
          requestId: "cml-membership-barrier-checkout",
          collectorId: f.candidate,
          barcodes: [stored.barcode],
        },
      );
    const results = await firstThenSecond(held, checkout, () =>
      removeMemberAs({ personId: f.vp, ip: null }, groupId, operator),
    );
    expect(results.map(outcome)).toEqual(["ok", "ok"]);
    expect(await hasCurrentCmlMembership(operator, f.termId)).toBe(false);
    const [updated] = await getDb()
      .select()
      .from(inventoryReservation)
      .where(eq(inventoryReservation.id, reservation.id));
    expect(updated?.status).toBe("OUT");
    await expect(
      checkoutAs(
        { personId: operator, ip: null },
        {
          reservationId: reservation.id,
          requestId: "cml-membership-barrier-after-removal",
          collectorId: f.candidate,
          barcodes: [stored.barcode],
        },
      ),
    ).rejects.toThrow(DomainError);
  });
});
