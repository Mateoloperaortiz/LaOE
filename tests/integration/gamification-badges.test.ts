import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { occasionClosed, wordleCompleted } from "@/domain-events/participation";
import { saveSubscriptionAs, setPushSenderForTests } from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { interaction } from "@/modules/crm/schema";
import {
  badgeFactsFor,
  collectionFor,
  listFeaturedBadgesFor,
  listRevokedWithUsedBooster,
  markSeen,
  recomputeBadgesFor,
  setFeatured,
} from "@/modules/participation/domain/badges";
import { checkInSelfAs } from "@/modules/participation/domain/commands";
import {
  createSpecialBadgeAs,
  publishChallengeAs,
  reviewParticipationAs,
  submitTriviaAs,
} from "@/modules/participation/domain/gamification-commands";
import {
  achievement,
  badgeDefinition,
  boosterItem,
  challengeParticipation,
  challengeQuestion,
  challenge as challengeTable,
  checkIn,
  wordleGame,
} from "@/modules/participation/schema";
import { membership } from "@/modules/people/schema";
import { setConfig, setConfigAs } from "@/modules/system";
import { auditLog, outbox } from "@/modules/system/schema";
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { decideInOwnOccasion } from "../helpers/check-ins";
import { itemPattern } from "../helpers/copy";
import { drainOutbox } from "../helpers/outbox";
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

// Colección de insignias (ADR-067 reglas 9, 10, 15 y 17): los hechos que sostienen cada familia,
// el desbloqueo idempotente con su booster, la revocación cuando el hecho desaparece, destacadas,
// ediciones especiales y el flujo completo por el outbox (push + línea de tiempo).

const db = () => getDb();

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */

async function enableGamification(personId: string): Promise<void> {
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
}

async function achievementsOf(personId: string) {
  return db().select().from(achievement).where(eq(achievement.personId, personId));
}

async function liveAchievementsOf(personId: string) {
  return db()
    .select()
    .from(achievement)
    .where(and(eq(achievement.personId, personId), isNull(achievement.revokedAt)));
}

async function boostersOf(personId: string) {
  return db().select().from(boosterItem).where(eq(boosterItem.personId, personId));
}

async function badgeOf(code: string) {
  const [row] = await db().select().from(badgeDefinition).where(eq(badgeDefinition.code, code));
  if (!row) throw new Error(`badge ${code}`);
  return row;
}

async function outboxOf(type: string) {
  return db().select().from(outbox).where(eq(outbox.eventType, type));
}

async function messagesOf(personId: string) {
  return db().select().from(message).where(eq(message.personId, personId));
}

async function interactionsOf(personId: string) {
  return db().select().from(interaction).where(eq(interaction.personId, personId));
}

/** Check-in aprobado importado de GHPOINTS (ADR-067: las importadas cuentan como hechos). */
async function seedImportedCheckIn(occasionId: string, personId: string, at: Date) {
  const [row] = await db()
    .insert(checkIn)
    .values({ occasionId, personId, status: "APPROVED", source: "IMPORT", at })
    .returning();
  if (!row) throw new Error("seed import");
  return row;
}

