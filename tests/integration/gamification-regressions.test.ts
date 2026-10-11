import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { recomputeBadgesFor } from "@/modules/participation/domain/badges";
import { checkInSelfAs } from "@/modules/participation/domain/commands";
import {
  prepareEvidenceUpload,
  processEvidenceFile,
  processedEvidenceKey,
  resolveEvidenceRedirect,
} from "@/modules/participation/domain/evidence";
import {
  cancelChallengeAs,
  setFeaturedAs,
  submitEvidenceAs,
  submitTriviaAs,
} from "@/modules/participation/domain/gamification-commands";
import { balanceFor } from "@/modules/participation/domain/ledger";
import {
  achievement,
  boosterItem,
  challenge,
  challengeEvidenceFile,
  challengeParticipation,
  reward,
} from "@/modules/participation/schema";
import { membership } from "@/modules/people/schema";
import { setConfigAs } from "@/modules/system";
import { outbox } from "@/modules/system/schema";
import { deleteObject, getObject, headObject, putObject } from "@/shared/adapters/storage";
import {
  seedBooster,
  seedChallenge,
  seedChallengeEvidenceFile,
  seedMember,
  seedOccasion,
  seedParticipation,
  seedQuestion,
  seedTerm,
} from "../factories";
import { decideInOwnOccasion } from "../helpers/check-ins";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

beforeEach(truncateAll);
afterAll(closeDb);

async function presential(approval: "MANUAL" | "AUTO" = "AUTO") {
  const termId = await seedTerm();
  const personId = await seedMember("revision.gamificacion@eafit.edu.co");
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
  const occasion = await seedOccasion(termId, { points: 10, approval });
  const challengeId = await seedChallenge(termId, {
    kind: "PRESENTIAL",
    occasionId: occasion.id,
    basePoints: 5,
  });
  const result = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
  if (!result.ok) throw new Error("check-in inicial falló");
  return { termId, personId, challengeId, checkInId: result.checkInId };
}

it("revisión: reaprueba una asistencia rechazada con reto presencial", async () => {
  const { personId, checkInId, termId } = await presential("MANUAL");
  await decideInOwnOccasion(
    { personId, ip: null },
    { checkInId, decision: "REJECT", reason: "Corrección sintética" },
  );
  await decideInOwnOccasion({ personId, ip: null }, { checkInId, decision: "APPROVE" });
  expect(await balanceFor(personId, termId)).toBe(15);
  expect(await getDb().select().from(challengeParticipation)).toHaveLength(1);
  expect(await getDb().select().from(reward)).toHaveLength(1);
});

it.each([
  "APPROVE",
  "REJECT",
] as const)("decide la reserva presencial con bandera apagada y membresía cambiada: %s", async (decision) => {
  const { personId, checkInId, termId } = await presential("MANUAL");
  await setConfigAs({ personId, ip: null }, "gamification.enabled", false);
  await getDb()
    .update(membership)
    .set({ status: "INACTIVE" })
    .where(eq(membership.personId, personId));
  await decideInOwnOccasion({ personId, ip: null }, { checkInId, decision, reason: "Corrección" });
  const [entry] = await getDb().select().from(reward);
  expect(entry?.status).toBe(decision === "APPROVE" ? "GRANTED" : "RELEASED");
  expect(await balanceFor(personId, termId)).toBe(decision === "APPROVE" ? 15 : 0);
});

it("no revive el premio de un reto cancelado al reaprobar su asistencia", async () => {
  const { personId, checkInId, termId, challengeId } = await presential("MANUAL");
  await cancelChallengeAs({ personId, ip: null }, challengeId, "Cancelado por GH");
  await decideInOwnOccasion({ personId, ip: null }, { checkInId, decision: "APPROVE" });
  expect(await balanceFor(personId, termId)).toBe(10);
  const [entry] = await getDb().select().from(reward);
  expect(entry?.status).toBe("RELEASED");
});

it("absorbe envíos simultáneos y conserva el replay después del cierre", async () => {
  const termId = await seedTerm();
  const personId = await seedMember("replay.concurrente@test.dev");
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
  const challengeId = await seedChallenge(termId);
  await seedQuestion(challengeId, { prompt: "¿Una?", options: ["A", "B"] });
  const input = { challengeId, requestId: randomUUID(), answers: [0] };
  await warmPool();
  const results = await Promise.all([
    submitTriviaAs({ personId, ip: null }, input),
    submitTriviaAs({ personId, ip: null }, input),
  ]);
  expect(results.every((result) => result.ok)).toBe(true);
  expect(await balanceFor(personId, termId)).toBe(5);
  await getDb()
    .update(challenge)
    .set({ closesAt: new Date(Date.now() - 1000) })
    .where(eq(challenge.id, challengeId));
  await setConfigAs({ personId, ip: null }, "gamification.enabled", false);
  expect((await submitTriviaAs({ personId, ip: null }, input)).ok).toBe(true);
  expect((await submitTriviaAs({ personId, ip: null }, { ...input, answers: [1] })).ok).toBe(false);
});

