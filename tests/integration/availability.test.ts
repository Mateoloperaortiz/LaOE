import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import {
  closeMeetingPollAs,
  createMeetingPollAs,
  exportOwnAvailabilityData,
  getAvailabilityAs,
  getMeetingPollAs,
  saveAvailabilityAs,
  saveMeetingAvailabilityAs,
  withdrawAvailabilityAs,
} from "@/modules/availability";
import { anonymizePersonAs, requestDeletionAs, revokeConsentAs } from "@/modules/people";
import { removeMemberAs, WORK_GROUP_KINDS } from "@/modules/permanence";
import { todayKey } from "@/shared/lib/dates";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedConsent,
  seedMember,
  seedMembership,
  seedPermission,
  seedPerson,
  seedTerm,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

describe("disponibilidad privada", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);
  afterEach(() => vi.useRealTimers());

  it("guarda la semana propia y distingue una respuesta vacía de no haber respondido", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("horario@example.test");
    await seedConsent(personId);
    const actor = { personId, ip: null };

    expect((await getAvailabilityAs(actor)).own).toBeNull();
    const first = await saveAvailabilityAs(actor, { termId, slots: [18, 19, 66], revision: 0 });
    expect((await getAvailabilityAs(actor)).own).toMatchObject({
      slots: [18, 19, 66],
      revision: first.revision,
    });
    const second = await saveAvailabilityAs(actor, { termId, slots: [], revision: first.revision });
    expect((await getAvailabilityAs(actor)).own).toMatchObject({
      slots: [],
      revision: second.revision,
    });
    expect(second.revision).not.toBe(first.revision);
  });

  it("compara solo miembros del comité propio, sin tomar a quien no respondió como disponible", async () => {
    const termId = await seedTerm();
    const id = await seedCommittee("comite-horarios");
    const ids: string[] = [];
    for (const name of ["uno", "dos", "tres"]) {
      const personId = await seedMember(`${name}@example.test`);
      await seedConsent(personId);
      await seedCommitteeMembership(personId, id, termId);
      ids.push(personId);
    }
    const [one = "", two = "", three = ""] = ids;
    const actor = { personId: one, ip: null };
    await saveAvailabilityAs(actor, { termId, slots: [18, 19], revision: 0 });
    await saveAvailabilityAs({ personId: two, ip: null }, { termId, slots: [19, 20], revision: 0 });
    const view = await getAvailabilityAs(actor, { group: { type: "COMMITTEE", id } });
    expect(view.comparison).toMatchObject({ total: 3, answered: 2 });
    expect(view.comparison?.counts.slice(18, 21)).toEqual([1, 2, 1]);
    expect(view.comparison?.members.find((member) => member.personId === three)?.slots).toBeNull();
    expect(view.comparison?.members.every((member) => !Object.hasOwn(member, "status"))).toBe(true);
    const stranger = await seedMember("ajeno@example.test");
    await seedConsent(stranger);
    await seedPermission(stranger, "ADMIN");
    await expect(
      getAvailabilityAs({ personId: stranger, ip: null }, { group: { type: "COMMITTEE", id } }),
    ).rejects.toThrow();
    await expect(getAvailabilityAs({ personId: null, ip: null })).rejects.toThrow();
  });

  it.each(
    WORK_GROUP_KINDS,
  )("comparte horarios en %s y retira el acceso al salir del grupo", async (kind) => {
    const termId = await seedTerm();
    const leader = await seedMember("lider@example.test");
    const member = await seedMember("miembro@example.test");
    const evaluator = await seedMember("evaluador@example.test");
    for (const id of [leader, member, evaluator]) await seedConsent(id);
    const id = await seedWorkGroup(termId, "Equipo sintético", {
      kind,
      leaderPersonId: leader,
      evaluatorIds: [evaluator],
    });
    await seedWorkGroupMembership(id, member);
    const group = { type: "WORK_GROUP" as const, id };
    const actor = { personId: member, ip: null };
    expect((await getAvailabilityAs(actor, { group })).comparison?.total).toBe(2);
    expect(
      (await getAvailabilityAs({ personId: leader, ip: null }, { group })).comparison?.total,
    ).toBe(2);
    await expect(getAvailabilityAs({ personId: evaluator, ip: null }, { group })).rejects.toThrow();
    await removeMemberAs({ personId: leader, ip: null }, id, member);
    await expect(getAvailabilityAs(actor, { group })).rejects.toThrow();
  });

  it("consulta fechas concretas del grupo sin confundirlas con la semana habitual", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("propuesta@example.test");
    await seedConsent(personId);
    const id = await seedWorkGroup(termId, "Apoyo sintético");
    await seedWorkGroupMembership(id, personId);
    const actor = { personId, ip: null };
    await saveAvailabilityAs(actor, { termId, slots: [18], revision: 0 });
    const poll = await createMeetingPollAs(actor, {
      termId,
      group: { type: "WORK_GROUP", id },
      title: "Reunión de prueba",
      dates: [todayKey()],
      startMinute: 540,
      endMinute: 600,
    });
    expect((await getMeetingPollAs(actor, poll.id)).own).toBeNull();
    await saveMeetingAvailabilityAs(actor, { pollId: poll.id, slots: [19], revision: 0 });
    const view = await getMeetingPollAs(actor, poll.id);
    expect(view.comparison.counts.slice(18, 20)).toEqual([0, 1]);
    expect((await getAvailabilityAs(actor)).own?.slots).toEqual([18]);
    const stranger = await seedMember("propuesta-ajena@example.test");
    await seedConsent(stranger);
    await expect(getMeetingPollAs({ personId: stranger, ip: null }, poll.id)).rejects.toThrow();
    await expect(
      saveMeetingAvailabilityAs(
        { personId: stranger, ip: null },
        { pollId: poll.id, slots: [18], revision: 0 },
      ),
    ).rejects.toThrow();
  });

  it("solo el creador cierra la propuesta y cada miembro puede retirar su respuesta", async () => {
    const termId = await seedTerm();
    const creator = await seedMember("creador@example.test");
    const member = await seedMember("respuesta@example.test");
    for (const personId of [creator, member]) await seedConsent(personId);
    const id = await seedCommittee("cerrar-propuesta");
    for (const personId of [creator, member]) await seedCommitteeMembership(personId, id, termId);
    const actor = { personId: member, ip: null };
    const owner = { personId: creator, ip: null };
    const poll = await createMeetingPollAs(owner, {
      termId,
      group: { type: "COMMITTEE", id },
      title: "Reunión sintética",
      dates: [todayKey()],
      startMinute: 0,
      endMinute: 1440,
    });
    const response = await saveMeetingAvailabilityAs(actor, {
      pollId: poll.id,
      slots: [0, 47],
      revision: 0,
    });
    await expect(closeMeetingPollAs(actor, poll.id)).rejects.toThrow();
    await closeMeetingPollAs(owner, poll.id);
    expect((await getMeetingPollAs(actor, poll.id)).poll.closed).toBe(true);
    await expect(
      saveMeetingAvailabilityAs(actor, { pollId: poll.id, slots: [], revision: response.revision }),
    ).rejects.toThrow();
    await withdrawAvailabilityAs(actor, { pollId: poll.id, termId, revision: response.revision });
    expect((await getMeetingPollAs(actor, poll.id)).own).toBeNull();
    const week = await saveAvailabilityAs(actor, { termId, slots: [335], revision: 0 });
    await withdrawAvailabilityAs(actor, { termId, revision: week.revision });
    expect((await getAvailabilityAs(actor)).own).toBeNull();
  });

  it.each([
    "weekly",
    "meeting",
  ] as const)("rechaza una pestaña antigua después de retirar y recrear %s", async (mode) => {
    const termId = await seedTerm();
    const personId = await seedMember("pestanas@example.test");
    await seedConsent(personId);
    const id = await seedCommittee("pestanas-horarios");
    await seedCommitteeMembership(personId, id, termId);
    const actor = { personId, ip: null };
    const poll = await createMeetingPollAs(actor, {
      termId,
      group: { type: "COMMITTEE", id },
      title: "Pestañas de prueba",
      dates: [todayKey()],
      startMinute: 0,
      endMinute: 1440,
    });
    const save = (slots: number[], revision: string | number) =>
      mode === "weekly"
        ? saveAvailabilityAs(actor, { termId, slots, revision })
        : saveMeetingAvailabilityAs(actor, { pollId: poll.id, slots, revision });
    const target = { termId, ...(mode === "meeting" ? { pollId: poll.id } : {}) };
    const first = await save([18], 0);
    await withdrawAvailabilityAs(actor, { ...target, revision: first.revision });
    await save([20], 0);
    await expect(save([18], first.revision)).rejects.toThrow();
    await expect(
      withdrawAvailabilityAs(actor, { ...target, revision: first.revision }),
    ).rejects.toThrow();
    const view =
      mode === "weekly" ? await getAvailabilityAs(actor) : await getMeetingPollAs(actor, poll.id);
    expect(view.own?.slots).toEqual([20]);
  });

  it("exporta solo la disponibilidad propia y la elimina al anonimizar", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("privacidad@example.test");
    await seedConsent(personId);
    const actor = { personId, ip: null };
    await saveAvailabilityAs(actor, { termId, slots: [0, 335], revision: 0 });
    const stranger = await seedMember("exporte-ajeno@example.test");
    expect((await exportOwnAvailabilityData(stranger)).data.weeklyAvailability).toEqual([]);
    expect((await exportOwnAvailabilityData(personId)).data.weeklyAvailability).toEqual([
      expect.objectContaining({ slots: [0, 335] }),
    ]);
    await requestDeletionAs(actor);
    await anonymizePersonAs(actor, personId);
    await expect(getAvailabilityAs(actor)).rejects.toThrow();
    await drainOutbox();
    expect((await exportOwnAvailabilityData(personId)).data.weeklyAvailability).toEqual([]);
  });

  it("la revocación de autorización quita a la persona de la comparación inmediatamente", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("autorizacion@example.test");
    const other = await seedMember("autorizacion-otro@example.test");
    const id = await seedCommittee("autorizacion-horario");
    for (const p of [personId, other]) {
      await seedConsent(p);
      await seedCommitteeMembership(p, id, termId);
    }
    const actor = { personId, ip: null };
    const response = await saveAvailabilityAs(actor, { termId, slots: [18], revision: 0 });
    await revokeConsentAs(actor, personId, "MEMBERSHIP");
    await expect(getAvailabilityAs(actor)).rejects.toThrow();
    await expect(
      saveAvailabilityAs(actor, { termId, slots: [], revision: response.revision }),
    ).rejects.toThrow();
    expect(
      (
        await getAvailabilityAs({ personId: other, ip: null }, { group: { type: "COMMITTEE", id } })
      ).comparison?.members.map((member) => member.personId),
    ).toEqual([other]);
  });

  it("rechaza bloques fuera de rango y no sobreescribe una revisión nueva", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("validacion@example.test");
    await seedConsent(personId);
    const actor = { personId, ip: null };
    for (const slots of [[-1], [336], [1.5], ["18"], Array(337).fill(0)]) {
      await expect(saveAvailabilityAs(actor, { termId, slots, revision: 0 })).rejects.toThrow();
    }
    await saveAvailabilityAs(actor, { termId, slots: [19, 18, 18], revision: 0 });
    await expect(saveAvailabilityAs(actor, { termId, slots: [], revision: 0 })).rejects.toThrow();
    expect((await getAvailabilityAs(actor)).own?.slots).toEqual([18, 19]);
  });

  it("valida fechas, límites y bloques contra la ventana concreta de la propuesta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-04-10T15:00:00Z"));
    const termId = await seedTerm();
    const personId = await seedMember("fechas@example.test");
    await seedConsent(personId);
    const id = await seedCommittee("fechas-horarios");
    await seedCommitteeMembership(personId, id, termId);
    const actor = { personId, ip: null };
    const input = {
      termId,
      group: { type: "COMMITTEE", id },
      title: "Fechas de prueba",
      dates: ["2030-04-11", "2030-04-12"],
      startMinute: 540,
      endMinute: 600,
    };
    for (const dates of [
      [],
      ["2030-04-09"],
      ["2030-07-01"],
      ["2030-02-30"],
      Array(15).fill("2030-04-11"),
    ]) {
      await expect(createMeetingPollAs(actor, { ...input, dates })).rejects.toThrow();
    }
    await expect(createMeetingPollAs(actor, { ...input, startMinute: 541 })).rejects.toThrow();
    const poll = await createMeetingPollAs(actor, input);
    for (const slots of [[17], [20], [96]]) {
      await expect(
        saveMeetingAvailabilityAs(actor, { pollId: poll.id, slots, revision: 0 }),
      ).rejects.toThrow();
    }
    const response = await saveMeetingAvailabilityAs(actor, {
      pollId: poll.id,
      slots: [18, 67],
      revision: 0,
    });
    expect((await getMeetingPollAs(actor, poll.id)).own?.slots).toEqual([18, 67]);
    vi.setSystemTime(new Date("2030-04-13T05:00:00Z"));
    expect((await getMeetingPollAs(actor, poll.id)).poll.closed).toBe(true);
    await expect(
      saveMeetingAvailabilityAs(actor, { pollId: poll.id, slots: [], revision: response.revision }),
    ).rejects.toThrow();
    vi.setSystemTime(new Date("2030-07-01T05:00:00Z"));
    await seedTerm();
    expect((await getAvailabilityAs(actor)).own).toBeNull();
    await expect(getMeetingPollAs(actor, poll.id)).rejects.toThrow();
  });

  it("permite gestionar la disponibilidad en licencia sin crear propuestas", async () => {
    const termId = await seedTerm();
    const personId = await seedPerson("licencia-horario@example.test");
    await seedMembership(personId, termId, "ON_LEAVE");
    await seedConsent(personId);
    const id = await seedCommittee("licencia-horario");
    await seedCommitteeMembership(personId, id, termId);
    const actor = { personId, ip: null };
    await saveAvailabilityAs(actor, { termId, slots: [18], revision: 0 });
    expect(
      (await getAvailabilityAs(actor, { group: { type: "COMMITTEE", id } })).comparison?.counts[18],
    ).toBe(1);
    await expect(
      createMeetingPollAs(actor, {
        termId,
        group: { type: "COMMITTEE", id },
        title: "Licencia",
        dates: [todayKey()],
        startMinute: 540,
        endMinute: 600,
      }),
    ).rejects.toThrow();
  });
});