describe("insignias: hechos", () => {
  beforeEach(async () => {
    await truncateAll();
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "gamification.enabled", true));
  });
  afterAll(closeDb);

  it("En parche cuenta actividades voluntarias aprobadas —también importadas— y no reuniones ni asambleas", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("hechos1@test.dev");
    const voluntary = await seedOccasion(termId, { points: 10 });
    const meeting = await seedOccasion(termId, { category: "COMMITTEE_MEETING", points: 0 });
    const assembly = await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
    });
    await seedCheckIn(voluntary.id, personId);
    await seedCheckIn(meeting.id, personId);
    await seedCheckIn(assembly.id, personId);
    const imported = await seedOccasion(termId, { points: 5 });
    await seedImportedCheckIn(imported.id, personId, new Date("2024-03-05T15:00:00Z"));

    const facts = await badgeFactsFor(personId);
    expect(facts.EN_PARCHE).toHaveLength(2);
    // Orden por checkIn.at: la importada de 2024 primero.
    expect(facts.EN_PARCHE[0]?.sourceKind).toBe("CHECKIN");
    expect(facts.EN_PARCHE[0]?.at.toISOString()).toBe("2024-03-05T15:00:00.000Z");
  });

  it("Explorador cuenta el primer check-in por comité distinto", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("hechos2@test.dev");
    const committeeA = await seedCommittee("comite-a", "Comité A");
    const committeeB = await seedCommittee("comite-b", "Comité B");
    const a1 = await seedOccasion(termId, { committeeId: committeeA });
    const a2 = await seedOccasion(termId, { committeeId: committeeA });
    const b1 = await seedOccasion(termId, { committeeId: committeeB });
    const sinComite = await seedOccasion(termId);
    await seedCheckIn(a1.id, personId);
    await seedCheckIn(a2.id, personId);
    await seedCheckIn(b1.id, personId);
    await seedCheckIn(sinComite.id, personId);

    const facts = await badgeFactsFor(personId);
    expect(facts.EN_PARCHE).toHaveLength(4);
    expect(facts.EXPLORADOR).toHaveLength(2);
  });

  it("Relámpago cuenta retos COMPLETED y Palabra a palabra los Wordles WON", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("hechos3@test.dev");
    await seedParticipation(await seedChallenge(termId), personId, { status: "COMPLETED" });
    await seedParticipation(await seedChallenge(termId), personId, { status: "PENDING" });
    await seedParticipation(await seedChallenge(termId), personId, { status: "REJECTED" });
    await db()
      .insert(wordleGame)
      .values({
        personId,
        day: "2024-05-10",
        termId,
        answer: "PRUEB",
        dictionaryVersion: "test",
        rulesVersion: "test",
        status: "WON",
        completedAt: new Date("2024-05-10T20:00:00Z"),
      });
    await db()
      .insert(wordleGame)
      .values({
        personId,
        day: "2024-05-11",
        termId,
        answer: "PRUEB",
        dictionaryVersion: "test",
        rulesVersion: "test",
        status: "LOST",
        completedAt: new Date("2024-05-11T20:00:00Z"),
      });

    const facts = await badgeFactsFor(personId);
    expect(facts.RELAMPAGO).toHaveLength(1);
    expect(facts.PALABRA_A_PALABRA).toHaveLength(1);
    expect(facts.PALABRA_A_PALABRA[0]?.label).toBe("2024-05-10");
  });
});

