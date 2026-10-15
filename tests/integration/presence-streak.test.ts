import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  balanceFor,
  cancelOccasionAs,
  closeTermPointsAs,
  decideCheckInAs,
  excuseCheckIn,
  getPresenceStreak,
  getTermStanding,
  hostCheckInAs,
  listPresenceHistoryFor,
  loadGamificationSettings,
} from "@/modules/participation";
import { reconcilePresenceBonuses } from "@/modules/participation/domain/presence-streak";
import { pointEntry, presenceBonus } from "@/modules/participation/schema";
import { changeMembershipStatus } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import {
  seedCheckIn,
  seedConfig,
  seedMembershipEvent,
  seedOccasion,
  seedTerm,
  seedVeteran,
} from "../factories";
import { firstThenSecond, holdTransaction, outcome } from "../helpers/locks";
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
