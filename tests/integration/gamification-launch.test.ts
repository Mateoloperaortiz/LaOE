import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import {
  balanceFor,
  getGamificationLaunch,
  getPresenceStreak,
  hostCheckInAs,
  setGamificationEnabledAs,
} from "@/modules/participation";
import { appConfig } from "@/modules/system/schema";
import { pointSeparationPolicy } from "@/modules/terms/schema";
import { seedCheckIn, seedOccasion, seedTerm, seedVeteran } from "../factories";
import { firstThenSecond, holdTransaction, outcome } from "../helpers/locks";
import { truncateAll } from "./db";

const db = () => getDb();
const at = (day: string) => new Date(`${day}T17:00:00Z`);
const launchMigration = readFileSync(
  "drizzle/0056_lanzamiento_efectivo_de_gamificacion.sql",
  "utf8",
);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at("2026-09-30"));
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

describe("primer lanzamiento efectivo de gamificación", () => {
  it("preparar la contabilidad con la bandera apagada no activa rachas ni entrega bonos", async () => {
    const personId = await seedVeteran("lanzamiento.pendiente@example.test");
    const termId = await seedTerm();
    for (const day of ["2026-09-08", "2026-09-15"]) {
      const occasion = await seedOccasion(termId, {
        status: "CLOSED",
        startsAt: at(day),
        points: 0,
      });
      await hostCheckInAs(
        { personId, ip: null },
        { occasionId: occasion.id, personId, personName: "Persona Sintética", source: "ADMIN" },
      );
    }
    expect(await getGamificationLaunch()).toEqual({ launchedAt: null });
    expect(await getPresenceStreak(personId, termId)).toMatchObject({ launched: false, bonus: 0 });
    expect(await balanceFor(personId, termId)).toBe(0);
    await setGamificationEnabledAs(SYSTEM_ACTOR, false);
    expect(await getGamificationLaunch()).toEqual({ launchedAt: null });
  });

  it("la primera activación concurrente fija un solo instante y nunca paga semanas anteriores", async () => {
    const personId = await seedVeteran("lanzamiento.historia@example.test");
    const termId = await seedTerm();
    for (const day of ["2026-09-08", "2026-09-15", "2026-09-22"]) {
      await seedCheckIn(
        (await seedOccasion(termId, { status: "CLOSED", startsAt: at(day), points: 0 })).id,
        personId,
      );
    }
    vi.setSystemTime(at("2026-09-25"));
    const held = await holdTransaction((tx) =>
      tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('gamification-launch', 0))`),
    );
    const activated = await firstThenSecond(
      held,
      () => setGamificationEnabledAs(SYSTEM_ACTOR, true),
      () => setGamificationEnabledAs(SYSTEM_ACTOR, true),
    );
    expect(activated.map(outcome)).toEqual(["ok", "ok"]);
    await Promise.all(
      Array.from({ length: 4 }, () => setGamificationEnabledAs(SYSTEM_ACTOR, true)),
    );
    expect(await getGamificationLaunch()).toEqual({ launchedAt: at("2026-09-25").toISOString() });
    expect(await balanceFor(personId, termId)).toBe(0);
    vi.setSystemTime(at("2026-09-30"));
    const fourth = await seedOccasion(termId, {
      status: "CLOSED",
      startsAt: at("2026-09-29"),
      points: 0,
    });
    await hostCheckInAs(
      { personId, ip: null },
      { occasionId: fourth.id, personId, personName: "Persona Sintética", source: "ADMIN" },
    );
    expect(await balanceFor(personId, termId)).toBe(5);
    expect(await getPresenceStreak(personId, termId)).toMatchObject({
      launched: true,
      currentStreak: 4,
      bonus: 5,
    });
  });

  it("apagar retos conserva la constancia core ya lanzada y reactivar no mueve el lanzamiento ni el corte", async () => {
    const personId = await seedVeteran("lanzamiento.reactivar@example.test");
    const termId = await seedTerm();
    const policy = await db().select().from(pointSeparationPolicy);
    await seedCheckIn(
      (await seedOccasion(termId, { status: "CLOSED", startsAt: at("2026-09-08"), points: 0 })).id,
      personId,
    );
    vi.setSystemTime(at("2026-09-10"));
    await setGamificationEnabledAs(SYSTEM_ACTOR, true);
    const firstLaunch = await getGamificationLaunch();
    await setGamificationEnabledAs(SYSTEM_ACTOR, false);
    vi.setSystemTime(at("2026-09-16"));
    const second = await seedOccasion(termId, {
      status: "CLOSED",
      startsAt: at("2026-09-15"),
      points: 0,
    });
    await hostCheckInAs(
      { personId, ip: null },
      { occasionId: second.id, personId, personName: "Persona Sintética", source: "ADMIN" },
    );
    expect(await balanceFor(personId, termId)).toBe(2);
    expect((await getPresenceStreak(personId, termId)).launched).toBe(true);
    vi.setSystemTime(at("2027-01-15"));
    await setGamificationEnabledAs(SYSTEM_ACTOR, true);
    expect(await getGamificationLaunch()).toEqual(firstLaunch);
    expect(await db().select().from(pointSeparationPolicy)).toEqual(policy);
    expect(await balanceFor(personId, termId)).toBe(2);
  });

  it.each([
    false,
    true,
  ])("la migración respeta enabled=%s y solo inicia automáticamente si ya estaba activo", async (enabled) => {
    const prepared = "2026-10-15T12:00:00.000Z";
    await db().transaction(async (tx) => {
      await tx.delete(appConfig).where(eq(appConfig.key, "gamification.launch"));
      await tx
        .update(appConfig)
        .set({ value: enabled })
        .where(eq(appConfig.key, "gamification.enabled"));
      await tx
        .update(appConfig)
        .set({ value: prepared })
        .where(eq(appConfig.key, "presenceStreak.launchedAt"));
      await tx.execute(sql.raw(launchMigration));
      const [launch] = await tx
        .select()
        .from(appConfig)
        .where(eq(appConfig.key, "gamification.launch"));
      const [flag] = await tx
        .select()
        .from(appConfig)
        .where(eq(appConfig.key, "gamification.enabled"));
      expect(launch?.value).toEqual({ at: enabled ? prepared : null });
      expect(flag?.value).toBe(enabled);
      // La promoción repetida tampoco cambia una activación ya reconocida.
      await tx
        .update(appConfig)
        .set({ value: "2027-03-15T12:00:00.000Z" })
        .where(eq(appConfig.key, "presenceStreak.launchedAt"));
      await tx.execute(sql.raw(launchMigration));
      expect(
        (await tx.select().from(appConfig).where(eq(appConfig.key, "gamification.launch")))[0]
          ?.value,
      ).toEqual(launch?.value);
    });
  });
});