/** Trivia publicada con una pregunta de dos opciones; la correcta es la 0. */
async function seedTrivia(termId: string): Promise<string> {
  const challengeId = await seedChallenge(termId);
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

describe("insignias: desbloqueo y revocación", () => {
  beforeEach(async () => {
    await truncateAll();
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "gamification.enabled", true));
  });
  afterAll(closeDb);

  it("desbloquea En parche 1 con la fecha del hecho, otorga su booster y emite badge.unlocked", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("desbloqueo1@test.dev");
    const occ = await seedOccasion(termId);
    const checkInId = await seedCheckIn(occ.id, personId);
    const [checkInRow] = await db().select().from(checkIn).where(eq(checkIn.id, checkInId));

    const delta = await recomputeBadgesFor(personId, { historical: false });
    expect(delta.unlocked).toHaveLength(1);
    expect(delta.unlocked[0]?.code).toBe("EN_PARCHE_1");
    expect(delta.unlocked[0]?.boosterKind).toBe("PLUS_50");

    const [logro] = await liveAchievementsOf(personId);
    expect(logro?.unlockedAt.getTime()).toBe(checkInRow?.at.getTime());
    expect(logro?.termId).toBe(termId);
    expect(logro?.sourceKind).toBe("CHECKIN");
    expect(logro?.sourceRef).toBe(checkInId);
    expect(logro?.historical).toBe(false);

    const boosters = await boostersOf(personId);
    expect(boosters).toHaveLength(1);
    expect(boosters[0]?.kind).toBe("PLUS_50");
    expect(boosters[0]?.sourceAchievementId).toBe(logro?.id);
    expect(boosters[0]?.status).toBe("AVAILABLE");

    const events = await outboxOf("badge.unlocked");
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      achievementId: logro?.id,
      personId,
      code: "EN_PARCHE_1",
      historical: false,
      boosterKind: "PLUS_50",
    });
  });

  it("segunda corrida no duplica el logro ni otorga otro booster", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("desbloqueo2@test.dev");
    await seedCheckIn((await seedOccasion(termId)).id, personId);
    await recomputeBadgesFor(personId, { historical: false });
    const second = await recomputeBadgesFor(personId, { historical: false });
    expect(second.unlocked).toHaveLength(0);
    expect(second.revoked).toHaveLength(0);
    expect(await liveAchievementsOf(personId)).toHaveLength(1);
    expect(await boostersOf(personId)).toHaveLength(1);
    expect(await outboxOf("badge.unlocked")).toHaveLength(1);
  });

  it("historical reconoce el logro sin booster ni evento", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("desbloqueo3@test.dev");
    await seedCheckIn((await seedOccasion(termId)).id, personId);
    const delta = await recomputeBadgesFor(personId, { historical: true });
    expect(delta.unlocked).toHaveLength(1);
    expect(delta.unlocked[0]?.boosterKind).toBeNull();
    const [logro] = await liveAchievementsOf(personId);
    expect(logro?.historical).toBe(true);
    expect(await boostersOf(personId)).toHaveLength(0);
    expect(await outboxOf("badge.unlocked")).toHaveLength(0);
  });

  it("el nivel 3 otorga PLUS_100", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("desbloqueo4@test.dev");
    for (let i = 0; i < 15; i += 1) {
      await seedCheckIn((await seedOccasion(termId)).id, personId);
    }
    const delta = await recomputeBadgesFor(personId, { historical: false });
    expect(delta.unlocked).toHaveLength(3);
    const level3 = delta.unlocked.find((item) => item.level === 3);
    expect(level3?.code).toBe("EN_PARCHE_3");
    expect(level3?.boosterKind).toBe("PLUS_100");
    const boosters = await boostersOf(personId);
    expect(boosters.map((item) => item.kind).sort()).toEqual(["PLUS_100", "PLUS_50", "PLUS_50"]);
  });

  it("dryRun informa el delta sin escribir nada", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("desbloqueo5@test.dev");
    await seedCheckIn((await seedOccasion(termId)).id, personId);
    const delta = await recomputeBadgesFor(personId, { historical: false, dryRun: true });
    expect(delta.unlocked).toHaveLength(1);
    expect(await achievementsOf(personId)).toHaveLength(0);
    expect(await boostersOf(personId)).toHaveLength(0);
    expect(await outboxOf("badge.unlocked")).toHaveLength(0);
    const audits = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "achievement.unlocked"));
    expect(audits).toHaveLength(0);
  });

  it("al cancelar el hecho el logro se revoca y su booster disponible se retira", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("revoca1@test.dev");
    const adminId = await seedMember("revoca1-admin@test.dev");
    const occ = await seedOccasion(termId);
    const checkInId = await seedCheckIn(occ.id, personId);
    await recomputeBadgesFor(personId, { historical: false });

    await decideInOwnOccasion(
      { personId: adminId, ip: null },
      { checkInId, decision: "CANCEL", reason: "error de registro" },
    );
    const delta = await recomputeBadgesFor(personId, { historical: false });
    expect(delta.revoked).toHaveLength(1);
    expect(delta.revoked[0]?.code).toBe("EN_PARCHE_1");
    expect(delta.revoked[0]?.boosterUsed).toBe(false);

    expect(await liveAchievementsOf(personId)).toHaveLength(0);
    const [logro] = await achievementsOf(personId);
    expect(logro?.revokedAt).not.toBeNull();
    expect(logro?.revokeReason).toBe("SOURCE_REMOVED");
    const [booster] = await boostersOf(personId);
    expect(booster?.status).toBe("REVOKED");
    expect(booster?.revokeReason).toBe("ACHIEVEMENT_REVOKED");
  });

  it("si el booster ya se consumió, el delta lo marca para revisión de GH", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("revoca2@test.dev");
    const adminId = await seedMember("revoca2-admin@test.dev");
    const occ = await seedOccasion(termId);
    const checkInId = await seedCheckIn(occ.id, personId);
    await recomputeBadgesFor(personId, { historical: false });
    const [booster] = await boostersOf(personId);
    await db()
      .update(boosterItem)
      .set({ status: "CONSUMED" })
      .where(eq(boosterItem.id, booster?.id ?? ""));

    await decideInOwnOccasion(
      { personId: adminId, ip: null },
      { checkInId, decision: "CANCEL", reason: "error de registro" },
    );
    const delta = await recomputeBadgesFor(personId, { historical: false });
    expect(delta.revoked[0]?.boosterUsed).toBe(true);

    const audits = await db()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "achievement.revoked"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.after).toMatchObject({ boosterUsed: true });

    const review = await listRevokedWithUsedBooster(termId);
    expect(review).toHaveLength(1);
    expect(review[0]?.personId).toBe(personId);
  });
});

