import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { drain } from "@/jobs/poller";
import "@/modules/crm/jobs";
import "@/modules/identity/jobs";
import {
  addNote,
  editNote,
  latestContact,
  listInteractions,
} from "@/modules/crm/domain/interactions";
import { completeTask, countOpenTasksFor, createTask, listTasks } from "@/modules/crm/domain/tasks";
import { interaction, task } from "@/modules/crm/schema";
import { setCommitteeMemberships } from "@/modules/people/domain/committee-memberships";
import { recordConsent } from "@/modules/people/domain/consents";
import { changeMembershipStatus, endMembership } from "@/modules/people/domain/membership";
import { listPeople } from "@/modules/people/domain/persons";
import {
  createSegment,
  findPeopleByFilter,
  getSegment,
  segmentFilterSchema,
} from "@/modules/people/domain/segments";
import { createTag, listPersonTags, setPersonTags } from "@/modules/people/domain/tags";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { truncateAll } from "./db";
import { leaveUntilSoon, seedCommittee, seedMember, seedTerm } from "./factories";

const db = () => getDb();

describe("línea de tiempo por outbox", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("un cambio de estado produce exactamente una interacción aunque el evento se procese dos veces", async () => {
    const adminId = await seedMember("admin@eafit.edu.co", { firstName: "Ada", lastName: "Admin" });
    const personId = await seedMember("miembro@eafit.edu.co");
    await runCommand({ personId: adminId }, (ctx) =>
      changeMembershipStatus(ctx, personId, {
        to: "ON_LEAVE",
        reason: "Intercambio",
        leaveUntil: leaveUntilSoon(),
      }),
    );
    await drain(20);
    await drain(20);
    const timeline = await listInteractions(personId);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      kind: "MEMBERSHIP",
      actorName: "Ada Admin",
      summary: "Estado cambió de Activo a En licencia: Intercambio",
    });
    // Misma referencia del outbox, otra vez: no duplica.
    const [row] = await db().select().from(interaction);
    await db()
      .insert(interaction)
      .values({
        personId,
        kind: "MEMBERSHIP",
        refType: row?.refType,
        refId: row?.refId,
        summary: "repetida",
      })
      .onConflictDoNothing();
    const [total] = await db().select({ n: count() }).from(interaction);
    expect(total?.n).toBe(1);
    expect(await latestContact(personId)).not.toBeNull();
  });

  it("las notas las edita solo su autor y las tareas se cierran; salir borra las tareas", async () => {
    const adaId = await seedMember("ada@eafit.edu.co", { firstName: "Ada", lastName: "Admin" });
    const benId = await seedMember("ben@eafit.edu.co", { firstName: "Ben", lastName: "Admin" });
    const personId = await seedMember("persona@eafit.edu.co");
    const note = await runCommand({ personId: adaId }, (ctx) =>
      addNote(ctx, personId, "Primera línea\n\nDetalle"),
    );
    await expect(
      runCommand({ personId: benId }, (ctx) => editNote(ctx, note.id, "Otra")),
    ).rejects.toBeInstanceOf(DomainError);
    await runCommand({ personId: adaId }, (ctx) => editNote(ctx, note.id, "Corregida"));
    const notes = await listInteractions(personId, "NOTE");
    expect(notes[0]).toMatchObject({ summary: "Corregida", body: "Corregida" });
    expect(notes[0]?.editedAt).toBeInstanceOf(Date);

    const created = await runCommand({ personId: adaId }, (ctx) =>
      createTask(ctx, { title: "Llamar", kind: "GENERAL", assigneeId: adaId, personId }),
    );
    await runCommand({ personId: adaId }, (ctx) =>
      createTask(ctx, { title: "Sin dueño", kind: "GENERAL", personId }),
    );
    expect(
      (await listTasks({ q: "", assignee: "mine", actorId: adaId, page: 1, pageSize: 10 })).total,
    ).toBe(1);
    expect(
      (await listTasks({ q: "", assignee: "mine", actorId: benId, page: 1, pageSize: 10 })).total,
    ).toBe(0);
    expect((await listTasks({ q: "", assignee: "unassigned", page: 1, pageSize: 10 })).total).toBe(
      1,
    );
    expect(await countOpenTasksFor(personId)).toBe(2);
    await runCommand({ personId: adaId }, (ctx) => completeTask(ctx, created.id));
    expect(await countOpenTasksFor(personId)).toBe(1);
    expect(
      (await listTasks({ q: "", status: "DONE", page: 1, pageSize: 10 })).rows[0]?.assigneeName,
    ).toBe("Ada Admin");

    await runCommand({ personId: adaId }, (ctx) =>
      endMembership(ctx, personId, {
        endReason: "RESIGNATION",
        memorialConsent: true,
        contactConsent: false,
      }),
    );
    await drain(20);
    const [remaining] = await db()
      .select({ n: count() })
      .from(task)
      .where(eq(task.personId, personId));
    expect(remaining?.n).toBe(0);
    const timeline = await listInteractions(personId);
    expect(timeline.map((item) => item.kind)).toContain("MEMBERSHIP");
    expect(timeline.map((item) => item.kind)).toContain("CONSENT");
  });
});

