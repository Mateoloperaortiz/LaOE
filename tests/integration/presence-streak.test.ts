import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  balanceFor,
  cancelOccasionAs,
  closeTermPointsAs,
  decideCheckInAs,
  decideManyAs,
  excuseCheckIn,
  getPresenceStreak,
  getTermStanding,
  hostCheckInAs,
  listPresenceHistoryFor,
  loadGamificationSettings,
} from "@/modules/participation";
import { lockParticipationBatch } from "@/modules/participation/domain/batch-lock";
import { reconcilePresenceBonuses } from "@/modules/participation/domain/presence-streak";
import { checkIn, pointEntry, presenceBonus } from "@/modules/participation/schema";
import { changeMembershipStatus, endMembership } from "@/modules/people";
import { person } from "@/modules/people/schema";
import { requireConfig } from "@/modules/system";
import { closeTermPoints, lockOpenTermPoints } from "@/modules/terms";
import {
  seedCheckIn,
  seedConfig,
  seedMembershipEvent,
  seedOccasion,
  seedTerm,
  seedTermStanding,
  seedVeteran,
} from "../factories";
import {
  backendPid,
  deferred,
  firstThenSecond,
  holdTransaction,
  outcome,
  waitingOn,
} from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

const db = () => getDb();
const at = (day: string) => new Date(`${day}T17:00:00Z`);
const NOW = at("2026-09-30");

async function setup(launch = "2026-09-01") {
  const personId = await seedVeteran("presencia@example.test");
  await seedMembershipEvent(personId, { from: null, to: "ACTIVE", at: at("2026-07-01") });
  const termId = await seedTerm();
  await seedConfig("gamification.launch", { at: at(launch).toISOString() });
  return { personId, termId, actor: { personId, ip: null } };
}

async function activity(termId: string, day: string, points = 0) {
  return seedOccasion(termId, {
    startsAt: at(day),
    openedAt: at("2026-08-01"),
    status: "CLOSED",
    points,
  });
}