describe("insignias: destacadas, vistas y colección", () => {
  beforeEach(async () => {
    await truncateAll();
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "gamification.enabled", true));
  });
  afterAll(closeDb);

  it("destaca hasta tres posiciones y la cuarta responde T-2493", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("destaca1@test.dev");
    // Cuatro logros: En parche 1, Explorador 1 (dos comités), Relámpago 1 y Palabra 1.
    const committeeA = await seedCommittee("dest-a", "Comité A");
    const committeeB = await seedCommittee("dest-b", "Comité B");
    await seedCheckIn((await seedOccasion(termId, { committeeId: committeeA })).id, personId);
    await seedCheckIn((await seedOccasion(termId, { committeeId: committeeB })).id, personId);
    await seedParticipation(await seedChallenge(termId), personId, { status: "COMPLETED" });
    await db()
      .insert(wordleGame)
      .values({
        personId,
        day: "2024-07-01",
        termId,
        answer: "PRUEB",
        dictionaryVersion: "test",
        rulesVersion: "test",
        status: "WON",
        completedAt: new Date("2024-07-01T18:00:00Z"),
      });
    await recomputeBadgesFor(personId, { historical: true });
    const logros = await liveAchievementsOf(personId);
    expect(logros).toHaveLength(4);

    for (const logro of logros.slice(0, 3)) {
      await runCommand({ personId, ip: null }, (ctx) =>
        setFeatured(ctx, { personId, achievementId: logro.id, featured: true }),
      );
    }
    const featured = await listFeaturedBadgesFor([personId]);
    expect(featured.get(personId)).toHaveLength(3);
    const posiciones = (await liveAchievementsOf(personId))
      .map((item) => item.featuredPosition)
      .filter((item): item is number => item !== null)
      .sort();
    expect(posiciones).toEqual([1, 2, 3]);

    await expect(
      runCommand({ personId, ip: null }, (ctx) =>
        setFeatured(ctx, { personId, achievementId: logros[3]?.id ?? "", featured: true }),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining(t("T-2493")) });

    // Quitar una libera su posición y la cuarta la puede ocupar.
    await runCommand({ personId, ip: null }, (ctx) =>
      setFeatured(ctx, { personId, achievementId: logros[0]?.id ?? "", featured: false }),
    );
    await runCommand({ personId, ip: null }, (ctx) =>
      setFeatured(ctx, { personId, achievementId: logros[3]?.id ?? "", featured: true }),
    );
    expect((await listFeaturedBadgesFor([personId])).get(personId)).toHaveLength(3);
  });

  it("markSeen saca el logro de las no vistas y la colección arma el progreso completo", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("vistas1@test.dev");
    await seedCheckIn((await seedOccasion(termId)).id, personId);
    await recomputeBadgesFor(personId, { historical: false });
    const [logro] = await liveAchievementsOf(personId);

    let collection = await collectionFor(personId);
    expect(collection.unseen).toHaveLength(1);
    expect(collection.unseen[0]?.boosterKind).toBe("PLUS_50");
    const enParche = collection.families.find((item) => item.family === "EN_PARCHE");
    expect(enParche?.progress).toMatchObject({ current: 1, next: 5, level: 1 });
    expect(enParche?.levels[0]?.achievement?.id).toBe(logro?.id);
    expect(enParche?.levels[0]?.origin).not.toBe("");

    await runCommand({ personId, ip: null }, (ctx) => markSeen(ctx, personId, [logro?.id ?? ""]));
    collection = await collectionFor(personId);
    expect(collection.unseen).toHaveLength(0);
    const [after] = await achievementsOf(personId);
    expect(after?.seenAt).not.toBeNull();
  });
});

