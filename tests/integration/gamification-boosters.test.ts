import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import {
  campaignInputSchema,
  grantBoosterForAchievement,
  listCampaignsAdmin,
} from "@/modules/participation/domain/boosters";
import {
  checkInSelfAs,
  decideCheckInAs,
  hostCheckInAs,
} from "@/modules/participation/domain/commands";
import {
  cancelCampaignAs,
  createCampaignsAs,
  grantBoosterAs,
  revokeBoosterAs,
  setBoosterTargetAs,
  submitTriviaAs,
} from "@/modules/participation/domain/gamification-commands";
import { boosterExpiresAt } from "@/modules/participation/domain/gamification-pure";
import { balanceFor } from "@/modules/participation/domain/ledger";
import {
  achievement,
  badgeDefinition,
  boostCampaign,
  boosterItem,
  challengeParticipation,
  challengeQuestion,
  checkIn,
  pointEntry,
  reward,
} from "@/modules/participation/schema";
import { setConfigAs } from "@/modules/system";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedBooster,
  seedChallenge,
  seedCheckIn,
  seedMember,
  seedOccasion,
  seedTerm,
} from "./factories";

// Boosters y campañas (ADR-067 reglas 4, 6, 7, 8 y 17): apuntado, economía del impulso en
// retos y asistencias, concurrencia, administración manual y ciclo de vida de campañas.

const db = () => getDb();

async function enableGamification(personId: string): Promise<void> {
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
}

async function boosterOf(id: string) {
  const [row] = await db().select().from(boosterItem).where(eq(boosterItem.id, id));
  return row ?? null;
}

async function rewardsFor(checkInId: string) {
  return db().select().from(reward).where(eq(reward.checkInId, checkInId));
}

async function rewardOfParticipation(challengeId: string, personId: string) {
  const [participation] = await db()
    .select()
    .from(challengeParticipation)
    .where(
      and(
        eq(challengeParticipation.challengeId, challengeId),
        eq(challengeParticipation.personId, personId),
      ),
    );
  if (!participation?.rewardId) return { participation, reward: null };
  const [row] = await db().select().from(reward).where(eq(reward.id, participation.rewardId));
  return { participation, reward: row ?? null };
}

async function entriesOf(personId: string, termId: string) {
  return db()
    .select()
    .from(pointEntry)
    .where(and(eq(pointEntry.personId, personId), eq(pointEntry.termId, termId)));
}

/** Trivia publicada con una pregunta de dos opciones; la correcta es la 0. */
async function seedTrivia(termId: string, overrides: Parameters<typeof seedChallenge>[1] = {}) {
  const challengeId = await seedChallenge(termId, overrides);
  await db()
    .insert(challengeQuestion)
    .values({
      challengeId,
      ordinal: 1,
      prompt: "¿Pregunta?",
      options: ["Sí", "No"],
      correctIndex: 0,
    });
  return challengeId;
}

async function answerTrivia(personId: string, challengeId: string) {
  return submitTriviaAs(
    { personId, ip: null },
    { challengeId, requestId: randomUUID(), answers: [0] },
  );
}