describe("etiquetas y segmentos", () => {
  beforeEach(truncateAll);

  it("un segmento devuelve las personas esperadas y el listado lo usa como filtro", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3");
    const pixel = await seedCommittee("pixel");
    const ana = await seedMember("ana@eafit.edu.co", { firstName: "Ana", lastName: "Arango" });
    const bruno = await seedMember("bruno@eafit.edu.co", {
      firstName: "Bruno",
      lastName: "Betancur",
    });
    const cami = await seedMember("cami@eafit.edu.co", {
      firstName: "Camila",
      lastName: "Cadavid",
    });
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setCommitteeMemberships(ctx, ana, termId, [
        { committeeId: a3, roleCode: "GENERAL", transferredIn: false },
      ]),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setCommitteeMemberships(ctx, bruno, termId, [
        { committeeId: a3, roleCode: "MIEMBRO", transferredIn: false },
      ]),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setCommitteeMemberships(ctx, cami, termId, [
        { committeeId: pixel, roleCode: "MIEMBRO", transferredIn: false },
      ]),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      recordConsent(ctx, bruno, { purpose: "COMMUNICATIONS", source: "SELF" }),
    );
    const vip = await runCommand(SYSTEM_ACTOR, (ctx) => createTag(ctx, { name: "VIP" }));
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) => createTag(ctx, { name: "vip" })),
    ).rejects.toBeInstanceOf(DomainError);
    await runCommand(SYSTEM_ACTOR, (ctx) => setPersonTags(ctx, ana, [vip.id]));
    expect((await listPersonTags(ana)).map((item) => item.name)).toEqual(["VIP"]);

    const filter = segmentFilterSchema.parse({
      statuses: ["ACTIVE"],
      committeeIds: [a3],
      consent: "COMMS_NO",
    });
    expect(await findPeopleByFilter(filter)).toEqual([ana]);
    expect(
      await findPeopleByFilter(
        segmentFilterSchema.parse({ roleCodes: ["GENERAL"], tagIds: [vip.id] }),
      ),
    ).toEqual([ana]);
    expect((await findPeopleByFilter(segmentFilterSchema.parse({ entry: "NEW" }))).length).toBe(3);
    expect(await findPeopleByFilter(segmentFilterSchema.parse({ entry: "VETERAN" }))).toEqual([]);

    const created = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createSegment(ctx, { name: "A3 sin comunicaciones", ...filter }),
    );
    const segment = await getSegment(created.id);
    expect(segment?.count).toBe(1);
    const listed = await listPeople({
      q: "",
      personIds: await findPeopleByFilter(segment?.filter ?? filter),
      page: 1,
      pageSize: 10,
    });
    expect(listed.rows.map((row) => row.email)).toEqual(["ana@eafit.edu.co"]);
    await runCommand(SYSTEM_ACTOR, (ctx) => setPersonTags(ctx, ana, []));
    expect(await listPersonTags(ana)).toEqual([]);
  });
});