describe("ediciones especiales", () => {
  beforeEach(async () => {
    await truncateAll();
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "gamification.enabled", true));
  });
  afterAll(closeDb);

  it("vinculada a una ocasión ya cerrada otorga a los asistentes aprobados de inmediato", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("especial1-admin@test.dev");
    const asistente = await seedMember("especial1@test.dev");
    const ausente = await seedMember("especial1-b@test.dev");
    const occ = await seedOccasion(termId, { status: "CLOSED", title: "Edición de prueba" });
    await seedCheckIn(occ.id, asistente);
    await seedCheckIn(occ.id, ausente, "REJECTED");

    const { id } = await createSpecialBadgeAs(
      { personId: adminId, ip: null },
      {
        name: "Edición relámpago",
        description: "La primera edición de prueba",
        specialOccasionId: occ.id,
        specialChallengeId: null,
      },
    );
    expect(id).toBeTruthy();
    const [badge] = await db().select().from(badgeDefinition).where(eq(badgeDefinition.id, id));
    expect(badge?.family).toBe("SPECIAL");
    expect(badge?.code.startsWith("SPECIAL_")).toBe(true);

    const logrosAsistente = await liveAchievementsOf(asistente);
    expect(logrosAsistente).toHaveLength(1);
    expect(logrosAsistente[0]?.sourceKind).toBe("OCCASION");
    expect(logrosAsistente[0]?.sourceRef).toBe(occ.id);
    expect(await liveAchievementsOf(ausente)).toHaveLength(0);
    // La especial de nivel 1 también trae su booster.
    const boosters = await boostersOf(asistente);
    expect(boosters).toHaveLength(1);
    expect(boosters[0]?.kind).toBe("PLUS_50");
    expect(await outboxOf("badge.unlocked")).toHaveLength(1);
  });

  it("el cierre de la ocasión otorga la especial a los aprobados por el outbox", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("especial2-admin@test.dev");
    const asistente = await seedMember("especial2@test.dev");
    const occ = await seedOccasion(termId, {
      status: "OPEN",
      title: "Ocasión especial",
      points: 10,
    });
    await seedCheckIn(occ.id, asistente);
    await createSpecialBadgeAs(
      { personId: adminId, ip: null },
      {
        name: "Especial de cierre",
        description: "",
        specialOccasionId: occ.id,
        specialChallengeId: null,
      },
    );
    expect(await liveAchievementsOf(asistente)).toHaveLength(0);

    // El mismo payload que emite closeOccasion (occasionId + termId + points).
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      ctx.emit(eventOf(occasionClosed, { occasionId: occ.id, termId, points: 10 })),
    );
    await drainOutbox();
    const logros = await liveAchievementsOf(asistente);
    expect(logros).toHaveLength(1);
  });
});

