import { readFileSync } from "node:fs";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { balanceFor, getTermStanding } from "@/modules/participation";
import { loadGamerParticipations } from "@/modules/participation/domain/gamer";
import { creditGame } from "@/modules/participation/domain/ledger";
import { pointEntry } from "@/modules/participation/schema";
import { appConfig } from "@/modules/system/schema";
import { createTerm, lockOpenTermPoints, updateTerm } from "@/modules/terms";
import { pointSeparationPolicy, term } from "@/modules/terms/schema";
import { seedTerm, seedTermStanding, seedVeteran, seedWordleGame } from "../factories";
import { truncateAll } from "./db";

const db = () => getDb();
const migration = (name: string) =>
  readFileSync(`drizzle/${name}.sql`, "utf8").split("--> statement-breakpoint");
const oldBoundary = migration("0054_compatibilidad_de_semestres_cerrados")[1] ?? "";
const anchor = migration("0055_frontera_inmutable_gh_y_juegos").slice(1).join("\n");
const input = (code: string, startsOn: string, endsOn: string) => ({
  code,
  startsOn,
  endsOn,
  requiredOrdinaryAssemblies: 1,
  permanenceGeneralNominal: 50,
  permanenceCommitteeNominal: 60,
});

async function won(personId: string, termId: string, day: string) {
  const gameId = await seedWordleGame(personId, termId, day, { status: "WON" });
  await runCommand(SYSTEM_ACTOR, async (ctx) => {
    await lockOpenTermPoints(ctx.tx, termId);
    await creditGame(ctx, {
      game: "WORDLE",
      runId: gameId,
      personId,
      termId,
      points: 6,
      reason: "Victoria histórica sintética",
    });
  });
}

beforeEach(truncateAll);
afterAll(closeDb);

describe("frontera histórica de GH Points y Juegos", () => {
  it("clasifica un término histórico creado después del lanzamiento y uno futuro por el ancla, no por la fecha de creación", async () => {
    const old = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createTerm(ctx, input("2026-1", "2026-01-01", "2026-06-30")),
    );
    const future = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createTerm(ctx, input("2027-1", "2027-01-01", "2027-06-30")),
    );
    const [historical] = await db().select().from(term).where(eq(term.id, old.id));
    const [next] = await db().select().from(term).where(eq(term.id, future.id));
    expect(historical?.gamePointsSeparated).toBe(false);
    expect(next?.gamePointsSeparated).toBe(true);
  });

  it("conserva el saldo y snapshot de un semestre cerrado y no reclasifica al editar sus fechas", async () => {
    const personId = await seedVeteran("historia.puntos@example.test");
    const old = await seedTerm("2026-1");
    const current = await seedTerm("2026-2");
    await won(personId, old, "2026-03-17");
    await won(personId, current, "2026-09-15");
    await db()
      .update(term)
      .set({ pointsClosedAt: new Date("2026-06-30T22:00:00Z") })
      .where(eq(term.id, old));
    await seedTermStanding({
      termId: old,
      topNew: [],
      topVeteran: [{ personId, name: "Persona Sintética", rank: 1, total: 6 }],
      topCommittees: [],
      stats: { activeMembers: 1, newMembers: 0, occasions: 0, checkIns: 0, pointsAwarded: 6 },
    });
    const frozen = await getTermStanding(old);
    const ledger = await db().select().from(pointEntry).orderBy(asc(pointEntry.id));
    expect(await balanceFor(personId, old)).toBe(6);
    expect(await balanceFor(personId, current)).toBe(0);
    expect(await loadGamerParticipations(old)).toHaveLength(1);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updateTerm(ctx, old, input("2026-1", "2024-01-01", "2024-06-30")),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updateTerm(ctx, current, input("2026-2", "2027-07-01", "2027-12-31")),
    );
    expect(await balanceFor(personId, old)).toBe(6);
    expect(await balanceFor(personId, current)).toBe(0);
    expect(await getTermStanding(old)).toEqual(frozen);
    expect(await db().select().from(pointEntry).orderBy(asc(pointEntry.id))).toEqual(ledger);
  });

  it("la migración real sobre términos existentes fija la frontera sin tocar su historia", async () => {
    const old = await seedTerm("2026-1");
    const current = await seedTerm("2026-2");
    const future = await seedTerm("2027-1");
    await db().transaction(async (tx) => {
      await tx
        .update(appConfig)
        .set({ value: "2026-10-15T12:00:00Z" })
        .where(eq(appConfig.key, "presenceStreak.launchedAt"));
      await tx.update(term).set({ gamePointsSeparated: true });
      await tx.delete(pointSeparationPolicy);
      await tx.execute(sql.raw(oldBoundary));
      await tx.execute(sql.raw(anchor));
      const rows = await tx
        .select()
        .from(term)
        .where(and(sql`${term.id} in (${old}, ${current}, ${future})`));
      expect(new Map(rows.map((row) => [row.id, row.gamePointsSeparated]))).toEqual(
        new Map([
          [old, false],
          [current, true],
          [future, true],
        ]),
      );
      expect((await tx.select().from(pointSeparationPolicy))[0]?.firstTermCode).toBe("2026-2");
    });
  });

  it("la migración real desde cero guarda un ancla aunque no exista todavía el término vigente", async () => {
    await db().transaction(async (tx) => {
      await tx
        .update(appConfig)
        .set({ value: "2028-03-15T12:00:00Z" })
        .where(eq(appConfig.key, "presenceStreak.launchedAt"));
      await tx.delete(pointSeparationPolicy);
      await tx.execute(sql.raw(anchor));
      expect((await tx.select().from(pointSeparationPolicy))[0]?.firstTermCode).toBe("2028-1");
    });
    const historical = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createTerm(ctx, input("2027-2", "2027-07-01", "2027-12-31")),
    );
    const future = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createTerm(ctx, input("2028-2", "2028-07-01", "2028-12-31")),
    );
    expect(
      (await db().select().from(term).where(eq(term.id, historical.id)))[0]?.gamePointsSeparated,
    ).toBe(false);
    expect(
      (await db().select().from(term).where(eq(term.id, future.id)))[0]?.gamePointsSeparated,
    ).toBe(true);
  });
});