async function attend(personId: string, occasionId: string) {
  return hostCheckInAs(
    { personId, ip: null },
    { personId, personName: "Persona Sintética", occasionId, source: "ADMIN" },
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

describe("bonos por constancia presencial", () => {
  it("usa las fechas de las actividades aunque todas las asistencias se aprueben después, incluso sin puntos", async () => {
    const { personId, termId } = await setup();
    for (const day of ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]) {
      await attend(personId, (await activity(termId, day)).id);
    }
    expect(await getPresenceStreak(personId, termId)).toMatchObject({
      currentStreak: 4,
      longestStreak: 4,
      bonus: 5,
    });
    expect(await balanceFor(personId, termId)).toBe(10);
    const entries = await db().select().from(pointEntry);
    expect(entries.map((entry) => entry.kind)).toEqual([
      "PRESENCE_STREAK",
      "PRESENCE_STREAK",
      "PRESENCE_STREAK",
    ]);
    expect(entries.map((entry) => entry.points)).toEqual([2, 3, 5]);
  });

  it("reconoce la historia sin pagarla y paga el nivel histórico en la primera actividad posterior al lanzamiento", async () => {
    const { personId, termId } = await setup("2026-09-25");
    for (const day of ["2026-09-08", "2026-09-15", "2026-09-22"])
      await attend(personId, (await activity(termId, day)).id);
    expect(await balanceFor(personId, termId)).toBe(0);
    expect((await getPresenceStreak(personId, termId)).currentStreak).toBe(3);
    await attend(personId, (await activity(termId, "2026-09-29")).id);
    expect(await balanceFor(personId, termId)).toBe(5);
    expect(await db().select().from(presenceBonus)).toHaveLength(1);
  });

  it("dos asistencias concurrentes en la misma semana y sus reintentos no duplican el bono", async () => {
    const { personId, termId } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    const one = await activity(termId, "2026-09-15");
    const two = await activity(termId, "2026-09-16");
    const held = await holdTransaction((tx) =>
      tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`reward:${personId}`}, 0))`),
    );
    const attended = await firstThenSecond(
      held,
      () => attend(personId, one.id),
      () => attend(personId, two.id),
    );
    expect(attended.map(outcome)).toEqual(["ok", "ok"]);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        runCommand(SYSTEM_ACTOR, (ctx) => reconcilePresenceBonuses(ctx, personId, termId)),
      ),
    );
    expect(await db().select().from(presenceBonus)).toHaveLength(1);
    expect(await db().select().from(pointEntry)).toHaveLength(1);
    expect(await balanceFor(personId, termId)).toBe(2);
  });

  it.each([
    false,
    true,
  ])("cancelar una ocasión no se cruza con los candados de dos personas de la conciliación, lanzamiento=%s", async (launched) => {
    const { personId, termId, actor } = await setup();
    const otherId = await seedVeteran("presencia.cancelacion@example.test");
    const [firstId, lastId] = [personId, otherId].sort();
    if (!firstId || !lastId) throw new Error("Faltan las dos personas de la carrera");
    const first = await activity(termId, "2026-09-08");
    const cancelled = await activity(termId, "2026-09-15");
    await attend(firstId, first.id);
    await attend(lastId, cancelled.id);
    if (!launched) await seedConfig("gamification.launch", { at: null });
    const ready = deferred<number>();
    const resume = deferred<void>();
    // El mismo barrido A → B del job, retenido después de A para fijar el cruce real.
    const reconciliation = runCommand(SYSTEM_ACTOR, async (ctx) => {
      await reconcilePresenceBonuses(ctx, firstId, termId);
      ready.resolve(await backendPid(ctx.tx));
      await resume.promise;
      await reconcilePresenceBonuses(ctx, lastId, termId);
    });
    void reconciliation.catch(ready.reject);
    const pid = await ready.promise;
    const cancellation = cancelOccasionAs(actor, cancelled.id, "Cancelación sintética");
    void cancellation.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(pid)).toBe(1);
      resume.resolve();
      const results = await Promise.allSettled([reconciliation, cancellation]);
      expect(results.map(outcome)).toEqual(["ok", "ok"]);
      expect(await balanceFor(lastId, termId)).toBe(0);
    } finally {
      resume.resolve();
      await Promise.allSettled([reconciliation, cancellation]);
    }
  });

  it("dos lotes de aprobaciones con personas en orden opuesto no invierten sus candados de rewards", async () => {
    const { personId, termId, actor } = await setup();
    const otherId = await seedVeteran("presencia.lotes@example.test");
    const [firstId, lastId] = [personId, otherId].sort();
    if (!firstId || !lastId) throw new Error("Faltan las dos personas del lote");
    const first = await activity(termId, "2026-09-08");
    const second = await activity(termId, "2026-09-15");
    const firstRows = [
      await seedCheckIn(first.id, lastId, "PENDING", { id: "presence-batch-1-a" }),
      await seedCheckIn(first.id, firstId, "PENDING", { id: "presence-batch-1-b" }),
    ];
    const secondRows = [
      await seedCheckIn(second.id, firstId, "PENDING", { id: "presence-batch-2-a" }),
      await seedCheckIn(second.id, lastId, "PENDING", { id: "presence-batch-2-b" }),
    ];
    const held = await holdTransaction((tx) =>
      tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`reward:${lastId}`}, 0))`),
    );
    const results = await firstThenSecond(
      held,
      () => decideManyAs(actor, first.id, firstRows, "APPROVE"),
      () => decideManyAs(actor, second.id, secondRows, "APPROVE"),
    );
    expect(results.map(outcome)).toEqual(["ok", "ok"]);
    expect(await balanceFor(firstId, termId)).toBe(2);
    expect(await balanceFor(lastId, termId)).toBe(2);
  });

  it("el barrido del término siguiente no se cruza con cancelar el anterior que todavía tiene puntos abiertos", async () => {
    const { personId, termId, actor } = await setup();
    const otherId = await seedVeteran("presencia.dos.semestres@example.test");
    const [firstId, lastId] = [personId, otherId].sort();
    if (!firstId || !lastId) throw new Error("Faltan las dos personas de la carrera");
    await attend(firstId, (await activity(termId, "2026-09-08")).id);
    const cancelled = await activity(termId, "2026-09-15");
    await attend(lastId, cancelled.id);
    const nextTermId = await seedTerm("2027-1");
    const next = await activity(nextTermId, "2027-01-08");
    await seedCheckIn(next.id, firstId);
    await seedCheckIn(next.id, lastId);
    vi.setSystemTime(at("2027-01-20"));
    const ready = deferred<number>();
    const resume = deferred<void>();
    const reconciliation = runCommand(SYSTEM_ACTOR, async (ctx) => {
      // El protocolo de entrada del barrido real, retenido entre A y B para fijar la intercalación.
      await lockParticipationBatch(ctx.tx);
      await lockOpenTermPoints(ctx.tx, nextTermId, "exclusive");
      await reconcilePresenceBonuses(ctx, firstId, nextTermId);
      ready.resolve(await backendPid(ctx.tx));
      await resume.promise;
      await reconcilePresenceBonuses(ctx, lastId, nextTermId);
    });
    void reconciliation.catch(ready.reject);
    const pid = await ready.promise;
    const cancellation = cancelOccasionAs(actor, cancelled.id, "Cancelación del semestre anterior");
    void cancellation.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(pid)).toBe(1);
      resume.resolve();
      const results = await Promise.allSettled([reconciliation, cancellation]);
      expect(results.map(outcome)).toEqual(["ok", "ok"]);
      expect(await balanceFor(lastId, termId)).toBe(0);
    } finally {
      resume.resolve();
      await Promise.allSettled([reconciliation, cancellation]);
    }
  });

  it("anular una asistencia corrige las semanas posteriores con reversiones y una asistencia alternativa las repone", async () => {
    const { personId, termId, actor } = await setup();
    const first = await activity(termId, "2026-09-08");
    const second = await activity(termId, "2026-09-15");
    const alternative = await activity(termId, "2026-09-16");
    const third = await activity(termId, "2026-09-22");
    await attend(personId, first.id);
    const approved = await attend(personId, second.id);
    await attend(personId, third.id);
    const originals = await db().select().from(pointEntry);
    expect(await balanceFor(personId, termId)).toBe(5);
    await decideCheckInAs(actor, {
      checkInId: approved.checkInId,
      occasionId: second.id,
      decision: "CANCEL",
      reason: "Corrección sintética",
    });
    expect(await balanceFor(personId, termId)).toBe(0);
    const corrected = await db().select().from(pointEntry);
    expect(corrected.filter((entry) => entry.kind === "REVERSAL")).toHaveLength(2);
    for (const original of originals)
      expect(corrected.find((entry) => entry.id === original.id)).toEqual(original);
    await attend(personId, alternative.id);
    expect(await balanceFor(personId, termId)).toBe(5);
    const history = await db().select().from(presenceBonus);
    expect(history.map((entry) => entry.version).sort()).toEqual([1, 1, 2, 2]);
  });

  it("cancelar la única oportunidad de una semana cambia la falta a pausa y corrige el bono posterior", async () => {
    const { personId, termId, actor } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    const missed = await activity(termId, "2026-09-15");
    await attend(personId, (await activity(termId, "2026-09-22")).id);
    expect(await balanceFor(personId, termId)).toBe(0);
    await cancelOccasionAs(actor, missed.id, "Cancelación sintética");
    expect(await balanceFor(personId, termId)).toBe(2);
    expect(
      (await getPresenceStreak(personId, termId)).weeks.find(
        (week) => week.weekKey === "2026-09-14",
      )?.status,
    ).toBe("PAUSED");
  });

  it("una aprobación fuera de orden recalcula todos los bonos afectados", async () => {
    const { personId, termId } = await setup();
    const first = await activity(termId, "2026-09-08");
    const second = await activity(termId, "2026-09-15");
    const third = await activity(termId, "2026-09-22");
    await attend(personId, first.id);
    await attend(personId, third.id);
    expect(await balanceFor(personId, termId)).toBe(0);
    await attend(personId, second.id);
    expect(await balanceFor(personId, termId)).toBe(5);
    expect((await getPresenceStreak(personId, termId)).currentStreak).toBe(3);
  });

  it("la licencia se reconstruye desde su historia aunque la persona ya haya regresado", async () => {
    const { personId, termId } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    await activity(termId, "2026-09-15");
    vi.setSystemTime(at("2026-09-14"));
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, personId, {
        to: "ON_LEAVE",
        reason: "Licencia sintética",
        leaveUntil: "2026-10-01",
      }),
    );
    vi.setSystemTime(at("2026-09-21"));
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, personId, { to: "ACTIVE", reason: "Regreso sintético" }),
    );
    vi.setSystemTime(NOW);
    await attend(personId, (await activity(termId, "2026-09-22")).id);
    expect((await getPresenceStreak(personId, termId)).currentStreak).toBe(2);
    expect(await balanceFor(personId, termId)).toBe(2);
  });

  it("una asistencia aprobada después del regreso conserva sus GH base y pausa la constancia si ocurrió en licencia", async () => {
    const { personId, termId } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    vi.setSystemTime(at("2026-09-14"));
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, personId, {
        to: "ON_LEAVE",
        reason: "Licencia sintética",
        leaveUntil: "2026-10-01",
      }),
    );
    vi.setSystemTime(at("2026-09-21"));
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, personId, { to: "ACTIVE", reason: "Regreso sintético" }),
    );
    vi.setSystemTime(NOW);
    await attend(personId, (await activity(termId, "2026-09-15", 10)).id);
    expect(await balanceFor(personId, termId)).toBe(10);
    expect(
      (await getPresenceStreak(personId, termId)).weeks.find(
        (week) => week.weekKey === "2026-09-14",
      ),
    ).toMatchObject({ status: "PAUSED", streak: 1, bonus: 0 });
    await attend(personId, (await activity(termId, "2026-09-22")).id);
    expect(await balanceFor(personId, termId)).toBe(12);
    expect((await getPresenceStreak(personId, termId)).currentStreak).toBe(2);
  });

  it("el cierre liquida hechos históricos pendientes y no admite correcciones posteriores", async () => {
    const { personId, termId, actor } = await setup();
    await seedCheckIn((await activity(termId, "2026-09-08")).id, personId);
    const second = await activity(termId, "2026-09-15");
    const secondCheckIn = await seedCheckIn(second.id, personId);
    expect(await balanceFor(personId, termId)).toBe(0);
    await closeTermPointsAs(actor, termId);
    expect((await getTermStanding(termId))?.stats.pointsAwarded).toBe(2);
    expect(await balanceFor(personId, termId)).toBe(2);
    const before = await db().select().from(pointEntry);
    await expect(
      decideCheckInAs(actor, {
        checkInId: secondCheckIn,
        occasionId: second.id,
        decision: "CANCEL",
        reason: "Corrección tardía",
      }),
    ).rejects.toThrow();
    expect(await db().select().from(pointEntry)).toEqual(before);
    const exported = await listPresenceHistoryFor(personId);
    expect(exported.bonuses).toHaveLength(1);
    expect(exported.bonuses[0]?.personId).toBe(personId);
  });

  it("una excusa aprobada concilia por su evento mientras el semestre siga abierto", async () => {
    const { personId, termId } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    const missed = await activity(termId, "2026-09-15");
    await attend(personId, (await activity(termId, "2026-09-22")).id);
    expect(await balanceFor(personId, termId)).toBe(0);
    const settings = await loadGamificationSettings();
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      excuseCheckIn(
        ctx,
        { occasionId: missed.id, personId, reason: "Excusa sintética aprobada" },
        { settings },
      ),
    );
    await drainOutbox();
    expect(await balanceFor(personId, termId)).toBe(2);
  });

  it("una excusa sigue siendo válida después del cierre sin modificar bonos ni el snapshot", async () => {
    const { personId, termId, actor } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    await attend(personId, (await activity(termId, "2026-09-15")).id);
    const missed = await activity(termId, "2026-09-22");
    await closeTermPointsAs(actor, termId);
    const entries = await db().select().from(pointEntry);
    const standing = await getTermStanding(termId);
    const settings = await loadGamificationSettings();
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      excuseCheckIn(
        ctx,
        { occasionId: missed.id, personId, reason: "Excusa sintética tardía" },
        { settings },
      ),
    );
    await drainOutbox();
    expect(await db().select().from(pointEntry)).toEqual(entries);
    expect(await getTermStanding(termId)).toEqual(standing);
    expect(await balanceFor(personId, termId)).toBe(2);
  });

  it("una excusa posterior al cierre no convierte una falta histórica en una racha ni un bono inexistente", async () => {
    const { personId, termId, actor } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    const missed = await activity(termId, "2026-09-15");
    await attend(personId, (await activity(termId, "2026-09-22")).id);
    vi.setSystemTime(at("2026-09-23"));
    await closeTermPointsAs(actor, termId);
    const recognition = await getPresenceStreak(personId, termId);
    expect(recognition).toMatchObject({ currentStreak: 1, longestStreak: 1, bonus: 0 });
    const entries = await db().select().from(pointEntry);
    const standing = await getTermStanding(termId);
    vi.setSystemTime(NOW);
    const settings = await loadGamificationSettings();
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      excuseCheckIn(
        ctx,
        { occasionId: missed.id, personId, reason: "Excusa sintética posterior al cierre" },
        { settings },
      ),
    );
    await drainOutbox();
    expect(
      (await db().select().from(checkIn).where(eq(checkIn.occasionId, missed.id)))[0]?.status,
    ).toBe("EXCUSED");
    expect(await getPresenceStreak(personId, termId)).toEqual(recognition);
    expect(await db().select().from(pointEntry)).toEqual(entries);
    expect(await getTermStanding(termId)).toEqual(standing);
    expect(await balanceFor(personId, termId)).toBe(0);
  });

  it.each([
    { first: "excusa", expected: 2, streak: 2 },
    { first: "cierre", expected: 0, streak: 1 },
  ])("la foto y el ledger ven completa la primera operación cuando $first compite con el cierre", async ({
    first,
    expected,
    streak,
  }) => {
    const { personId, termId, actor } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    const missed = await activity(termId, "2026-09-15");
    await attend(personId, (await activity(termId, "2026-09-22")).id);
    const settings = await loadGamificationSettings();
    const excuse = () =>
      runCommand(SYSTEM_ACTOR, (ctx) =>
        excuseCheckIn(
          ctx,
          { occasionId: missed.id, personId, reason: "Excusa sintética concurrente" },
          { settings },
        ),
      );
    const closing = () => closeTermPointsAs(actor, termId);
    const held = await holdTransaction((tx) =>
      first === "excusa"
        ? tx.select().from(person).where(eq(person.id, personId)).for("update")
        : tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`reward:${personId}`}, 0))`,
          ),
    );
    const results =
      first === "excusa"
        ? await firstThenSecond(held, excuse, closing)
        : await firstThenSecond(held, closing, excuse);
    expect(results.map(outcome)).toEqual(["ok", "ok"]);
    await drainOutbox();
    expect(await balanceFor(personId, termId)).toBe(expected);
    expect(await getPresenceStreak(personId, termId)).toMatchObject({
      recognitionAvailable: true,
      currentStreak: streak,
      longestStreak: streak,
    });
    expect((await getTermStanding(termId))?.stats.pointsAwarded).toBe(expected);
  });

  it("un cierre antiguo sin foto declara reconocimiento no disponible y nunca recompone bonos desde los hechos actuales", async () => {
    const { personId, termId } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    const missed = await activity(termId, "2026-09-15");
    await attend(personId, (await activity(termId, "2026-09-22")).id);
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await seedTermStanding({
      termId,
      topNew: [],
      topVeteran: [],
      topCommittees: [],
      stats: { activeMembers: 1, newMembers: 0, occasions: 3, checkIns: 2, pointsAwarded: 0 },
    });
    const recognition = await getPresenceStreak(personId, termId);
    expect(recognition).toMatchObject({
      recognitionAvailable: false,
      launched: false,
      currentStreak: 0,
      longestStreak: 0,
      bonus: 0,
      nextBonus: 0,
      weeks: [],
    });
    const standing = await getTermStanding(termId);
    const settings = await loadGamificationSettings();
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      excuseCheckIn(
        ctx,
        { occasionId: missed.id, personId, reason: "Excusa sintética de cierre histórico" },
        { settings },
      ),
    );
    await drainOutbox();
    expect(await getPresenceStreak(personId, termId)).toEqual(recognition);
    expect(await getTermStanding(termId)).toEqual(standing);
    expect(await balanceFor(personId, termId)).toBe(0);
  });

  it.each([
    "ON_LEAVE",
    "INACTIVE",
  ])("la foto incluye la constancia de una membresía %s al cerrar", async (status) => {
    const { personId, termId, actor } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    await attend(personId, (await activity(termId, "2026-09-15")).id);
    const before = await getPresenceStreak(personId, termId);
    await runCommand(SYSTEM_ACTOR, async (ctx) => {
      if (status === "INACTIVE") {
        await endMembership(ctx, personId, {
          endReason: "OTHER",
          lastTermId: termId,
          memorialConsent: false,
          contactConsent: false,
        });
      } else {
        await changeMembershipStatus(ctx, personId, {
          to: "ON_LEAVE",
          reason: "Licencia sintética al cerrar",
          leaveUntil: "2026-10-01",
        });
      }
    });
    await closeTermPointsAs(actor, termId);
    expect(await getPresenceStreak(personId, termId)).toEqual(before);
    expect((await getTermStanding(termId))?.stats.presenceRecognitions).toEqual([
      { personId, recognition: before },
    ]);
  });

  it("una asistencia que compite con el cierre queda completa en el snapshot o no escribe nada", async () => {
    const { personId, termId, actor } = await setup();
    await attend(personId, (await activity(termId, "2026-09-08")).id);
    const second = await activity(termId, "2026-09-15");
    const [attendance, closing] = await Promise.allSettled([
      attend(personId, second.id),
      closeTermPointsAs(actor, termId),
    ]);
    expect(closing.status).toBe("fulfilled");
    const expected = attendance.status === "fulfilled" ? 2 : 0;
    expect((await getTermStanding(termId))?.stats.pointsAwarded).toBe(expected);
    expect(await balanceFor(personId, termId)).toBe(expected);
    const bonuses = await db()
      .select()
      .from(presenceBonus)
      .where(eq(presenceBonus.personId, personId));
    expect(bonuses).toHaveLength(expected > 0 ? 1 : 0);
  });

  it("los cortes nuevos y el lanzamiento son configuración de migración", async () => {
    expect(await requireConfig("points.levels")).toEqual([0, 25, 75, 150, 250]);
    expect(Number.isNaN(Date.parse(await requireConfig("presenceStreak.launchedAt")))).toBe(false);
  });
});