describe("boosters: apuntado (setBoosterTarget)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("apunta un booster propio y AVAILABLE a un reto y a una ocasión, y null lo limpia", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("boost.apuntar@eafit.edu.co");
    await enableGamification(personId);
    const challengeId = await seedChallenge(termId);
    const boosterId = await seedBooster(personId, termId);

    const aimed = await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId, target: { challengeId } },
    );
    expect(aimed.targetChallengeId).toBe(challengeId);

    const occasion = await seedOccasion(termId);
    await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId, target: { occasionId: occasion.id } },
    );
    expect((await boosterOf(boosterId))?.targetOccasionId).toBe(occasion.id);
    expect((await boosterOf(boosterId))?.targetChallengeId).toBeNull();

    await setBoosterTargetAs({ personId, ip: null }, { boosterId, target: null });
    const cleared = await boosterOf(boosterId);
    expect(cleared?.targetChallengeId).toBeNull();
    expect(cleared?.targetOccasionId).toBeNull();
  });

  it("rechaza booster ajeno, vencido, usado, objetivo inelegible o ya participado", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("boost.reglas@eafit.edu.co");
    const otherId = await seedMember("boost.otro@eafit.edu.co");
    await enableGamification(personId);
    const challengeId = await seedChallenge(termId);

    // Booster ajeno.
    const foreign = await seedBooster(otherId, termId);
    await expect(
      setBoosterTargetAs({ personId, ip: null }, { boosterId: foreign, target: { challengeId } }),
    ).rejects.toThrow(t("T-032"));

    // Vencido (AVAILABLE con expiresAt pasado → EXPIRED derivado).
    const expired = await seedBooster(personId, termId, "PLUS_50", {
      expiresAt: new Date(Date.now() - 3_600_000),
    });
    await expect(
      setBoosterTargetAs({ personId, ip: null }, { boosterId: expired, target: { challengeId } }),
    ).rejects.toThrow(tList("T-2466")[1] ?? "");

    // Usado (CONSUMED).
    const used = await seedBooster(personId, termId, "PLUS_50", { status: "CONSUMED" });
    await expect(
      setBoosterTargetAs({ personId, ip: null }, { boosterId: used, target: { challengeId } }),
    ).rejects.toThrow(tList("T-2466")[2] ?? "");

    // Reto sin puntos.
    const noPoints = await seedChallenge(termId, { basePoints: 0 });
    const own = await seedBooster(personId, termId);
    await expect(
      setBoosterTargetAs(
        { personId, ip: null },
        { boosterId: own, target: { challengeId: noPoints } },
      ),
    ).rejects.toThrow(tList("T-2466")[3] ?? "");

    // Ya participó del reto.
    const answered = await seedTrivia(termId);
    await answerTrivia(personId, answered);
    await expect(
      setBoosterTargetAs(
        { personId, ip: null },
        { boosterId: own, target: { challengeId: answered } },
      ),
    ).rejects.toThrow(tList("T-2466")[4] ?? "");

    // Ya hizo check-in en la ocasión.
    const occasion = await seedOccasion(termId);
    await seedCheckIn(occasion.id, personId);
    await expect(
      setBoosterTargetAs(
        { personId, ip: null },
        { boosterId: own, target: { occasionId: occasion.id } },
      ),
    ).rejects.toThrow(tList("T-2466")[4] ?? "");

    // Ocasión no voluntaria (reunión de comité) o sin puntos.
    const meeting = await seedOccasion(termId, { category: "COMMITTEE_MEETING" });
    await expect(
      setBoosterTargetAs(
        { personId, ip: null },
        { boosterId: own, target: { occasionId: meeting.id } },
      ),
    ).rejects.toThrow(tList("T-2466")[3] ?? "");
    const noPointsOccasion = await seedOccasion(termId, { points: 0 });
    await expect(
      setBoosterTargetAs(
        { personId, ip: null },
        { boosterId: own, target: { occasionId: noPointsOccasion.id } },
      ),
    ).rejects.toThrow(tList("T-2466")[3] ?? "");
  });

  it("exige la bandera y un solo booster por objetivo", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("boost.unico@eafit.edu.co");
    const challengeId = await seedChallenge(termId);
    const boosterId = await seedBooster(personId, termId);

    // Bandera apagada.
    await expect(
      setBoosterTargetAs({ personId, ip: null }, { boosterId, target: { challengeId } }),
    ).rejects.toThrow(t("T-2442"));

    await enableGamification(personId);
    await setBoosterTargetAs({ personId, ip: null }, { boosterId, target: { challengeId } });

    // Un segundo booster al mismo objetivo viola el único (persona, objetivo).
    const second = await seedBooster(personId, termId);
    await expect(
      setBoosterTargetAs({ personId, ip: null }, { boosterId: second, target: { challengeId } }),
    ).rejects.toThrow(tList("T-2466")[0] ?? "");
  });
});

