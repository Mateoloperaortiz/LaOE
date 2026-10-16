import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  activatePresenceNotice24hAs,
  getOccasion,
  getPresenceStreak,
  openOccasionAs,
} from "@/modules/participation";
import { occasion } from "@/modules/participation/schema";
import { setConfigAs } from "@/modules/system";
import { closeTermPoints } from "@/modules/terms";
import {
  seedAuditFact,
  seedConfig,
  seedMembershipEvent,
  seedOccasion,
  seedTerm,
  seedVeteran,
} from "../factories";
import { holdTransaction, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";

const NOW = new Date("2026-11-02T15:00:00Z");

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

describe("activación única del aviso presencial de 24 horas", () => {
  it("normaliza solo el futuro abierto desde la última apertura auténtica y protege la procedencia desconocida", async () => {
    const termId = await seedTerm();
    const startsAt = new Date("2026-11-05T15:00:00Z");
    const old = new Date("2026-10-20T15:00:00Z");
    const latest = new Date("2026-11-02T14:00:00Z");
    const reopened = await seedOccasion(termId, { startsAt, openedAt: old });
    await seedAuditFact({
      entityType: "occasion",
      entityId: reopened.id,
      action: "occasion.opened",
      at: old,
      after: { status: "OPEN" },
    });
    await seedAuditFact({
      entityType: "occasion",
      entityId: reopened.id,
      action: "occasion.opened",
      at: latest,
      after: { status: "OPEN" },
    });
    const series = await seedOccasion(termId, { startsAt, openedAt: old, status: "CLOSED" });
    await seedAuditFact({
      entityType: "occasion",
      entityId: series.id,
      action: "occasion.created",
      at: latest,
      after: { series: true },
    });
    const unknown = await seedOccasion(termId, { startsAt, openedAt: old });
    await seedAuditFact({
      entityType: "occasion",
      entityId: unknown.id,
      action: "occasion.created",
      at: old,
      after: { status: "OPEN" },
    });
    const conservative = await seedOccasion(termId, { startsAt, openedAt: latest });
    await seedAuditFact({
      entityType: "occasion",
      entityId: conservative.id,
      action: "occasion.opened",
      at: old,
      after: { status: "OPEN" },
    });
    const past = await seedOccasion(termId, {
      startsAt: new Date("2026-11-01T15:00:00Z"),
      openedAt: old,
    });
    const closedTermId = await seedTerm("2027-1");
    const closed = await seedOccasion(closedTermId, { startsAt, openedAt: old });
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, closedTermId));

    expect(await activatePresenceNotice24hAs(SYSTEM_ACTOR)).toEqual({
      effectiveAt: NOW.toISOString(),
      activated: true,
      normalized: 3,
      unknown: 1,
    });
    expect((await getOccasion(reopened.id))?.openedAt).toEqual(latest);
    expect((await getOccasion(series.id))?.openedAt).toEqual(latest);
    expect((await getOccasion(conservative.id))?.openedAt).toEqual(latest);
    expect((await getOccasion(unknown.id))?.openedAt).toBeNull();
    expect((await getOccasion(past.id))?.openedAt).toEqual(old);
    expect((await getOccasion(closed.id))?.openedAt).toEqual(old);
  });

  it("la lectura pública conserva el corte anterior antes de activar y luego aplica 24 h sin que AppConfig mueva el ancla", async () => {
    const termId = await seedTerm();
    const personId = await seedVeteran("aviso-presencial@example.test");
    const actor = { personId, ip: null };
    await seedMembershipEvent(personId, {
      from: null,
      to: "ACTIVE",
      at: new Date("2026-10-01T05:00:00Z"),
    });
    await seedConfig("gamification.launch", { at: "2026-10-01T05:00:00Z" });
    const row = await seedOccasion(termId, {
      startsAt: new Date("2026-11-05T15:00:00Z"),
      status: "DRAFT",
    });
    await openOccasionAs(SYSTEM_ACTOR, row.id, { isAdmin: true });
    vi.setSystemTime(new Date("2026-11-05T16:00:00Z"));
    expect(await getPresenceStreak(personId, termId)).toMatchObject({
      weekStatus: "PAUSED",
      weekPauseReasons: ["LATE_PUBLICATION"],
    });
    vi.setSystemTime(NOW);
    const activated = await activatePresenceNotice24hAs(SYSTEM_ACTOR);
    await setConfigAs(actor, "gamification.enabled", true);
    await setConfigAs(actor, "gamification.enabled", false);
    // Incluso una fila ajena con el mismo nombre no es la configuración propia de participation.
    await seedConfig("presenceStreak.notice24h", { effectiveAt: "2099-01-01T00:00:00Z" });
    vi.setSystemTime(new Date("2026-11-05T16:00:00Z"));
    expect(await getPresenceStreak(personId, termId)).toMatchObject({
      weekStatus: "PENDING",
      weekPauseReasons: [],
    });
    expect(await activatePresenceNotice24hAs(SYSTEM_ACTOR)).toEqual({
      ...activated,
      activated: false,
      normalized: 0,
      unknown: 0,
    });
  });

  it("dos activaciones en cola fijan una sola vigencia y los reintentos no normalizan datos nuevos", async () => {
    const [first, second] = await Promise.all([
      activatePresenceNotice24hAs(SYSTEM_ACTOR),
      activatePresenceNotice24hAs(SYSTEM_ACTOR),
    ]);
    expect([first.activated, second.activated].sort()).toEqual([false, true]);
    expect(first.effectiveAt).toBe(second.effectiveAt);
    const termId = await seedTerm();
    const openedAt = new Date("2026-11-02T15:01:00Z");
    const future = await seedOccasion(termId, {
      startsAt: new Date("2026-11-05T15:00:00Z"),
      openedAt,
    });
    vi.setSystemTime(new Date("2026-11-03T15:00:00Z"));
    expect(await activatePresenceNotice24hAs(SYSTEM_ACTOR)).toMatchObject({
      effectiveAt: NOW.toISOString(),
      activated: false,
      normalized: 0,
      unknown: 0,
    });
    expect((await getOccasion(future.id))?.openedAt).toEqual(openedAt);
  });

  it("fija la vigencia después de esperar una fila: una actividad que ya empezó conserva la regla anterior", async () => {
    const termId = await seedTerm();
    const startsAt = new Date("2026-11-02T15:01:00Z");
    const openedAt = new Date("2026-11-01T14:00:00Z");
    const row = await seedOccasion(termId, { startsAt, openedAt });
    const held = await holdTransaction((tx) =>
      tx.select().from(occasion).where(eq(occasion.id, row.id)).for("update"),
    );
    const activation = activatePresenceNotice24hAs(SYSTEM_ACTOR);
    void activation.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      vi.setSystemTime(new Date("2026-11-02T15:02:00Z"));
      held.release();
      await held.done;
      expect(await activation).toMatchObject({
        effectiveAt: "2026-11-02T15:02:00.000Z",
        activated: true,
        normalized: 0,
        unknown: 0,
      });
      expect((await getOccasion(row.id))?.openedAt).toEqual(openedAt);
    } finally {
      held.release();
      await Promise.allSettled([held.done, activation]);
    }
  });
});
