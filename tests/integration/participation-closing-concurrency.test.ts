import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { type CommandContext, runCommand } from "@/db/tx";
import { reviewParticipation } from "@/modules/participation/domain/challenge-participation";
import { getTermStanding } from "@/modules/participation/domain/closing";
import {
  adjustPointsAs,
  cancelOccasionAs,
  closeTermPointsAs,
  createOccasionSeriesAs,
  decideCheckInAs,
  hostCheckInAs,
  openOccasionAs,
} from "@/modules/participation/domain/commands";
import { adjustPoints, balanceFor } from "@/modules/participation/domain/ledger";
import { loadGamificationSettings } from "@/modules/participation/domain/member-context";
import { openOccasion } from "@/modules/participation/domain/occasions";
import {
  challengeParticipation,
  checkIn,
  occasion,
  pointEntry,
  reward,
  termStanding,
} from "@/modules/participation/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { closeTermPoints, getTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedChallenge,
  seedCheckIn,
  seedCommittee,
  seedMember,
  seedOccasion,
  seedParticipation,
  seedTerm,
} from "./factories";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Mantiene una mutación sin confirmar hasta liberar la barrera, sin pausas basadas en tiempo. */
async function holdCommand(personId: string, command: (ctx: CommandContext) => Promise<unknown>) {
  const ready = deferred<number>();
  const release = deferred<void>();
  const done = runCommand({ personId }, async (ctx) => {
    await command(ctx);
    const result = await ctx.tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    ready.resolve(result.rows[0]?.pid ?? 0);
    await release.promise;
  });
  void done.catch(ready.reject);
  return { pid: await ready.promise, release: () => release.resolve(), done };
}

/** Espera evidencia de PostgreSQL de que el cierre está detrás de la transacción indicada. */
async function blockedBy(pid: number): Promise<number[]> {
  const result = await getDb().execute<{ pid: number }>(sql`
    select pid from pg_stat_activity
    where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))
  `);
  return result.rows.map((row) => row.pid);
}