describe("flujo en vivo por el outbox", () => {
  const delivered: string[] = [];
  beforeEach(async () => {
    await truncateAll();
    delivered.length = 0;
    setPushSenderForTests(async (subscription) => {
      delivered.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
  });
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("un check-in voluntario desbloquea En parche 1, otorga el booster, pushea y anota en la línea de tiempo", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("flujo1@test.dev");
    await enableGamification(personId);
    await saveSubscriptionAs(
      { personId, ip: null },
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/flujo1",
        keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) },
      },
      null,
    );
    const occ = await seedOccasion(termId, { points: 10, title: "Actividad del parche" });

    const result = await checkInSelfAs({ personId, ip: null }, { publicId: occ.publicId });
    expect(result.ok).toBe(true);
    await drainOutbox();

    const logros = await liveAchievementsOf(personId);
    expect(logros).toHaveLength(1);
    const [badge] = await db()
      .select()
      .from(badgeDefinition)
      .where(eq(badgeDefinition.id, logros[0]?.badgeId ?? ""));
    expect(badge?.code).toBe("EN_PARCHE_1");
    expect(await boostersOf(personId)).toHaveLength(1);

    const messages = await messagesOf(personId);
    // Puntos del check-in + insignia desbloqueada.
    const badgePush = messages.find((item) => item.dedupeKey?.startsWith("badge:"));
    expect(badgePush?.subject).toContain(tList("T-2569")[0]);
    const interacciones = await interactionsOf(personId);
    const badgeInteraction = interacciones.find((item) =>
      item.summary.includes(fillCopy(tList("T-667")[9], { insignia: "En parche", nivel: 1 })),
    );
    expect(badgeInteraction?.kind).toBe("PARTICIPATION");
    expect(badgeInteraction?.summary).toContain("En parche");
  });

  it("un Wordle ganado desbloquea Palabra a palabra 1 al drenar", async () => {
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "gamification.enabled", true));
    const termId = await seedTerm();
    const personId = await seedMember("flujo2@test.dev");
    const [game] = await db()
      .insert(wordleGame)
      .values({
        personId,
        day: "2024-06-01",
        termId,
        answer: "PRUEB",
        dictionaryVersion: "test",
        rulesVersion: "test",
        status: "WON",
        completedAt: new Date("2024-06-01T18:00:00Z"),
      })
      .returning();
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      ctx.emit(
        eventOf(wordleCompleted, {
          personId,
          termId,
          gameId: game?.id ?? "",
          day: "2024-06-01",
          attempts: 3,
          points: 5,
        }),
      ),
    );
    await drainOutbox();
    const logros = await liveAchievementsOf(personId);
    expect(logros).toHaveLength(1);
    const [badge] = await db()
      .select()
      .from(badgeDefinition)
      .where(eq(badgeDefinition.id, logros[0]?.badgeId ?? ""));
    expect(badge?.code).toBe("PALABRA_A_PALABRA_1");
  });

  it("publicar un reto pushea solo a su audiencia y completarlo pushea y anota", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("flujo3-admin@test.dev");
    const nuevo = await seedMember("flujo3-nuevo@test.dev");
    const veterano = await seedMember("flujo3-viejo@test.dev");
    // El veterano entró en un término anterior: firstTermId distinto.
    const termViejo = await seedTerm("2023-1");
    await db()
      .update(membership)
      .set({ firstTermId: termViejo })
      .where(eq(membership.personId, veterano));
    const keys = () => ({ p256dh: "p".repeat(32), auth: "a".repeat(16) });
    await saveSubscriptionAs(
      { personId: nuevo, ip: null },
      { endpoint: "https://fcm.googleapis.com/fcm/send/nuevo", keys: keys() },
      null,
    );
    await saveSubscriptionAs(
      { personId: veterano, ip: null },
      { endpoint: "https://fcm.googleapis.com/fcm/send/viejo", keys: keys() },
      null,
    );
    await enableGamification(nuevo);

    const challengeId = await seedTrivia(termId);
    await db()
      .update(challengeTable)
      .set({ status: "DRAFT", publishedAt: null, audience: "NEW" })
      .where(eq(challengeTable.id, challengeId));
    await publishChallengeAs({ personId: adminId, ip: null }, challengeId);
    await drainOutbox();

    const pushNuevo = (await messagesOf(nuevo)).find(
      (item) => item.dedupeKey === `challenge:${challengeId}`,
    );
    expect(pushNuevo).toBeTruthy();
    expect(pushNuevo?.subject).toMatch(itemPattern(tList("T-2566")[0]));
    expect(
      (await messagesOf(veterano)).filter((item) => item.dedupeKey === `challenge:${challengeId}`),
    ).toHaveLength(0);

    // Completar la trivia: push T-2567 + interacción PARTICIPATION + insignia Relámpago 1.
    const result = await submitTriviaAs(
      { personId: nuevo, ip: null },
      { challengeId, requestId: randomUUID(), answers: [0] },
    );
    expect(result.ok).toBe(true);
    await drainOutbox();

    const completed = await db()
      .select()
      .from(challengeParticipation)
      .where(
        and(
          eq(challengeParticipation.challengeId, challengeId),
          eq(challengeParticipation.personId, nuevo),
        ),
      );
    expect(completed[0]?.status).toBe("COMPLETED");
    const pushCompleto = (await messagesOf(nuevo)).find((item) =>
      item.dedupeKey?.startsWith(`challenge:${completed[0]?.id}`),
    );
    expect(pushCompleto).toBeTruthy();
    const interacciones = await interactionsOf(nuevo);
    expect(interacciones.some((item) => itemPattern(tList("T-667")[8]).test(item.summary))).toBe(
      true,
    );
    const relampago = (await liveAchievementsOf(nuevo)).map((item) => item.badgeId);
    const relampagoBadge = await badgeOf("RELAMPAGO_1");
    expect(relampago).toContain(relampagoBadge.id);
  });

  it("una entrega rechazada pushea T-2568 y anota en la línea de tiempo", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("flujo4-admin@test.dev");
    const personId = await seedMember("flujo4@test.dev");
    await saveSubscriptionAs(
      { personId, ip: null },
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/flujo4",
        keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) },
      },
      null,
    );
    const challengeId = await seedChallenge(termId, { kind: "EVIDENCE", title: "Reto evidencia" });
    await seedParticipation(challengeId, personId, { status: "PENDING" });
    const [pending] = await db()
      .select()
      .from(challengeParticipation)
      .where(
        and(
          eq(challengeParticipation.challengeId, challengeId),
          eq(challengeParticipation.personId, personId),
        ),
      );

    await reviewParticipationAs(
      { personId: adminId, ip: null },
      {
        participationId: pending?.id ?? "",
        decision: "REJECT",
        reason: "No se ve la actividad",
      },
    );
    await drainOutbox();

    const pushRechazo = (await messagesOf(personId)).find((item) =>
      item.dedupeKey?.endsWith(":rejected"),
    );
    expect(pushRechazo).toBeTruthy();
    const interacciones = await interactionsOf(personId);
    expect(
      interacciones.some(
        (item) =>
          item.kind === "PARTICIPATION" &&
          item.summary.includes(
            fillCopy(tList("T-667")[11], {
              reto: "Reto evidencia",
              motivo: "No se ve la actividad",
            }),
          ),
      ),
    ).toBe(true);
  });
});
