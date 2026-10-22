import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { pushPointsCredited } from "@/modules/comms/domain/events";
import {
  excuseCheckIn,
  findCheckIn,
  listTermAssemblies,
  loadGamificationSettings,
} from "@/modules/participation";
import * as ledger from "@/modules/participation/domain/ledger";
import { checkIn, occasion, pointEntry } from "@/modules/participation/schema";
import { membership } from "@/modules/people/schema";
import { computePerson, loadPeopleFacts, loadTermFacts } from "@/modules/permanence";
import { referenceGeneralRules } from "@/modules/permanence/domain/templates";
import { permanenceRule, workGroupMembership } from "@/modules/permanence/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { applyGhImport, previewGhImport } from "../../scripts/lib/ghpoints-db";
import { GhImportError, type GhManifest, ghManifestSchema } from "../../scripts/lib/ghpoints-plan";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedPermission,
  seedPerson,
  seedTerm,
} from "../factories";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

let termId: string, actorId: string, personId: string, m: GhManifest;
beforeEach(async () => {
  await truncateAll();
  termId = await seedTerm("2025-2");
  actorId = await seedPerson("admin@example.test");
  await seedMembership(actorId, termId);
  await seedPermission(actorId, "ADMIN");
  personId = await seedPerson("person@example.test");
  await seedMembership(personId, termId, "ON_LEAVE");
  m = ghManifestSchema.parse({
    format: "oe-ghpoints/2",
    batchId: "synthetic-batch",
    termCode: "2025-2",
    targetTermId: termId,
    allowOnLeavePoints: true,
    sources: [{ key: "SOURCE", path: "source.txt", sha256: "0".repeat(64) }],
    activities: [
      {
        key: "ACTIVITY",
        title: "Actividad sintética",
        type: "DECORACION",
        date: "2025-09-08",
        endDate: "2025-09-10",
        datePrecision: "DAY",
        newMembersOnly: true,
        existingOccasionId: null,
        sourceKey: "SOURCE",
        evidenceEvaluation: "GOOD",
        participants: [{ recordId: "RECORD", email: "person@example.test", sourceRow: 1 }],
      },
    ],
    permanenceRules: referenceGeneralRules(3),
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);
const opts = (hash: string, skipBlocked = false) => ({
  actorId,
  environment: "test",
  planHash: hash,
  skipBlocked,
  evidenceKeys: { SOURCE: "imports/test/source.txt" },
  manifestKey: "imports/test/manifest.json",
});

describe("importación administrativa de GH Points", () => {
  it("importa completas y parciales por separado, conserva ambas fuentes y permite reintentar", async () => {
    const otherId = await seedPerson("other@example.test");
    await seedMembership(otherId, termId);
    const base = first(m.activities);
    m.sources.push({ key: "SECOND", path: "second.xlsx", sha256: "1".repeat(64) });
    m.activities = [
      {
        ...base,
        type: "ASAMBLEA",
        assemblyKind: "ORDINARY",
        newMembersOnly: false,
        endDate: base.date,
        participants: [
          {
            recordId: "PARTIAL-RECORD",
            email: "person@example.test",
            sourceRow: 7,
            attendanceExtent: "PARTIAL",
            attendanceEvidence: [
              { list: "SECOND", sourceKey: "SECOND", sourceSheet: "Segunda", sourceRow: 7 },
            ],
          },
          {
            recordId: "FULL-RECORD",
            email: "other@example.test",
            sourceRow: 8,
            attendanceExtent: "FULL",
            attendanceEvidence: [
              { list: "FIRST", sourceKey: "SOURCE", sourceSheet: "Primera", sourceRow: 8 },
              { list: "SECOND", sourceKey: "SECOND", sourceSheet: "Segunda", sourceRow: 9 },
            ],
          },
        ],
      },
    ];
    const preview = await previewGhImport(m, "test");
    expect(preview.summary).toMatchObject({
      rowsToAdd: 2,
      fullToAdd: 1,
      partialToAdd: 1,
      pointsToAdd: 0,
    });
    const options = {
      ...opts(preview.planHash),
      evidenceKeys: { SOURCE: "imports/test/source.txt", SECOND: "imports/test/second.xlsx" },
    };
    await applyGhImport(m, options);
    const assembly = first(await listTermAssemblies(termId));
    expect(await findCheckIn(assembly.id, personId)).toMatchObject({
      status: "APPROVED",
      attendanceExtent: "PARTIAL",
      attendanceList: "SECOND",
    });
    expect(await findCheckIn(assembly.id, otherId)).toMatchObject({
      status: "APPROVED",
      attendanceExtent: "FULL",
      attendanceList: null,
    });
    const audit = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "checkin.imported"));
    expect(audit.map((row) => row.after)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          personId,
          attendanceExtent: "PARTIAL",
          attendanceList: "SECOND",
          attendanceEvidence: [
            {
              list: "SECOND",
              sourceKey: "SECOND",
              sourceSheet: "Segunda",
              sourceRow: 7,
              fileKey: "imports/test/second.xlsx",
            },
          ],
        }),
        expect.objectContaining({
          personId: otherId,
          attendanceExtent: "FULL",
          attendanceList: null,
          attendanceEvidence: [
            {
              list: "FIRST",
              sourceKey: "SOURCE",
              sourceSheet: "Primera",
              sourceRow: 8,
              fileKey: "imports/test/source.txt",
            },
            {
              list: "SECOND",
              sourceKey: "SECOND",
              sourceSheet: "Segunda",
              sourceRow: 9,
              fileKey: "imports/test/second.xlsx",
            },
          ],
        }),
      ]),
    );
    const events = await getDb()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "checkin.approved"));
    expect(events.map((row) => row.payload)).toEqual([
      expect.objectContaining({ personId: otherId, kind: "ASSEMBLY", source: "IMPORT", points: 0 }),
    ]);
    const partials = await getDb()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "checkin.partial"));
    expect(partials.map((row) => row.payload)).toEqual([
      expect.objectContaining({ personId, attendanceExtent: "PARTIAL", attendanceList: "SECOND" }),
    ]);
    expect(await getDb().select().from(pointEntry)).toHaveLength(0);
    const recheck = await previewGhImport(m, "test");
    expect(recheck.summary).toMatchObject({ rowsToAdd: 0, rowsExisting: 2, rowsBlocked: 0 });
    expect((await applyGhImport(m, { ...options, planHash: recheck.planHash })).applied).toBe(
      false,
    );
    expect(await listTermAssemblies(termId)).toHaveLength(1);
    const settings = await loadGamificationSettings();
    await runCommand({ personId: actorId, ip: null }, (ctx) =>
      excuseCheckIn(
        ctx,
        { occasionId: assembly.id, personId, reason: "Excusa sintética aceptada" },
        { settings },
      ),
    );
    const excused = await findCheckIn(assembly.id, personId);
    expect(excused).toMatchObject({
      status: "EXCUSED",
      attendanceExtent: "PARTIAL",
      attendanceList: "SECOND",
      reason: "Excusa sintética aceptada",
    });
    const afterExcuse = await previewGhImport(m, "test");
    expect(afterExcuse.summary).toMatchObject({ rowsExisting: 2, rowsToAdd: 0, rowsBlocked: 0 });
    expect((await applyGhImport(m, { ...options, planHash: afterExcuse.planHash })).applied).toBe(
      false,
    );
    expect(await findCheckIn(assembly.id, personId)).toEqual(excused);
  });
  it("tres asambleas aportan 10% sin créditos, conservan hoja/fila y se pueden reconsultar sin duplicar", async () => {
    await getDb()
      .update(membership)
      .set({ status: "ACTIVE" })
      .where(eq(membership.personId, personId));
    const committeeId = await seedCommittee("assembly-committee");
    await seedCommitteeMembership(personId, committeeId, termId);
    const base = first(m.activities);
    m.activities = [1, 2, 3].map((i) => ({
      ...base,
      key: `ASSEMBLY-${i}`,
      title: `Asamblea sintética ${i}`,
      type: "ASAMBLEA",
      assemblyKind: "ORDINARY",
      newMembersOnly: false,
      date: `2025-08-0${i}`,
      endDate: `2025-08-0${i}`,
      sourceSheet: `Hoja ${i}`,
      participants: [
        { recordId: `ASSEMBLY-RECORD-${i}`, email: "person@example.test", sourceRow: 7 },
      ],
    }));
    const preview = await previewGhImport(m, "test");
    expect(preview.summary).toMatchObject({ rowsToAdd: 3, pointsToAdd: 0 });
    await applyGhImport(m, opts(preview.planHash));
    expect(await getDb().select().from(pointEntry)).toHaveLength(0);
    expect(await getDb().select().from(workGroupMembership)).toHaveLength(0);
    const assemblies = await getDb().select().from(occasion);
    expect(assemblies).toHaveLength(3);
    for (const a of assemblies)
      expect(a).toMatchObject({
        kind: "ASSEMBLY",
        assemblyKind: "ORDINARY",
        points: 0,
        status: "CLOSED",
      });
    const audit = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "checkin.imported"));
    expect(audit).toHaveLength(3);
    expect(audit.map((a) => (a.after as { sourceSheet: string }).sourceSheet).sort()).toEqual([
      "Hoja 1",
      "Hoja 2",
      "Hoja 3",
    ]);
    for (const a of audit) expect(a.after).toMatchObject({ sourceRow: 7 });
    const events = await getDb()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "checkin.approved"));
    expect(events).toHaveLength(3);
    for (const e of events)
      expect(e.payload).toMatchObject({ kind: "ASSEMBLY", source: "IMPORT", points: 0 });
    const facts = await loadTermFacts(termId);
    if (!facts) throw Error("Faltan hechos");
    const result = computePerson(
      facts,
      first(await loadPeopleFacts(facts, [personId])),
      new Date("2025-10-01T15:00:00Z"),
    );
    expect(result.general.find((r) => r.key === "asambleas")?.achieved).toBe(10);
    expect(result.mandatory.attended.ordinary).toBe(3);
    const recheck = await previewGhImport(m, "test");
    expect(recheck.summary).toMatchObject({
      rowsExisting: 3,
      rowsToAdd: 0,
      rowsBlocked: 0,
      pointsToAdd: 0,
    });
    expect((await applyGhImport(m, opts(recheck.planHash))).applied).toBe(false);
    expect(await getDb().select().from(checkIn)).toHaveLength(3);
  });
  it("las evidencias importadas producen 4% de juegos, 5% de apoyo y 10% de decoración en el cálculo real", async () => {
    await getDb()
      .update(membership)
      .set({ status: "ACTIVE" })
      .where(eq(membership.personId, personId));
    const committeeId = await seedCommittee("synthetic");
    await seedCommitteeMembership(personId, committeeId, termId);
    const base = first(m.activities);
    for (let i = 1; i <= 5; i++)
      m.activities.push({
        ...base,
        key: `ACTIVITY-${i}`,
        title: `Actividad sintética ${i}`,
        type: i <= 3 ? "PARTIDO" : "JUEGOS",
        newMembersOnly: false,
        date: `2025-08-0${i}`,
        endDate: `2025-08-0${i}`,
        participants: [{ recordId: `RECORD-${i}`, email: "person@example.test", sourceRow: i + 1 }],
      });
    const preview = await previewGhImport(m, "test");
    await applyGhImport(m, opts(preview.planHash));
    const facts = await loadTermFacts(termId);
    if (!facts) throw new Error("Faltan hechos");
    const personFacts = first(await loadPeopleFacts(facts, [personId]));
    const result = computePerson(facts, personFacts, new Date("2025-10-01T15:00:00Z"));
    expect(result.generalTotal).toBe(19);
    const values = result.general
      .filter((r) => r.achieved > 0)
      .map((r) => r.achieved)
      .sort((a, b) => a - b);
    expect(values).toEqual([4, 5, 10]);
  });
  it("la vista previa no escribe; importa licencia, evidencia evaluada y reglas, y el reintento no duplica", async () => {
    const preview = await previewGhImport(m, "test");
    expect(preview.summary.pointsToAdd).toBe(30);
    expect(await getDb().select().from(occasion)).toHaveLength(0);
    const applied = await applyGhImport(m, opts(preview.planHash));
    expect(applied.applied).toBe(true);
    const credits = await getDb().select().from(pointEntry);
    expect(credits).toHaveLength(1);
    expect(credits[0]?.points).toBe(30);
    expect((await getDb().select().from(checkIn))[0]?.source).toBe("IMPORT");
    expect((await getDb().select().from(workGroupMembership))[0]?.evaluation).toBe("GOOD");
    expect(await getDb().select().from(permanenceRule)).toHaveLength(9);
    expect(
      (await getDb().select().from(membership).where(eq(membership.personId, personId)))[0]?.status,
    ).toBe("ON_LEAVE");
    const next = await previewGhImport(m, "test");
    expect(next.summary.rowsExisting).toBe(1);
    expect((await applyGhImport(m, opts(next.planHash))).applied).toBe(false);
    expect(await getDb().select().from(pointEntry)).toHaveLength(1);
  });
  it("reconsulta elegibilidad y no aplica una vista previa obsoleta", async () => {
    const preview = await previewGhImport(m, "test");
    await getDb()
      .update(membership)
      .set({ status: "ACTIVE" })
      .where(eq(membership.personId, personId));
    // El cambio no altera elegibilidad: después se elimina la condición de nuevo, que sí afecta al plan.
    const oldTerm = await seedTerm("2025-1");
    await getDb()
      .update(membership)
      .set({ firstTermId: oldTerm })
      .where(eq(membership.personId, personId));
    await expect(applyGhImport(m, opts(preview.planHash))).rejects.toThrow("Cambió");
    expect(await getDb().select().from(occasion)).toHaveLength(0);
  });
  it("retiene desconocidos y exige optar por omitirlos; después admite solo la fila recién registrada", async () => {
    first(m.activities).participants.push({
      recordId: "MISSING-RECORD",
      email: "missing@example.test",
      sourceRow: 2,
    });
    const preview = await previewGhImport(m, "test");
    expect(preview.summary.rowsBlocked).toBe(1);
    await expect(applyGhImport(m, opts(preview.planHash))).rejects.toThrow("retenidas");
    await applyGhImport(m, opts(preview.planHash, true));
    const id = await seedPerson("missing@example.test");
    await seedMembership(id, termId);
    const updated = await previewGhImport(m, "test");
    expect(updated.summary).toMatchObject({ rowsToAdd: 1, rowsExisting: 1, rowsBlocked: 0 });
    await applyGhImport(m, opts(updated.planHash));
    expect(await getDb().select().from(pointEntry)).toHaveLength(2);
  });
  it("dos cargas concurrentes del mismo plan no duplican puntos", async () => {
    const preview = await previewGhImport(m, "test");
    await warmPool();
    const results = await Promise.allSettled([
      applyGhImport(m, opts(preview.planHash)),
      applyGhImport(m, opts(preview.planHash)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // La que esperó el candado de las tablas ya ve la carga de la otra: la rechaza el plan, no un índice.
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected[0]?.reason).toBeInstanceOf(GhImportError);
    expect(await getDb().select().from(pointEntry)).toHaveLength(1);
  });
  it("revierte todo el lote si falla un crédito después de otra asistencia", async () => {
    const id = await seedPerson("second@example.test");
    await seedMembership(id, termId);
    first(m.activities).participants.push({
      recordId: "SECOND-RECORD",
      email: "second@example.test",
      sourceRow: 2,
    });
    const original = ledger.creditCheckIn;
    vi.spyOn(ledger, "creditCheckIn")
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error("Fallo sintético"));
    const preview = await previewGhImport(m, "test");
    await expect(applyGhImport(m, opts(preview.planHash))).rejects.toThrow("Fallo sintético");
    expect(await getDb().select().from(pointEntry)).toHaveLength(0);
    expect(await getDb().select().from(occasion)).toHaveLength(0);
    expect(await getDb().select().from(permanenceRule)).toHaveLength(0);
  });
  it("requiere ADMIN y omite notificaciones de créditos históricos", async () => {
    const preview = await previewGhImport(m, "test");
    await expect(
      applyGhImport(m, { ...opts(preview.planHash), actorId: personId }),
    ).rejects.toThrow("ADMIN");
    await expect(
      pushPointsCredited({
        occasionId: "synthetic",
        occasionTitle: "Actividad sintética",
        personId,
        termId,
        category: "OTHER",
        kind: "ACTIVITY",
        points: 30,
        source: "IMPORT",
      }),
    ).resolves.toBeNull();
  });
});

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("Falta dato sintético");
  return item;
}
