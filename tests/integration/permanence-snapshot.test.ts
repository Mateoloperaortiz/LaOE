import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { drain } from "@/jobs/poller";
import { checkInSelfAs } from "@/modules/participation";
import {
  computePerson,
  createRuleAs,
  getPersonPermanence,
  getSnapshot,
  listCompliance,
  listSnapshots,
  loadPeopleFacts,
  loadTermFacts,
  recomputeSnapshots,
  ruleInputSchema,
} from "@/modules/permanence";
import { permanenceSnapshot } from "@/modules/permanence/schema";
import { outbox } from "@/modules/system/schema";
import { closeTermPermanence, closeTermPoints } from "@/modules/terms";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedMembershipTerm,
  seedOccasion,
  seedPerson,
  seedRule,
  seedTerm,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Recompute por outbox (ADR-036 regla 5): clave por persona o por término, snapshot igual a la función
// pura, sin recalcular términos cerrados ni filas congeladas; la vista en vivo coincide con el snapshot.

async function pending(eventType: string, dedupeKey?: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(outbox)
    .where(
      and(
        eq(outbox.eventType, eventType),
        isNull(outbox.processedAt),
        dedupeKey ? eq(outbox.dedupeKey, dedupeKey) : undefined,
      ),
    );
  return row?.n ?? 0;
}

async function setup() {
  const termId = await seedTerm();
  const committeeId = await seedCommittee("a3");
  // Veterano: con la tabla general de 10 y la del comité de 60 alcanza el umbral de 60.
  const personId = await seedPerson("m@eafit.edu.co");
  await seedMembership(personId, await seedTerm("2024-2"));
  const joinedAt = new Date(Date.now() - 7 * 86_400_000);
  await seedCommitteeMembership(personId, committeeId, termId, "MIEMBRO", { joinedAt });
  await seedRule(termId, "integraciones", {
    computation: "CHECKIN_COUNT",
    weight: 10,
    params: { category: "INTEGRATION", perUnit: 2, expectedCount: 5 },
  });
  await seedRule(termId, "eventos", { committeeId, weight: 60 });
  return { termId, committeeId, personId };
}

describe("snapshot de permanencia", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("un check-in aprobado encola un solo recompute por persona y deja el snapshot igual a la función pura", async () => {
    const { termId, personId } = await setup();
    const occasion = await seedOccasion(termId, { category: "INTEGRATION", points: 0 });
    const outcome = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
    expect(outcome.ok && outcome.status).toBe("APPROVED");
    // Un solo lote del poller con el reloj fijo: el recompute que encolan los handlers cruzados nace
    // después y queda pendiente para contarlo. El drenado lo corre.
    expect((await drain(50)).failed).toBe(0);
    expect(await pending("permanence.recompute", `permanence:${termId}:${personId}`)).toBe(1);
    await drainOutbox();
    expect(await pending("permanence.recompute")).toBe(0);
    const snapshot = await getSnapshot(personId, termId);
    expect(snapshot).not.toBeNull();
    const facts = await loadTermFacts(termId);
    if (!facts || !snapshot) throw new Error("sin hechos");
    const [person] = await loadPeopleFacts(facts, [personId]);
    if (!person) throw new Error("sin persona");
    const expected = computePerson(facts, person, snapshot.computedAt);
    expect(snapshot.generalTotal).toBe(2);
    expect(snapshot.results.map((item) => item.total)).toEqual(
      expected.results.map((item) => item.total),
    );
    expect(snapshot.general[0]?.detail).toMatchObject({ type: "CHECKIN_COUNT", attended: 1 });
    const live = await getPersonPermanence(personId, termId);
    expect(live?.live).toBe(true);
    expect(live?.result.generalTotal).toBe(2);
    expect(live?.result.results[0]?.state).toBe("EN_CAMINO");
  });

  it("cambiar una regla recalcula el término entero con una sola clave", async () => {
    const { termId, personId } = await setup();
    // Veterana (entró en un término anterior) en periodo de prueba.
    const other = await seedPerson("o@eafit.edu.co");
    await seedMembership(other, await seedTerm("2024-2"));
    await seedCommitteeMembership(other, await seedCommittee("pixel"), termId);
    await seedMembershipTerm(other, termId, true);
    await createRuleAs(
      { personId: null, ip: null },
      { termId, scope: "GENERAL", committeeId: null },
      ruleInputSchema.parse({
        key: "asambleas",
        label: "Asambleas",
        weight: 10,
        computation: "MANUAL",
        params: {},
      }),
      { bypassLock: true },
    );
    expect(await pending("permanence.recompute", `permanence:${termId}:*`)).toBe(1);
    await drainOutbox();
    const snapshots = await listSnapshots(termId);
    expect(snapshots.map((item) => item.personId).sort()).toEqual([other, personId].sort());
    expect(snapshots.find((item) => item.personId === other)).toMatchObject({ probation: true });
    expect(snapshots.find((item) => item.personId === other)?.results[0]).toMatchObject({
      condition: "PROBATION",
      threshold: 80,
    });
    const rows = await listCompliance(termId, "prueba");
    expect(rows.map((row) => row.personId)).toEqual([other]);
    expect((await listCompliance(termId)).length).toBe(2);
  });

  it("el programado diario recalcula el término actual para que lo posible envejezca", async () => {
    const { termId, personId } = await setup();
    expect(await getSnapshot(personId, termId)).toBeNull();
    await enqueueEvent(getDb(), { type: "permanence.daily", payload: {} });
    await drainOutbox();
    expect(await pending("permanence.daily")).toBe(0);
    expect(await getSnapshot(personId, termId)).not.toBeNull();
  });

  it("un término con la permanencia cerrada no recalcula y las filas congeladas no cambian", async () => {
    const { termId, personId } = await setup();
    expect(await recomputeSnapshots(termId)).toBe(1);
    await getDb()
      .update(permanenceSnapshot)
      .set({ frozenAt: new Date() })
      .where(eq(permanenceSnapshot.personId, personId));
    const occasion = await seedOccasion(termId, {
      category: "INTEGRATION",
      points: 0,
      status: "CLOSED",
    });
    await seedCheckIn(occasion.id, personId);
    expect(await recomputeSnapshots(termId, personId)).toBe(1);
    expect((await getSnapshot(personId, termId))?.generalTotal).toBe(0);
    const frozen = await getPersonPermanence(personId, termId);
    expect(frozen?.live).toBe(false);
    await runCommand(SYSTEM_ACTOR, async (ctx) => {
      await closeTermPoints(ctx, termId);
      await closeTermPermanence(ctx, termId);
    });
    expect(await recomputeSnapshots(termId)).toBe(0);
  });
});