it("reintenta la evidencia con las mismas claves aunque el original ya se haya eliminado", async () => {
  const termId = await seedTerm();
  const personId = await seedMember("replay.evidencia@test.dev");
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
  const challengeId = await seedChallenge(termId, { kind: "EVIDENCE" });
  const key = `evidence/${personId}/replayevidenciaprueba.jpg`;
  const bytes = await sharp({
    create: {
      width: 300,
      height: 300,
      channels: 3,
      background: "red",
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .jpeg()
    .toBuffer();
  let processed = "";
  try {
    await putObject(key, bytes, "image/jpeg");
    const input = {
      challengeId,
      requestId: randomUUID(),
      text: "Relato sintético de la actividad realizada.",
      keys: [key],
    };
    const initial = await submitEvidenceAs({ personId, ip: null }, input);
    expect(initial.ok).toBe(true);
    const [file] = await getDb().select().from(challengeEvidenceFile);
    if (!file) throw new Error("sin evidencia");
    processed = processedEvidenceKey(file.id);
    await processEvidenceFile(file.id);
    expect(await headObject(key)).toBeNull();
    const replay = await submitEvidenceAs({ personId, ip: null }, input);
    expect(replay).toMatchObject({ ok: true, participation: { id: file.participationId } });
    expect(
      (
        await submitEvidenceAs(
          { personId, ip: null },
          { ...input, text: "Otra descripción sintética de la actividad." },
        )
      ).ok,
    ).toBe(false);
    expect((await submitEvidenceAs({ personId, ip: null }, { ...input, keys: [] })).ok).toBe(false);
    expect(await getDb().select().from(reward)).toHaveLength(1);
  } finally {
    await deleteObject(key);
    if (processed) await deleteObject(processed);
  }
});

it("0032 libera posiciones revocadas y reencola evidencias anteriores sin servir el original", async () => {
  const termId = await seedTerm();
  const personId = await seedMember("migracion.gamificacion@test.dev");
  await getDb().insert(achievement).values({
    personId,
    badgeId: "badge_en_parche_1",
    termId,
    sourceKind: "CHECKIN",
    revokedAt: new Date(),
    revokeReason: "SOURCE_REMOVED",
    featuredPosition: 1,
  });
  const challengeId = await seedChallenge(termId, { kind: "EVIDENCE" });
  const participationId = await seedParticipation(challengeId, personId);
  const [file] = await getDb()
    .insert(challengeEvidenceFile)
    .values({
      participationId,
      ordinal: 1,
      objectKey: `evidence/${personId}/migracionprueba.webp`,
      status: "READY",
      contentType: "image/webp",
      byteSize: 10000,
    })
    .returning();
  if (!file) throw new Error("sin archivo");
  const migration = await readFile(
    new URL("../../drizzle/0032_gamificacion_correcciones.sql", import.meta.url),
    "utf8",
  );
  await getDb().transaction(async (tx) => {
    for (const statement of migration.split("--> statement-breakpoint"))
      await tx.execute(sql.raw(statement));
  });
  expect((await getDb().select().from(achievement))[0]?.featuredPosition).toBeNull();
  expect((await getDb().select().from(challengeEvidenceFile))[0]?.status).toBe("PENDING");
  expect(await resolveEvidenceRedirect(file.id, { personId, isAdmin: true })).toEqual({
    status: 404,
  });
  expect(
    (await getDb().select().from(outbox)).some(
      (event) =>
        event.eventType === "gamification.evidence-process" && event.payload.fileId === file.id,
    ),
  ).toBe(true);
});

it("revisión: anular la asistencia revierte el premio aunque el reto esté cancelado", async () => {
  const { personId, checkInId, termId, challengeId } = await presential();
  await cancelChallengeAs({ personId, ip: null }, challengeId, "Cancelación sintética");
  await decideInOwnOccasion(
    { personId, ip: null },
    { checkInId, decision: "CANCEL", reason: "No asistió" },
  );
  expect(await balanceFor(personId, termId)).toBe(0);
});

it("revisión: apagar la bandera no impide revertir un BOOST ya entregado", async () => {
  const termId = await seedTerm();
  const personId = await seedMember("revision.bandera@eafit.edu.co");
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
  const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
  await seedBooster(personId, termId, "PLUS_50", { targetOccasionId: occasion.id });
  const result = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
  if (!result.ok) throw new Error("check-in inicial falló");
  expect(await balanceFor(personId, termId)).toBe(15);
  await setConfigAs({ personId, ip: null }, "gamification.enabled", false);
  await decideInOwnOccasion(
    { personId, ip: null },
    { checkInId: result.checkInId, decision: "CANCEL", reason: "Corrección" },
  );
  expect(await balanceFor(personId, termId)).toBe(0);
});

it("revisión: con la bandera apagada no emite boosters por un check-in ordinario", async () => {
  const termId = await seedTerm();
  const personId = await seedMember("revision.badges@eafit.edu.co");
  const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
  await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
  await drainOutbox();
  const boosters = await getDb()
    .select()
    .from(boosterItem)
    .where(eq(boosterItem.personId, personId));
  expect(boosters).toHaveLength(0);
});

it("revisión: requestId repetido con respuestas distintas se rechaza", async () => {
  const termId = await seedTerm();
  const personId = await seedMember("revision.request@eafit.edu.co");
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
  const challengeId = await seedChallenge(termId);
  await seedQuestion(challengeId, { prompt: "¿Una?", options: ["A", "B"] });
  const requestId = randomUUID();
  expect(
    (await submitTriviaAs({ personId, ip: null }, { challengeId, requestId, answers: [0] })).ok,
  ).toBe(true);
  expect(
    (await submitTriviaAs({ personId, ip: null }, { challengeId, requestId, answers: [1] })).ok,
  ).toBe(false);
});

it("revisión: dos check-ins que compiten por el booster completan ambas asistencias", async () => {
  const termId = await seedTerm();
  const personId = await seedMember("revision.carrera@eafit.edu.co");
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
  const first = await seedOccasion(termId, { points: 10, approval: "AUTO" });
  const second = await seedOccasion(termId, { points: 10, approval: "AUTO" });
  const boosterId = await seedBooster(personId, termId);
  const results = await Promise.all([
    checkInSelfAs({ personId, ip: null }, { publicId: first.publicId, boosterId }),
    checkInSelfAs({ personId, ip: null }, { publicId: second.publicId, boosterId }),
  ]);
  expect(results.map((result) => result.ok)).toEqual([true, true]);
  const rewards = await getDb().select().from(reward).where(eq(reward.boosterItemId, boosterId));
  expect(rewards).toHaveLength(1);
  const allRewards = await getDb().select().from(reward);
  expect(allRewards).toHaveLength(2);
  expect(allRewards.every((entry) => entry.requestedPersonalPercent === 50)).toBe(true);
  const withoutPersonal = allRewards.find((entry) => entry.boosterItemId === null);
  expect(withoutPersonal).toMatchObject({ personalPercent: 0, extraPoints: 0, status: "GRANTED" });
  expect(await balanceFor(personId, termId)).toBe(25);
});

it("revisión: revocar una insignia destacada libera la posición para un nuevo logro", async () => {
  const { termId, personId, checkInId } = await presential();
  const original = await recomputeBadgesFor(personId, { historical: false });
  const old = original.unlocked.find((item) => item.family === "EN_PARCHE");
  if (!old) throw new Error("sin insignia inicial");
  await setFeaturedAs({ personId, ip: null }, { achievementId: old.achievementId, featured: true });
  await decideInOwnOccasion(
    { personId, ip: null },
    { checkInId, decision: "CANCEL", reason: "Corrección" },
  );
  await recomputeBadgesFor(personId, { historical: false });
  const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
  await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
  const again = await recomputeBadgesFor(personId, { historical: false });
  const badge = again.unlocked.find((item) => item.family === "EN_PARCHE");
  if (!badge) throw new Error("sin insignia nueva");
  await setFeaturedAs(
    { personId, ip: null },
    { achievementId: badge.achievementId, featured: true },
  );
  const [row] = await getDb()
    .select()
    .from(achievement)
    .where(eq(achievement.id, badge.achievementId));
  expect(row?.featuredPosition).toBe(1);
});

it("revisión: una evidencia READY no puede sobrescribirse usando el POST original", async () => {
  const termId = await seedTerm();
  const personId = await seedMember("revision.webp@eafit.edu.co");
  const challengeId = await seedChallenge(termId, { kind: "EVIDENCE" });
  const participationId = await seedParticipation(challengeId, personId);
  const bytes = await sharp({
    create: {
      width: 300,
      height: 300,
      channels: 3,
      background: "red",
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .webp()
    .withMetadata({ exif: { IFD0: { Copyright: "prueba" } } })
    .toBuffer();
  const upload = await prepareEvidenceUpload(
    { contentType: "image/webp", byteSize: bytes.byteLength },
    { personId },
  );
  const post = async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "image/webp" }), "prueba.webp");
    const response = await fetch(upload.url, { method: "POST", body: form });
    expect(response.ok, await response.text()).toBe(true);
  };
  let protectedKey = "";
  try {
    await post();
    const file = {
      id: await seedChallengeEvidenceFile(participationId, upload.key, {
        contentType: "image/webp",
        byteSize: bytes.byteLength,
      }),
    };
    protectedKey = processedEvidenceKey(file.id);
    await processEvidenceFile(file.id);
    expect((await sharp(await getObject(protectedKey)).metadata()).exif).toBeUndefined();
    await post();
    expect((await resolveEvidenceRedirect(file.id, { personId, isAdmin: false })).status).toBe(302);
    expect((await sharp(await getObject(protectedKey)).metadata()).exif).toBeUndefined();
  } finally {
    await deleteObject(upload.key);
    if (protectedKey) await deleteObject(protectedKey);
  }
});