describe("boosters: economía del impulso en retos", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("trivia con booster +50: BOOST = floor(5 × 0.5) = 2 y el booster queda CONSUMED", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("boost.trivia@eafit.edu.co");
    await enableGamification(personId);
    const challengeId = await seedTrivia(termId);
    const boosterId = await seedBooster(personId, termId, "PLUS_50");
    await setBoosterTargetAs({ personId, ip: null }, { boosterId, target: { challengeId } });

    const result = await answerTrivia(personId, challengeId);
    expect(result.ok).toBe(true);

    const { reward: row } = await rewardOfParticipation(challengeId, personId);
    expect(row).toMatchObject({
      source: "CHALLENGE",
      personalPercent: 50,
      requestedPersonalPercent: 50,
      campaignPercent: 0,
      baseGranted: 5,
      extraPoints: 2,
      boosterItemId: boosterId,
      status: "GRANTED",
    });

    const consumed = await boosterOf(boosterId);
    expect(consumed?.status).toBe("CONSUMED");
    expect(consumed?.consumedRewardId).toBe(row?.id);

    // Ledger: CHALLENGE 5 + BOOST 2.
    const entries = await entriesOf(personId, termId);
    expect(entries.find((e) => e.kind === "CHALLENGE")?.points).toBe(5);
    expect(entries.find((e) => e.kind === "BOOST")?.points).toBe(2);
    expect(await balanceFor(personId, termId)).toBe(7);
  });

  it("campaña +50 con booster +50: extra 5, campaña y booster registrados", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("boost.camp.admin@eafit.edu.co");
    const personId = await seedMember("boost.camp50@eafit.edu.co");
    await enableGamification(adminId);
    const challengeId = await seedTrivia(termId);
    const { ids } = await createCampaignsAs(
      { personId: adminId, ip: null },
      campaignInputSchema.parse({
        name: "Campaña sintética",
        percent: 50,
        challengeIds: [challengeId],
        occasionIds: [],
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt: new Date(Date.now() + 86_400_000),
      }),
    );
    const boosterId = await seedBooster(personId, termId, "PLUS_50");
    await setBoosterTargetAs({ personId, ip: null }, { boosterId, target: { challengeId } });

    await answerTrivia(personId, challengeId);
    const { reward: row } = await rewardOfParticipation(challengeId, personId);
    // floor(5 × 100 %) = 5; la campaña sola daba 2, así que el booster aporta y se consume.
    expect(row).toMatchObject({
      campaignPercent: 50,
      campaignId: ids[0],
      personalPercent: 50,
      requestedPersonalPercent: 50,
      extraPoints: 5,
      boosterItemId: boosterId,
    });
    expect((await boosterOf(boosterId))?.status).toBe("CONSUMED");
  });

  it("campaña +100 con booster: el booster no se consume y se guarda lo pedido", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("boost.camp100.admin@eafit.edu.co");
    const personId = await seedMember("boost.camp100@eafit.edu.co");
    await enableGamification(adminId);
    const challengeId = await seedTrivia(termId);
    await createCampaignsAs(
      { personId: adminId, ip: null },
      campaignInputSchema.parse({
        name: "Campaña total",
        percent: 100,
        challengeIds: [challengeId],
        occasionIds: [],
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt: new Date(Date.now() + 86_400_000),
      }),
    );
    const boosterId = await seedBooster(personId, termId, "PLUS_50");
    await setBoosterTargetAs({ personId, ip: null }, { boosterId, target: { challengeId } });

    await answerTrivia(personId, challengeId);
    const { reward: row } = await rewardOfParticipation(challengeId, personId);
    expect(row).toMatchObject({
      campaignPercent: 100,
      personalPercent: 0,
      requestedPersonalPercent: 50,
      extraPoints: 5,
      boosterItemId: null,
    });
    // El booster sigue disponible y apuntado.
    const kept = await boosterOf(boosterId);
    expect(kept?.status).toBe("AVAILABLE");
    expect(kept?.consumedRewardId).toBeNull();
  });

  it("doble uso concurrente: el mismo booster solo se consume una vez", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("boost.carrera@eafit.edu.co");
    await enableGamification(personId);
    const challengeA = await seedTrivia(termId, { title: "Reto A" });
    const challengeB = await seedTrivia(termId, { title: "Reto B" });
    const boosterId = await seedBooster(personId, termId, "PLUS_50");
    await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId, target: { challengeId: challengeA } },
    );

    // Carrera: enviar A mientras se re-apunta a B y se envía B. Gane quien gane,
    // el booster solo puede terminar consumido por un premio.
    // El re-apunte puede ganarle al envío de A o llegar tarde: ambas entregas deben
    // completar (la que pierde el booster sigue sin él) y el booster se consume una vez.
    const [submitA, submitB] = await Promise.all([
      answerTrivia(personId, challengeA).catch(() => null),
      (async () => {
        try {
          await setBoosterTargetAs(
            { personId, ip: null },
            { boosterId, target: { challengeId: challengeB } },
          );
        } catch {
          // Si A ganó la carrera, el booster ya está reservado/consumido.
        }
        return answerTrivia(personId, challengeB).catch(() => null);
      })(),
    ]);
    expect(submitA).toMatchObject({ ok: true });
    expect(submitB).toMatchObject({ ok: true });

    const consumed = await boosterOf(boosterId);
    expect(consumed?.status).toBe("CONSUMED");
    expect(consumed?.consumedRewardId).not.toBeNull();

    // Exactamente un premio consumió el booster; ambas participaciones existen.
    const rows = await db().select().from(reward).where(eq(reward.boosterItemId, boosterId));
    expect(rows).toHaveLength(1);
    const participations = await db()
      .select()
      .from(challengeParticipation)
      .where(eq(challengeParticipation.personId, personId));
    expect(participations.filter((p) => p.status === "COMPLETED")).toHaveLength(2);
  });
});

