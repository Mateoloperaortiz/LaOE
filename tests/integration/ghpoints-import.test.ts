import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { pushPointsCredited } from "@/modules/comms/domain/events";
import { permission } from "@/modules/identity/schema";
import * as ledger from "@/modules/participation/domain/ledger";
import { checkIn, occasion, pointEntry } from "@/modules/participation/schema";
import { membership } from "@/modules/people/schema";
import { computePerson, loadPeopleFacts, loadTermFacts } from "@/modules/permanence";
import { referenceGeneralRules } from "@/modules/permanence/domain/templates";
import { permanenceRule, workGroupMembership } from "@/modules/permanence/schema";
import { applyGhImport, previewGhImport } from "../../scripts/lib/ghpoints-db";
import { type GhManifest, ghManifestSchema } from "../../scripts/lib/ghpoints-plan";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedPerson,
  seedTerm,
} from "./factories";

let termId: string, actorId: string, personId: string, m: GhManifest;
beforeEach(async () => {
  await truncateAll();
  termId = await seedTerm("2025-2");
  actorId = await seedPerson("admin@example.test");
  await seedMembership(actorId, termId);
  await getDb().insert(permission).values({ personId: actorId, code: "ADMIN" });
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
    const results = await Promise.allSettled([
      applyGhImport(m, opts(preview.planHash)),
      applyGhImport(m, opts(preview.planHash)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
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
        personId,
        termId,
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
