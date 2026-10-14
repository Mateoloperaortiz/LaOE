import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isCheckViolation } from "@/db/errors";
import { runCommand } from "@/db/tx";
import { closeTermPointsAs, reverseEntryAs } from "@/modules/participation/domain/commands";
import { balanceFor } from "@/modules/participation/domain/ledger";
import {
  grantReward,
  releaseReward,
  reserveAndGrantReward,
  reserveReward,
  reverseReward,
} from "@/modules/participation/domain/rewards";
import {
  boosterItem,
  challengeParticipation,
  pointEntry,
  reward,
} from "@/modules/participation/schema";
import { auditLog } from "@/modules/system/schema";
import { getTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { seedBooster, seedChallenge, seedMember, seedParticipation, seedTerm } from "../factories";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

// Economía de la gamificación (ADR-067 reglas 4 a 6): reserva con cupo, entrega en el ledger,
// ciclo del booster, liberación, reversión e idempotencia, todo dentro de la transacción.

const db = () => getDb();
const CAPS = { daily: 20, weekly: 60 };
const REASONS = { base: "Reto sintético", extra: "Impulso sintético" };

/** Una entrega PENDING distinta por premio: el unique de reward exige una participación cada vez. */
async function rewardTarget(personId: string, termId: string): Promise<string> {
  const challengeId = await seedChallenge(termId);
  return seedParticipation(challengeId, personId);
}

async function reserve(
  personId: string,
  termId: string,
  input: Partial<Parameters<typeof reserveReward>[1]> = {},
) {
  const participationId = input.participationId ?? (await rewardTarget(personId, termId));
  return runCommand({ personId, ip: null }, (ctx) =>
    reserveReward(
      ctx,
      {
        personId,
        termId,
        source: "CHALLENGE",
        participationId,
        base: 10,
        personalPercent: 0,
        campaignPercent: 0,
        ...input,
      },
      CAPS,
    ),
  );
}

async function boosterStatus(boosterId: string) {
  const [row] = await db().select().from(boosterItem).where(eq(boosterItem.id, boosterId));
  return row;
}

describe("premios de la gamificación", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("el límite de 20 en la base sigue vigente para los retos", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.limite.base@eafit.edu.co");
    await expect(reserve(personId, termId, { base: 21 })).rejects.toSatisfy((error) =>
      isCheckViolation(error, "reward_base_points_range"),
    );
    expect(await db().select().from(reward)).toHaveLength(0);
  });

  it.each([
    { kind: "CHALLENGE", points: 21 },
    { kind: "BOOST", points: -1 },
    { kind: "BOOST", points: 1001 },
  ] as const)("el ledger rechaza $kind de $points puntos", async ({ kind, points }) => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.limite.ledger@eafit.edu.co");
    const held = await reserve(personId, termId);
    await expect(
      db().insert(pointEntry).values({
        personId,
        termId,
        kind,
        points,
        reason: "Inserción sintética fuera del rango",
        rewardId: held.reward.id,
      }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "point_entry_reward_range"));
  });

  it("reservar y conceder acredita CHALLENGE y BOOST del mismo reward y audita ambos pasos", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.ciclo@eafit.edu.co");
    const boosterId = await seedBooster(personId, termId, "PLUS_50");
    const participationId = await rewardTarget(personId, termId);
    const { reward: granted, breakdown } = await runCommand({ personId, ip: null }, (ctx) =>
      reserveAndGrantReward(
        ctx,
        {
          personId,
          termId,
          source: "CHALLENGE",
          participationId,
          base: 10,
          personalPercent: 50,
          campaignPercent: 0,
          boosterItemId: boosterId,
        },
        CAPS,
        REASONS,
      ),
    );
    expect(breakdown).toMatchObject({
      baseGranted: 10,
      extraGranted: 5,
      personalConsumed: true,
      capped: false,
    });
    expect(granted.status).toBe("GRANTED");
    expect(granted.boosterItemId).toBe(boosterId);
    const entries = await db().select().from(pointEntry).where(eq(pointEntry.rewardId, granted.id));
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.kind).sort()).toEqual(["BOOST", "CHALLENGE"]);
    expect(entries.find((entry) => entry.kind === "CHALLENGE")?.points).toBe(10);
    expect(entries.find((entry) => entry.kind === "BOOST")?.points).toBe(5);
    expect(await balanceFor(personId, termId)).toBe(15);
    expect((await boosterStatus(boosterId))?.status).toBe("CONSUMED");
    const audit = await db()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityId, granted.id));
    expect(audit.map((row) => row.action).sort()).toEqual(["reward.granted", "reward.reserved"]);
  });

  it("el booster pasa AVAILABLE→RESERVED→CONSUMED y no se consume cuando la campaña ya cubre el extra", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.booster@eafit.edu.co");
    const boosterId = await seedBooster(personId, termId, "PLUS_50");

    const held = await reserve(personId, termId, {
      base: 10,
      personalPercent: 50,
      boosterItemId: boosterId,
    });
    expect(held.breakdown.personalConsumed).toBe(true);
    expect((await boosterStatus(boosterId))?.status).toBe("RESERVED");
    await runCommand({ personId, ip: null }, (ctx) => grantReward(ctx, held.reward.id, REASONS));
    const consumed = await boosterStatus(boosterId);
    expect(consumed?.status).toBe("CONSUMED");
    expect(consumed?.consumedRewardId).toBe(held.reward.id);

    // Con campaña del 100 % el extra ya no supera lo que aporta la campaña: el booster queda libre.
    const otherBoosterId = await seedBooster(personId, termId, "PLUS_50");
    const spared = await reserve(personId, termId, {
      base: 10,
      personalPercent: 50,
      campaignPercent: 100,
      boosterItemId: otherBoosterId,
    });
    expect(spared.breakdown.personalConsumed).toBe(false);
    expect(spared.reward.boosterItemId).toBeNull();
    expect(spared.reward.personalPercent).toBe(0);
    expect((await boosterStatus(otherBoosterId))?.status).toBe("AVAILABLE");
  });

  it("los topes recortan la tercera reserva, RELEASED libera cupo y REVERSED lo sigue ocupando", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.topes@eafit.edu.co");

    const first = await reserve(personId, termId);
    const second = await reserve(personId, termId);
    expect(first.breakdown.baseGranted).toBe(10);
    expect(second.breakdown.baseGranted).toBe(10);
    const third = await reserve(personId, termId);
    expect(third.breakdown).toMatchObject({ baseGranted: 0, extraGranted: 0, capped: true });

    // Liberar la primera reserva reabre su cupo: la cuarta entra completa.
    await runCommand({ personId, ip: null }, (ctx) =>
      releaseReward(ctx, first.reward.id, "Liberación sintética"),
    );
    const fourth = await reserve(personId, termId);
    expect(fourth.breakdown.baseGranted).toBe(10);

    // Una entrega revertida sigue contando en el día: no queda cupo para una quinta.
    await runCommand({ personId, ip: null }, (ctx) => grantReward(ctx, second.reward.id, REASONS));
    await runCommand({ personId, ip: null }, (ctx) =>
      reverseReward(ctx, second.reward.id, "Anulación sintética"),
    );
    const fifth = await reserve(personId, termId);
    expect(fifth.breakdown).toMatchObject({ baseGranted: 0, extraGranted: 0, capped: true });
  });

  it("liberar devuelve el booster con objetivos en nulo y revertir lo devuelve solo si sigue vigente", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.devolver@eafit.edu.co");
    const challengeId = await seedChallenge(termId);
    const boosterId = await seedBooster(personId, termId, "PLUS_50", {
      targetChallengeId: challengeId,
    });
    const held = await reserve(personId, termId, {
      base: 10,
      personalPercent: 50,
      boosterItemId: boosterId,
    });
    const released = await runCommand({ personId, ip: null }, (ctx) =>
      releaseReward(ctx, held.reward.id, "Liberación sintética"),
    );
    expect(released.status).toBe("RELEASED");
    const freed = await boosterStatus(boosterId);
    expect(freed).toMatchObject({
      status: "AVAILABLE",
      targetChallengeId: null,
      targetOccasionId: null,
    });

    // Reversión con booster vigente: dos REVERSAL, saldo neto cero y booster de vuelta.
    const validId = await seedBooster(personId, termId, "PLUS_50");
    const kept = await reserve(personId, termId, {
      base: 10,
      personalPercent: 50,
      boosterItemId: validId,
    });
    await runCommand({ personId, ip: null }, (ctx) => grantReward(ctx, kept.reward.id, REASONS));
    expect(await balanceFor(personId, termId)).toBe(15);
    const { reversed } = await runCommand({ personId, ip: null }, (ctx) =>
      reverseReward(ctx, kept.reward.id, "Anulación sintética"),
    );
    expect(reversed).toBe(15);
    const reversals = await db().select().from(pointEntry).where(eq(pointEntry.personId, personId));
    expect(reversals.filter((entry) => entry.kind === "REVERSAL")).toHaveLength(2);
    expect(await balanceFor(personId, termId)).toBe(0);
    expect((await boosterStatus(validId))?.status).toBe("AVAILABLE");
    const [reversedRow] = await db().select().from(reward).where(eq(reward.id, kept.reward.id));
    expect(reversedRow?.status).toBe("REVERSED");

    // Reversión con booster vencido: las entradas se anulan pero el booster queda CONSUMED.
    // Otra persona para no pelear con el cupo que REVERSED sigue ocupando.
    const otherId = await seedMember("gamificacion.vencido@eafit.edu.co");
    const expiredId = await seedBooster(otherId, termId, "PLUS_50");
    const doomed = await reserve(otherId, termId, {
      base: 5,
      personalPercent: 50,
      boosterItemId: expiredId,
    });
    await runCommand({ personId: otherId, ip: null }, (ctx) =>
      grantReward(ctx, doomed.reward.id, REASONS),
    );
    await db()
      .update(boosterItem)
      .set({ expiresAt: new Date(Date.now() - 3_600_000) })
      .where(eq(boosterItem.id, expiredId));
    await runCommand({ personId: otherId, ip: null }, (ctx) =>
      reverseReward(ctx, doomed.reward.id, "Anulación sintética"),
    );
    expect((await boosterStatus(expiredId))?.status).toBe("CONSUMED");
    expect(await balanceFor(otherId, termId)).toBe(0);
  });

  it("conceder o revertir dos veces no duplica entradas ni reversiones", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.idempotente@eafit.edu.co");
    const held = await reserve(personId, termId, { base: 10, personalPercent: 0 });
    const first = await runCommand({ personId, ip: null }, (ctx) =>
      grantReward(ctx, held.reward.id, REASONS),
    );
    const again = await runCommand({ personId, ip: null }, (ctx) =>
      grantReward(ctx, held.reward.id, REASONS),
    );
    expect(again.status).toBe("GRANTED");
    expect(again.decidedAt).toEqual(first.decidedAt);
    expect(await db().select().from(pointEntry)).toHaveLength(1);

    await runCommand({ personId, ip: null }, (ctx) =>
      reverseReward(ctx, held.reward.id, "Anulación sintética"),
    );
    const second = await runCommand({ personId, ip: null }, (ctx) =>
      reverseReward(ctx, held.reward.id, "Anulación sintética"),
    );
    expect(second).toEqual({ reversed: 0 });
    const entries = await db().select().from(pointEntry);
    expect(entries.filter((entry) => entry.kind === "REVERSAL")).toHaveLength(1);
    expect(await balanceFor(personId, termId)).toBe(0);
  });

  it("el cierre del término se bloquea con entregas pendientes o premios reservados", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.cierre@eafit.edu.co");
    const challengeId = await seedChallenge(termId);
    const participationId = await seedParticipation(challengeId, personId);
    await expect(closeTermPointsAs({ personId, ip: null }, termId)).rejects.toThrow(
      t("T-2562", { n: 1, m: 0 }),
    );

    const held = await reserve(personId, termId, { participationId });
    await expect(closeTermPointsAs({ personId, ip: null }, termId)).rejects.toThrow(
      t("T-2562", { n: 1, m: 1 }),
    );
    await runCommand({ personId, ip: null }, (ctx) =>
      releaseReward(ctx, held.reward.id, "Liberación sintética"),
    );
    await expect(closeTermPointsAs({ personId, ip: null }, termId)).rejects.toThrow(
      t("T-2562", { n: 1, m: 0 }),
    );

    await db()
      .update(challengeParticipation)
      .set({ status: "COMPLETED", decidedAt: new Date() })
      .where(eq(challengeParticipation.id, participationId));
    await closeTermPointsAs({ personId, ip: null }, termId);
    expect((await getTerm(termId))?.pointsClosedAt).toBeInstanceOf(Date);
  });

  it("dos reservas concurrentes de la misma persona comparten el tope diario", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.carrera@eafit.edu.co");
    const [firstTarget, secondTarget] = await Promise.all([
      rewardTarget(personId, termId),
      rewardTarget(personId, termId),
    ]);
    await warmPool();
    const results = await Promise.all([
      reserve(personId, termId, { participationId: firstTarget, base: 15 }),
      reserve(personId, termId, { participationId: secondTarget, base: 15 }),
    ]);
    const granted = results.map((result) => result.breakdown.baseGranted).sort((a, b) => a - b);
    expect(granted).toEqual([5, 15]);
    const rewards = await db().select().from(reward).where(eq(reward.personId, personId));
    expect(rewards.reduce((total, row) => total + row.baseGranted + row.extraPoints, 0)).toBe(20);
  });

  it("una entrada CHALLENGE no se revierte por la vía manual", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.manual@eafit.edu.co");
    const held = await reserve(personId, termId);
    await runCommand({ personId, ip: null }, (ctx) => grantReward(ctx, held.reward.id, REASONS));
    const [entry] = await db()
      .select()
      .from(pointEntry)
      .where(eq(pointEntry.rewardId, held.reward.id));
    if (!entry) throw new Error("Entrada de prueba ausente");
    expect(entry.kind).toBe("CHALLENGE");
    await expect(
      reverseEntryAs({ personId, ip: null }, entry.id, "Corrección sintética"),
    ).rejects.toThrow(t("T-632"));
    expect(await balanceFor(personId, termId)).toBe(10);
  });

  it("una entrada CHALLENGE sin rewardId viola el check de consistencia", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("gamificacion.check@eafit.edu.co");
    await expect(
      db().insert(pointEntry).values({
        personId,
        termId,
        kind: "CHALLENGE",
        points: 5,
        reason: "Inserción sintética",
      }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "point_entry_reward_consistent"));
    // Y un kind de fuera de la gamificación no puede llevar rewardId.
    const held = await reserve(personId, termId);
    await expect(
      db().insert(pointEntry).values({
        personId,
        termId,
        kind: "ADJUSTMENT",
        points: 5,
        reason: "Inserción sintética",
        rewardId: held.reward.id,
      }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "point_entry_reward_consistent"));
  });
});