describe("boosters: asistencia impulsada (check-in)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it.each([
    { source: "SELF_QR", kind: "PLUS_50", daily: 100, extra: 15 },
    { source: "SELF_QR", kind: "PLUS_100", daily: 100, extra: 30 },
    { source: "HOST", kind: "PLUS_50", daily: 100, extra: 15 },
    { source: "HOST", kind: "PLUS_100", daily: 100, extra: 30 },
    { source: "ADMIN", kind: "PLUS_50", daily: 100, extra: 15 },
    { source: "ADMIN", kind: "PLUS_100", daily: 100, extra: 30 },
    { source: "HOST", kind: "PLUS_100", daily: 20, extra: 20 },
  ] as const)("asistencia de 30 puntos por $source con $kind y tope diario $daily acredita base y extra una sola vez", async ({
    source,
    kind,
    daily,
    extra,
  }) => {
    const termId = await seedTerm();
    const adminId = await seedMember("boost.base.alta.admin@eafit.edu.co");
    const personId = await seedMember("boost.base.alta@eafit.edu.co");
    await enableGamification(adminId);
    await setConfigAs({ personId: adminId, ip: null }, "gamification.caps", { daily, weekly: 500 });
    const occasion = await seedOccasion(termId, { points: 30, approval: "AUTO" });
    const boosterId = await seedBooster(personId, termId, kind);
    await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId, target: { occasionId: occasion.id } },
    );

    const result =
      source === "SELF_QR"
        ? await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId })
        : await hostCheckInAs(
            { personId: adminId, ip: null },
            { occasionId: occasion.id, personId, personName: "Persona sintética", source },
          );
    if (!("checkInId" in result)) throw new Error("check-in falló");
    expect((await rewardsFor(result.checkInId))[0]).toMatchObject({
      source: "CHECKIN",
      basePoints: 30,
      baseGranted: 0,
      extraPoints: extra,
      status: "GRANTED",
    });
    expect((await boosterOf(boosterId))?.status).toBe("CONSUMED");
    const [attendance] = await db().select().from(checkIn).where(eq(checkIn.id, result.checkInId));
    expect(attendance).toMatchObject({ status: "APPROVED", source });

    // Reintentar desde el QR no duplica ni el registro ni sus puntos.
    expect(
      await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId }),
    ).toMatchObject({
      ok: false,
      reason: "ALREADY",
    });
    const entries = await entriesOf(personId, termId);
    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.kind === "CHECKIN")?.points).toBe(30);
    expect(entries.find((entry) => entry.kind === "BOOST")?.points).toBe(extra);
    expect(await balanceFor(personId, termId)).toBe(30 + extra);
  });

  it("check-in AUTO con booster apuntado: CHECKIN + BOOST y el cupo solo cuenta el extra", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("boost.auto@eafit.edu.co");
    await enableGamification(personId);
    const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
    const boosterId = await seedBooster(personId, termId, "PLUS_50");
    await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId, target: { occasionId: occasion.id } },
    );

    const result = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
    expect(result.ok).toBe(true);

    // Ledger: 10 CHECKIN (asistencia normal) + 5 BOOST (floor(10 × 0.5)).
    const entries = await entriesOf(personId, termId);
    expect(entries.find((e) => e.kind === "CHECKIN")?.points).toBe(10);
    expect(entries.find((e) => e.kind === "BOOST")?.points).toBe(5);
    expect(await balanceFor(personId, termId)).toBe(15);

    // El reward solo lleva el extra: baseGranted 0.
    const [checkInRow] = await db().select().from(checkIn).where(eq(checkIn.personId, personId));
    if (!checkInRow) throw new Error("sin check-in");
    const rewards = await rewardsFor(checkInRow.id);
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({
      source: "CHECKIN",
      baseGranted: 0,
      extraPoints: 5,
      personalPercent: 50,
      boosterItemId: boosterId,
      status: "GRANTED",
    });

    // Si la base contara en el tope (15 usados de 20), una trivia de 10 solo recibiría 5.
    // Como no cuenta (5 usados), la base del reto entra completa.
    const challengeId = await seedTrivia(termId, { basePoints: 10 });
    await answerTrivia(personId, challengeId);
    const { reward: challengeReward } = await rewardOfParticipation(challengeId, personId);
    expect(challengeReward?.baseGranted).toBe(10);
  });

  it("check-in MANUAL: reserva, aprueba → GRANTED; rechaza → RELEASED y booster devuelto", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("boost.manual.admin@eafit.edu.co");
    const personId = await seedMember("boost.manual@eafit.edu.co");
    const person2 = await seedMember("boost.manual2@eafit.edu.co");
    await enableGamification(adminId);

    // Camino feliz: PENDING → APPROVED.
    const occasion = await seedOccasion(termId, { points: 10, approval: "MANUAL" });
    const boosterId = await seedBooster(personId, termId, "PLUS_50");
    await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId, target: { occasionId: occasion.id } },
    );
    const pending = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
    if (!pending.ok) throw new Error("check-in manual falló");
    const [reserved] = await rewardsFor(pending.checkInId);
    expect(reserved?.status).toBe("RESERVED");
    expect((await boosterOf(boosterId))?.status).toBe("RESERVED");

    await decideCheckInAs(
      { personId: adminId, ip: null },
      { checkInId: pending.checkInId, decision: "APPROVE" },
    );
    const [granted] = await rewardsFor(pending.checkInId);
    expect(granted?.status).toBe("GRANTED");
    expect((await boosterOf(boosterId))?.status).toBe("CONSUMED");
    const entries = await entriesOf(personId, termId);
    expect(entries.find((e) => e.kind === "BOOST")?.points).toBe(5);

    // Rechazo: RELEASED y el booster vuelve a AVAILABLE.
    const occasion2 = await seedOccasion(termId, { points: 10, approval: "MANUAL" });
    const booster2 = await seedBooster(person2, termId, "PLUS_50");
    await setBoosterTargetAs(
      { personId: person2, ip: null },
      { boosterId: booster2, target: { occasionId: occasion2.id } },
    );
    const rejected = await checkInSelfAs(
      { personId: person2, ip: null },
      { publicId: occasion2.publicId },
    );
    if (!rejected.ok) throw new Error("check-in manual 2 falló");
    await decideCheckInAs(
      { personId: adminId, ip: null },
      { checkInId: rejected.checkInId, decision: "REJECT", reason: "No asistió" },
    );
    const [released] = await rewardsFor(rejected.checkInId);
    expect(released?.status).toBe("RELEASED");
    expect((await boosterOf(booster2))?.status).toBe("AVAILABLE");
    expect((await entriesOf(person2, termId)).find((e) => e.kind === "BOOST")).toBeUndefined();
  });

  it("cancelar un check-in aprobado revierte el BOOST y devuelve el booster vigente", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("boost.cancel.admin@eafit.edu.co");
    const personId = await seedMember("boost.cancel@eafit.edu.co");
    await enableGamification(adminId);
    const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
    const boosterId = await seedBooster(personId, termId, "PLUS_50");
    await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId, target: { occasionId: occasion.id } },
    );
    const done = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
    if (!done.ok) throw new Error("check-in falló");
    expect(await balanceFor(personId, termId)).toBe(15);

    await decideCheckInAs(
      { personId: adminId, ip: null },
      { checkInId: done.checkInId, decision: "CANCEL", reason: "Error de registro" },
    );
    const [reversed] = await rewardsFor(done.checkInId);
    expect(reversed?.status).toBe("REVERSED");
    // Reversión en el ledger y booster devuelto (sigue vigente).
    const entries = await entriesOf(personId, termId);
    expect(entries.some((e) => e.kind === "REVERSAL")).toBe(true);
    expect((await boosterOf(boosterId))?.status).toBe("AVAILABLE");
  });

  it("rechazar y volver a aprobar revive el reward liberado sin violar el único", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("boost.revivir.admin@eafit.edu.co");
    const personId = await seedMember("boost.revivir@eafit.edu.co");
    await enableGamification(adminId);
    const occasion = await seedOccasion(termId, { points: 10, approval: "MANUAL" });
    const boosterId = await seedBooster(personId, termId, "PLUS_50");
    await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId, target: { occasionId: occasion.id } },
    );
    const pending = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
    if (!pending.ok) throw new Error("check-in manual falló");
    await decideCheckInAs(
      { personId: adminId, ip: null },
      { checkInId: pending.checkInId, decision: "REJECT", reason: "Dudoso" },
    );
    expect((await rewardsFor(pending.checkInId))[0]?.status).toBe("RELEASED");
    expect((await boosterOf(boosterId))?.status).toBe("AVAILABLE");

    // Se re-apunta y se re-aprueba: la fila RELEASED revive, no se inserta otra.
    await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId, target: { occasionId: occasion.id } },
    );
    await decideCheckInAs(
      { personId: adminId, ip: null },
      { checkInId: pending.checkInId, decision: "APPROVE" },
    );
    const rewards = await rewardsFor(pending.checkInId);
    expect(rewards).toHaveLength(1);
    expect(rewards[0]?.status).toBe("GRANTED");
    expect((await boosterOf(boosterId))?.status).toBe("CONSUMED");
  });

  it("booster vencido no se aplica; reunión, asamblea o 0 puntos no generan reward", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("boost.vencido@eafit.edu.co");
    await enableGamification(personId);

    // Vencido y apuntado directamente (setBoosterTarget no lo permitiría).
    const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
    await seedBooster(personId, termId, "PLUS_50", {
      expiresAt: new Date(Date.now() - 3_600_000),
      targetOccasionId: occasion.id,
    });
    const result = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
    expect(result.ok).toBe(true);
    const [checkInRow] = await db().select().from(checkIn).where(eq(checkIn.personId, personId));
    if (!checkInRow) throw new Error("sin check-in");
    expect(await rewardsFor(checkInRow.id)).toHaveLength(0);
    expect(await balanceFor(personId, termId)).toBe(10);

    // Reunión de comité y asamblea no son voluntarias; ocasión sin puntos tampoco.
    const meeting = await seedOccasion(termId, { category: "COMMITTEE_MEETING", points: 5 });
    const assembly = await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
    });
    const zero = await seedOccasion(termId, { points: 0 });
    const person2 = await seedMember("boost.novol@eafit.edu.co");
    for (const occ of [meeting, assembly, zero]) {
      const res = await checkInSelfAs({ personId: person2, ip: null }, { publicId: occ.publicId });
      expect(res.ok).toBe(true);
    }
    const rows = await db().select().from(reward);
    expect(rows.filter((r) => r.source === "CHECKIN")).toHaveLength(0);
  });

  it("checkInSelfAs con boosterId arma y aplica en la misma transacción", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("boost.selector@eafit.edu.co");
    await enableGamification(personId);
    const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
    const boosterId = await seedBooster(personId, termId, "PLUS_50");

    const result = await checkInSelfAs(
      { personId, ip: null },
      { publicId: occasion.publicId, boosterId },
    );
    expect(result).toMatchObject({ ok: true });
    const applied = await boosterOf(boosterId);
    expect(applied?.status).toBe("CONSUMED");
    expect(applied?.targetOccasionId).toBe(occasion.id);

    // Booster inválido → denial BOOSTER con el mensaje del dominio, sin crear el check-in.
    const other = await seedMember("boost.selector2@eafit.edu.co");
    const occasion2 = await seedOccasion(termId, { points: 10, approval: "AUTO" });
    const foreign = await seedBooster(other, termId);
    const denied = await checkInSelfAs(
      { personId, ip: null },
      { publicId: occasion2.publicId, boosterId: foreign },
    );
    expect(denied).toMatchObject({ ok: false, reason: "BOOSTER" });
    expect("message" in denied && denied.message).toBeTruthy();
    const [row] = await db()
      .select()
      .from(checkIn)
      .where(and(eq(checkIn.personId, personId), eq(checkIn.occasionId, occasion2.id)));
    expect(row).toBeUndefined();
  });
});

