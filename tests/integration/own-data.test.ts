import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { drainOutbox } from "../helpers/outbox";
import "@/modules/crm/jobs";
import { listInteractions } from "@/modules/crm/domain/interactions";
import { task } from "@/modules/crm/schema";
import { recordConsent } from "@/modules/people/domain/consents";
import {
  listDirectory,
  listInternalCommittees,
  listInternalRoster,
} from "@/modules/people/domain/directory";
import {
  collectPersonalData,
  requestDeletion,
  setOwnPhoto,
  updateOwnContact,
} from "@/modules/people/domain/own-data";
import { person } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { addBusinessDays } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMediaAsset,
  seedMember,
  seedMembership,
  seedPerson,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

const db = () => getDb();

describe("datos propios desde Ajustes", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("edita el celular y el correo personal, audita y deja huella en la línea de tiempo", async () => {
    const me = await seedMember("yo@eafit.edu.co", { firstName: "Yo", lastName: "Misma" });
    await runCommand({ personId: me, ip: null }, (ctx) =>
      updateOwnContact(ctx, me, { phone: "300 123 4567", personalEmail: "Yo@Gmail.com" }),
    );
    const [row] = await db().select().from(person).where(eq(person.id, me));
    expect(row).toMatchObject({ phone: "+573001234567", personalEmail: "yo@gmail.com" });
    const audits = await db().select().from(auditLog).where(eq(auditLog.entityId, me));
    expect(audits.map((entry) => entry.action)).toContain("person.updated");
    await drainOutbox();
    const timeline = await listInteractions(me);
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    await expect(
      runCommand({ personId: me, ip: null }, (ctx) =>
        updateOwnContact(ctx, me, { phone: "12", personalEmail: "" }),
      ),
    ).rejects.toThrow(DomainError);
  });

  it("solo acepta como foto un medio privado que la misma persona subió a photos/<id>/", async () => {
    const me = await seedMember("foto@eafit.edu.co");
    const other = await seedMember("otra@eafit.edu.co");
    const own = await seedMediaAsset(`photos/${me}/abcdefghij.jpg`, {
      originalFilename: "yo.jpg",
      uploadedById: me,
    });
    const foreign = await seedMediaAsset(`photos/${other}/abcdefghij.jpg`, {
      originalFilename: "otra.jpg",
      uploadedById: other,
    });
    await expect(
      runCommand({ personId: me, ip: null }, (ctx) => setOwnPhoto(ctx, me, foreign)),
    ).rejects.toThrow(DomainError);
    await runCommand({ personId: me, ip: null }, (ctx) => setOwnPhoto(ctx, me, own));
    const [row] = await db()
      .select({ photo: person.photoAssetId })
      .from(person)
      .where(eq(person.id, me));
    expect(row?.photo).toBe(own);
    await runCommand({ personId: me, ip: null }, (ctx) => setOwnPhoto(ctx, me, null));
    const [cleared] = await db()
      .select({ photo: person.photoAssetId })
      .from(person)
      .where(eq(person.id, me));
    expect(cleared?.photo).toBeNull();
  });

  it("la solicitud de eliminación abre una sola tarea para GH con vencimiento a 15 días hábiles", async () => {
    const me = await seedMember("borrar@eafit.edu.co", { firstName: "Bea", lastName: "Borrar" });
    const first = await runCommand({ personId: me, ip: null }, (ctx) => requestDeletion(ctx, me));
    expect(first.created).toBe(true);
    const second = await runCommand({ personId: me, ip: null }, (ctx) => requestDeletion(ctx, me));
    expect(second.created).toBe(false);
    expect(second.requestedAt.getTime()).toBe(first.requestedAt.getTime());
    await drainOutbox();
    const tasks = await db()
      .select()
      .from(task)
      .where(and(eq(task.personId, me), eq(task.kind, "DELETION_REQUEST")));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toContain("Bea Borrar");
    expect(tasks[0]?.assigneeId).toBeNull();
    const expected = addBusinessDays(first.requestedAt, 15).getTime();
    expect(Math.abs((tasks[0]?.dueAt?.getTime() ?? 0) - expected)).toBeLessThan(60_000);
    const data = await collectPersonalData(me);
    expect(data?.person).toMatchObject({ email: "borrar@eafit.edu.co" });
    expect(data?.person).not.toHaveProperty("sessionsRevokedAt");
    expect(data?.consents).toHaveLength(5);
  });
});

describe("directorio y comités internos", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("lista miembros vivos con sus comités del término, filtra por comité y solo da la foto con consentimiento", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const ana = await seedMember("ana@eafit.edu.co", { firstName: "Ana", lastName: "Arango" });
    const bruno = await seedMember("bruno@eafit.edu.co", {
      firstName: "Bruno",
      lastName: "Betancur",
    });
    const inactive = await seedPerson("fuera@eafit.edu.co", { stage: "ALUMNI" });
    await seedMembership(inactive, termId, "INACTIVE");
    await seedCommitteeMembership(ana, a3, termId, "GENERAL");
    await seedCommitteeMembership(bruno, a3, termId);
    await seedCommitteeMembership(bruno, pixel, termId);
    await db().update(person).set({ photoAssetId: "foto-ana" }).where(eq(person.id, ana));
    await db().update(person).set({ photoAssetId: "foto-bruno" }).where(eq(person.id, bruno));
    await runCommand({ personId: ana, ip: null }, (ctx) =>
      recordConsent(ctx, ana, { purpose: "DIRECTORY_PHOTO", source: "SELF" }),
    );

    const all = await listDirectory({ q: "", committeeId: null, page: 1, pageSize: 10 });
    expect(all.total).toBe(2);
    expect(all.rows.map((row) => row.fullName)).toEqual(["Ana Arango", "Bruno Betancur"]);
    expect(all.rows[0]?.photoAssetId).toBe("foto-ana");
    expect(all.rows[1]?.photoAssetId).toBeNull();
    expect(all.rows[1]?.committees.map((item) => item.name)).toEqual(["A3", "PIXEL"]);
    expect(JSON.stringify(all)).not.toContain("@eafit.edu.co");

    const onlyPixel = await listDirectory({ q: "", committeeId: pixel, page: 1, pageSize: 10 });
    expect(onlyPixel.rows.map((row) => row.fullName)).toEqual(["Bruno Betancur"]);
    const byName = await listDirectory({ q: "aran", committeeId: null, page: 1, pageSize: 10 });
    expect(byName.rows.map((row) => row.fullName)).toEqual(["Ana Arango"]);

    const committees = await listInternalCommittees();
    expect(committees.map((item) => [item.slug, item.memberCount])).toEqual([
      ["a3", 2],
      ["pixel", 1],
    ]);
    const roster = await listInternalRoster("a3");
    expect(roster?.members.map((member) => [member.fullName, member.roleCode])).toEqual([
      ["Ana Arango", "GENERAL"],
      ["Bruno Betancur", "MIEMBRO"],
    ]);
    expect(await listInternalRoster("no-existe")).toBeNull();
  });
});