describe("cierre transaccional de participación", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("espera un crédito en curso y lo incluye en el ranking y el total congelados", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("cierre-credito@eafit.edu.co");
    const held = await holdCommand(personId, (ctx) =>
      adjustPoints(ctx, { personId, termId, points: 6, reason: "Crédito sintético en curso" }),
    );
    const closing = closeTermPointsAs({ personId }, termId);
    void closing.catch(() => undefined);
    try {
      await expect.poll(async () => (await blockedBy(held.pid)).length).toBeGreaterThan(0);
      held.release();
      await Promise.all([held.done, closing]);
      const standing = await getTermStanding(termId);
      expect(standing?.stats.pointsAwarded).toBe(6);
      expect(standing?.topNew).toEqual([expect.objectContaining({ personId, total: 6, rank: 1 })]);
      expect(await balanceFor(personId, termId)).toBe(6);
    } finally {
      held.release();
      await Promise.allSettled([held.done, closing]);
    }
  });

  it("un crédito que llega después de obtener exclusividad se rechaza sin efectos", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("cierre-tarde@eafit.edu.co");
    const held = await holdCommand(personId, (ctx) => closeTermPoints(ctx, termId));
    const late = adjustPointsAs(
      { personId },
      { personId, termId, points: 5, reason: "Crédito sintético tardío" },
    );
    const result = late.then(
      () => null,
      (error: unknown) => error,
    );
    try {
      await expect.poll(async () => (await blockedBy(held.pid)).length).toBeGreaterThan(0);
      held.release();
      await held.done;
      expect(await result).toEqual(expect.objectContaining({ message: t("T-629") }));
      expect((await getTerm(termId))?.pointsClosedAt).toBeInstanceOf(Date);
      expect(await getDb().select().from(pointEntry)).toHaveLength(0);
      expect(
        await getDb().select().from(auditLog).where(eq(auditLog.action, "points.adjusted")),
      ).toHaveLength(0);
      expect(
        await getDb().select().from(outbox).where(eq(outbox.eventType, "points.adjusted")),
      ).toHaveLength(0);
    } finally {
      held.release();
      await Promise.allSettled([held.done, late]);
    }
  });

  it("permite dos escritores del mismo término a la vez", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("cierre-compartido@eafit.edu.co");
    const held = await holdCommand(personId, (ctx) =>
      adjustPoints(ctx, { personId, termId, points: 6, reason: "Primer crédito sintético" }),
    );
    try {
      await runCommand({ personId }, async (ctx) => {
        await ctx.tx.execute(sql`set local lock_timeout = '2s'`);
        await adjustPoints(ctx, {
          personId,
          termId,
          points: 5,
          reason: "Segundo crédito sintético",
        });
      });
      expect(await balanceFor(personId, termId)).toBe(5);
    } finally {
      held.release();
      await held.done;
    }
    expect(await balanceFor(personId, termId)).toBe(11);
  });

  it("ve la apertura concurrente de una ocasión sin puntos y revierte íntegramente el cierre", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("cierre-apertura@eafit.edu.co");
    const draft = await seedOccasion(termId, { status: "DRAFT", points: 0 });
    const held = await holdCommand(personId, (ctx) => openOccasion(ctx, draft.id));
    const closing = closeTermPointsAs({ personId }, termId);
    const rejection = expect(closing).rejects.toThrow(t("T-646", { n: 1 }));
    try {
      await expect.poll(async () => (await blockedBy(held.pid)).length).toBeGreaterThan(0);
      held.release();
      await Promise.all([held.done, rejection]);
      expect((await getTerm(termId))?.pointsClosedAt).toBeNull();
      expect(await getDb().select().from(termStanding)).toHaveLength(0);
      expect(
        await getDb().select().from(auditLog).where(eq(auditLog.action, "term.points-closed")),
      ).toHaveLength(0);
      expect(
        await getDb().select().from(outbox).where(eq(outbox.eventType, "term.points-closed")),
      ).toHaveLength(0);
    } finally {
      held.release();
      await Promise.allSettled([held.done, closing]);
    }
  });

  it("congela también las asistencias y ocasiones sin puntos", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("cierre-cero@eafit.edu.co");
    const otherId = await seedMember("cierre-otra@eafit.edu.co");
    const committeeId = await seedCommittee("cierre-cero");
    const closed = await seedOccasion(termId, { status: "CLOSED", points: 0 });
    const draft = await seedOccasion(termId, { status: "DRAFT", points: 0 });
    const pendingId = await seedCheckIn(closed.id, personId, "PENDING");
    await closeTermPointsAs({ personId }, termId);
    await expect(openOccasionAs({ personId }, draft.id)).rejects.toThrow(t("T-579"));
    for (const operation of [
      () => decideCheckInAs({ personId }, { checkInId: pendingId, decision: "APPROVE" }),
      () =>
        hostCheckInAs(
          { personId },
          {
            occasionId: closed.id,
            personId: otherId,
            personName: "Persona sintética",
            source: "ADMIN",
          },
        ),
      () => cancelOccasionAs({ personId }, closed.id, "Cancelación sintética"),
    ]) {
      await expect(operation()).rejects.toThrow(t("T-629"));
    }
    await expect(
      createOccasionSeriesAs(
        { personId },
        {
          committeeId,
          title: "Serie sintética",
          firstStartsAt: new Date(),
          durationMinutes: 30,
          location: "",
        },
      ),
    ).rejects.toThrow(t("T-579"));
    expect((await getTermStanding(termId))?.stats).toMatchObject({
      occasions: 2,
      checkIns: 0,
      pointsAwarded: 0,
    });
    expect(await getDb().select().from(checkIn)).toEqual([
      expect.objectContaining({ id: pendingId, status: "PENDING" }),
    ]);
    expect(await getDb().select().from(occasion)).toHaveLength(2);
  });

  it("espera la aprobación de una entrega en curso y congela su premio y el reto", async () => {
    // ADR-067 regla 13: la aprobación retenida mantiene el SHARE del término (grantReward →
    // lockOpenTermPoints) y el cierre espera detrás (FOR UPDATE). Al liberar, la entrega queda
    // COMPLETED con el premio GRANTED, así que countPendingGamification ya no bloquea y el
    // standing congela sus puntos — este es el orden real, no un cierre rechazado con T-2562.
    const termId = await seedTerm();
    const reviewer = await seedMember("cierre-revisor@eafit.edu.co");
    const member = await seedMember("cierre-entrega@eafit.edu.co");
    const challengeId = await seedChallenge(termId, {
      kind: "EVIDENCE",
      passPercent: null,
      basePoints: 10,
    });
    const participationId = await seedParticipation(challengeId, member, { status: "PENDING" });
    const [reserved] = await getDb()
      .insert(reward)
      .values({
        personId: member,
        termId,
        source: "CHALLENGE",
        participationId,
        basePoints: 10,
        baseGranted: 10,
        extraPoints: 0,
        status: "RESERVED",
        dayKey: "2026-08-10",
        weekKey: "2026-08-10",
        capDaily: 20,
        capWeekly: 60,
      })
      .returning();
    await getDb()
      .update(challengeParticipation)
      .set({ rewardId: reserved?.id })
      .where(eq(challengeParticipation.id, participationId));

    const settings = await loadGamificationSettings();
    const held = await holdCommand(reviewer, (ctx) =>
      reviewParticipation(ctx, { participationId, decision: "APPROVE" }, { settings }),
    );
    const closing = closeTermPointsAs({ personId: reviewer }, termId);
    void closing.catch(() => undefined);
    try {
      await expect.poll(async () => (await blockedBy(held.pid)).length).toBeGreaterThan(0);
      held.release();
      await Promise.all([held.done, closing]);
      const standing = await getTermStanding(termId);
      expect(standing?.stats.pointsAwarded).toBe(10);
      expect(standing?.stats.challengesCompleted).toBe(1);
      expect(await balanceFor(member, termId)).toBe(10);
      const [entrega] = await getDb()
        .select()
        .from(challengeParticipation)
        .where(eq(challengeParticipation.id, participationId));
      expect(entrega?.status).toBe("COMPLETED");
    } finally {
      held.release();
      await Promise.allSettled([held.done, closing]);
    }
  });
});