describe("campañas de impulso", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("createCampaigns valida objetivos, ventana y término; una fila por objetivo", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("camp.valida@eafit.edu.co");
    await enableGamification(adminId);
    const challengeId = await seedChallenge(termId);
    const occasion = await seedOccasion(termId);
    const now = Date.now();
    const window = {
      startsAt: new Date(now - 3_600_000),
      endsAt: new Date(now + 86_400_000),
    };

    // Sin objetivos.
    await expect(
      createCampaignsAs(
        { personId: adminId, ip: null },
        campaignInputSchema.parse({
          name: "Vacía",
          percent: 50,
          challengeIds: [],
          occasionIds: [],
          ...window,
        }),
      ),
    ).rejects.toThrow(tList("T-2539")[0] ?? "");

    // Ventana invertida.
    await expect(
      createCampaignsAs(
        { personId: adminId, ip: null },
        campaignInputSchema.parse({
          name: "Invertida",
          percent: 50,
          challengeIds: [challengeId],
          occasionIds: [],
          startsAt: window.endsAt,
          endsAt: window.startsAt,
        }),
      ),
    ).rejects.toThrow(tList("T-2539")[1] ?? "");

    // Objetivo de otro término.
    const otherTerm = await seedTerm("2099-1");
    const foreign = await seedChallenge(otherTerm);
    await expect(
      createCampaignsAs(
        { personId: adminId, ip: null },
        campaignInputSchema.parse({
          name: "Ajena",
          percent: 50,
          challengeIds: [foreign],
          occasionIds: [],
          ...window,
        }),
      ),
    ).rejects.toThrow(tList("T-2539")[2] ?? "");

    const { ids } = await createCampaignsAs(
      { personId: adminId, ip: null },
      campaignInputSchema.parse({
        name: "Doble objetivo",
        percent: 25,
        challengeIds: [challengeId],
        occasionIds: [occasion.id],
        ...window,
      }),
    );
    expect(ids).toHaveLength(2);
    const rows = await db().select().from(boostCampaign);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.termId === termId && r.percent === 25)).toBe(true);
    expect(
      (await db().select().from(auditLog).where(eq(auditLog.action, "campaign.created"))).length,
    ).toBe(2);
  });

  it("la campaña activa más alta gana, respeta la ventana y se cancela", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("camp.activa@eafit.edu.co");
    const personId = await seedMember("camp.activa.miembro@eafit.edu.co");
    await enableGamification(adminId);
    const challengeId = await seedTrivia(termId);
    const now = Date.now();

    // Campaña pasada (+100) no aplica; la vigente +50 sí; una futura +25 espera.
    const base = { challengeIds: [challengeId], occasionIds: [], percent: 50 };
    await createCampaignsAs(
      { personId: adminId, ip: null },
      campaignInputSchema.parse({
        ...base,
        name: "Pasada",
        percent: 100,
        startsAt: new Date(now - 172_800_000),
        endsAt: new Date(now - 86_400_000),
      }),
    );
    const { ids } = await createCampaignsAs(
      { personId: adminId, ip: null },
      campaignInputSchema.parse({
        ...base,
        name: "Vigente",
        percent: 50,
        startsAt: new Date(now - 3_600_000),
        endsAt: new Date(now + 86_400_000),
      }),
    );
    await createCampaignsAs(
      { personId: adminId, ip: null },
      campaignInputSchema.parse({
        ...base,
        name: "Futura",
        percent: 25,
        startsAt: new Date(now + 86_400_000),
        endsAt: new Date(now + 172_800_000),
      }),
    );

    // Vigente +25 y +50 solapadas → gana la mayor.
    await createCampaignsAs(
      { personId: adminId, ip: null },
      campaignInputSchema.parse({
        ...base,
        name: "Vigente menor",
        percent: 25,
        startsAt: new Date(now - 3_600_000),
        endsAt: new Date(now + 86_400_000),
      }),
    );

    await answerTrivia(personId, challengeId);
    const { reward: row } = await rewardOfParticipation(challengeId, personId);
    const campaignId = ids[0];
    if (!campaignId) throw new Error("sin campaña");
    expect(row?.campaignPercent).toBe(50);
    expect(row?.campaignId).toBe(campaignId);

    // Cancelación: pasa a CANCELLED y deja de aplicar.
    await cancelCampaignAs({ personId: adminId, ip: null }, campaignId);
    const [cancelled] = await db()
      .select()
      .from(boostCampaign)
      .where(eq(boostCampaign.id, campaignId));
    if (!cancelled) throw new Error("sin campaña cancelada");
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).not.toBeNull();

    const list = await listCampaignsAdmin(termId, new Date());
    const byName = Object.fromEntries(list.map((c) => [c.name, c.state]));
    expect(byName.Pasada).toBe("ENDED");
    expect(byName.Vigente).toBe("CANCELLED");
    expect(byName.Futura).toBe("SCHEDULED");
    expect(byName["Vigente menor"]).toBe("ACTIVE");
  });
});

describe("boosters: administración", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("el alta manual vence al fin del término, exige motivo y audita", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("boost.admin@eafit.edu.co");
    const personId = await seedMember("boost.admin.miembro@eafit.edu.co");
    const [termRow] = await db().select().from(term).where(eq(term.id, termId));
    if (!termRow) throw new Error("sin término");

    await expect(
      grantBoosterAs(
        { personId: adminId, ip: null },
        { personId, termId, kind: "PLUS_50", reason: "   " },
      ),
    ).rejects.toThrow();

    const granted = await grantBoosterAs(
      { personId: adminId, ip: null },
      { personId, termId, kind: "PLUS_100", reason: "Reconocimiento sintético" },
    );
    expect(granted.status).toBe("AVAILABLE");
    expect(granted.expiresAt.toISOString()).toBe(
      boosterExpiresAt({ endsOn: termRow.endsOn }).toISOString(),
    );
    expect(granted.grantedById).toBe(adminId);

    const audits = await db().select().from(auditLog).where(eq(auditLog.action, "booster.granted"));
    expect(audits.length).toBeGreaterThan(0);
    const events = await db().select({ type: outbox.eventType }).from(outbox);
    expect(events.map((e) => e.type)).toContain("booster.granted");
  });

  it("el alta por logro es idempotente", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("boost.logro@eafit.edu.co");
    // Las insignias canónicas ya vienen sembradas por la migración: se reutiliza una.
    const [badge] = await db().select({ id: badgeDefinition.id }).from(badgeDefinition).limit(1);
    if (!badge) throw new Error("sin insignias sembradas");
    const [unlocked] = await db()
      .insert(achievement)
      .values({ personId, badgeId: badge.id, termId, sourceKind: "MANUAL" })
      .returning({ id: achievement.id });
    if (!unlocked) throw new Error("sin logro");

    const first = await runCommand({ personId, ip: null }, (ctx) =>
      grantBoosterForAchievement(ctx, {
        personId,
        termId,
        achievementId: unlocked.id,
        level: 2,
      }),
    );
    expect(first?.kind).toBe("PLUS_50");
    expect(first?.sourceAchievementId).toBe(unlocked.id);

    const second = await runCommand({ personId, ip: null }, (ctx) =>
      grantBoosterForAchievement(ctx, {
        personId,
        termId,
        achievementId: unlocked.id,
        level: 2,
      }),
    );
    expect(second).toBeNull();
    const rows = await db().select().from(boosterItem).where(eq(boosterItem.personId, personId));
    expect(rows).toHaveLength(1);
  });

  it("revocar solo aplica a AVAILABLE", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("boost.revoca@eafit.edu.co");
    const personId = await seedMember("boost.revoca.miembro@eafit.edu.co");
    const available = await seedBooster(personId, termId);
    const consumed = await seedBooster(personId, termId, "PLUS_50", { status: "CONSUMED" });

    await expect(
      revokeBoosterAs({ personId: adminId, ip: null }, { boosterId: consumed, reason: "Prueba" }),
    ).rejects.toThrow();

    await revokeBoosterAs(
      { personId: adminId, ip: null },
      { boosterId: available, reason: "Otorgado por error" },
    );
    const revoked = await boosterOf(available);
    expect(revoked?.status).toBe("REVOKED");
    expect(revoked?.revokedById).toBe(adminId);
    expect(revoked?.revokeReason).toBe("Otorgado por error");
  });
});
