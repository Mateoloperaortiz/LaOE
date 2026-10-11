import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { evidenceProcess } from "@/domain-events/participation";
import { personAnonymized } from "@/domain-events/people";
import { discardEvidenceUploadAs, submitEvidenceAs } from "@/modules/participation";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_SIDE,
  evidenceKey,
  lockEvidenceUploads,
  prepareEvidenceUpload,
  processEvidenceFile,
  processedEvidenceKey,
  resolveEvidenceRedirect,
  verifyEvidenceObjects,
} from "@/modules/participation/domain/evidence";
import {
  challengeEvidenceFile,
  challengeParticipation,
  reward,
} from "@/modules/participation/schema";
import { setConfigAs } from "@/modules/system";
import { outbox } from "@/modules/system/schema";
import { deleteObject, getObject, headObject, putObject } from "@/shared/adapters/storage";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { firstThenSecond, holdTransaction, outcome } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedChallenge, seedMember, seedParticipation, seedTerm } from "./factories";

// Evidencias (ADR-067 regla 6): validación de subida, verificación de objetos, re-encode a WebP
// sin metadatos y entrega prefirmada solo al autor o a un ADMIN.

const db = () => getDb();
const errors = tList("T-2430");

/** JPEG sintético de más de 5 KB con un EXIF marcador. */
async function syntheticImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 128, g: 64, b: 32 },
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "prueba" } } })
    .toBuffer();
}

/** Un SVG de más de 5 KB: libvips lo sabe dibujar, pero no es un formato admitido. */
function syntheticSvg(): Buffer {
  const rects = Array.from(
    { length: 200 },
    (_, i) => `<rect x="${i}" y="${i}" width="40" height="30" fill="#f60"/>`,
  ).join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">${rects}</svg>`,
  );
}

/** PNG de un solo color: pesa poco en el bucket y ocupa `width × height` píxeles al decodificarse. */
async function flatImage(width: number, height: number, format: "png" | "jpeg"): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    [format]()
    .toBuffer();
}

/**
 * La entrega de una misión con una imagen ya subida, por el comando del miembro, y su job por el
 * outbox: el camino de producción. Devuelve cómo quedó todo al llegar el outbox al reposo.
 */
async function submitAndProcess(
  input: { email: string; fileName: string; bytes: Buffer; declaredType: string },
  keys: string[],
) {
  const termId = await seedTerm();
  const personId = await seedMember(input.email);
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
  const challengeId = await seedChallenge(termId, { kind: "EVIDENCE" });
  const key = evidenceKey(personId, input.declaredType, input.fileName);
  keys.push(key);
  await putObject(key, input.bytes, input.declaredType);
  const sent = await submitEvidenceAs(
    { personId, ip: null },
    { challengeId, requestId: randomUUID(), text: "Relato sintético de la misión.", keys: [key] },
  );
  expect(sent.ok).toBe(true);
  await drainOutbox();

  const [file] = await db().select().from(challengeEvidenceFile);
  if (!file) throw new Error("la entrega no dejó evidencia");
  keys.push(processedEvidenceKey(file.id));
  const [participation] = await db()
    .select({ status: challengeParticipation.status })
    .from(challengeParticipation)
    .where(eq(challengeParticipation.id, file.participationId));
  const rewards = await db().select({ status: reward.status }).from(reward);
  const jobs = await db()
    .select({
      attempts: outbox.attempts,
      processedAt: outbox.processedAt,
      deadLetterAt: outbox.deadLetterAt,
    })
    .from(outbox)
    .where(eq(outbox.eventType, evidenceProcess.type));
  return { personId, file, participation, rewards, jobs };
}

/** Un miembro con los retos prendidos, una misión de evidencia abierta y una imagen ya subida. */
async function uploadedForMission(email: string, fileName: string, keys: string[]) {
  const termId = await seedTerm();
  const personId = await seedMember(email);
  await setConfigAs({ personId, ip: null }, "gamification.enabled", true);
  const challengeId = await seedChallenge(termId, { kind: "EVIDENCE" });
  const key = evidenceKey(personId, "image/jpeg", fileName);
  keys.push(key);
  await putObject(key, await syntheticImage(), "image/jpeg");
  const submission = {
    challengeId,
    requestId: randomUUID(),
    text: "Relato sintético de la misión.",
    keys: [key],
  };
  // La IP es nula: la prueba llama al comando sin una solicitud de por medio.
  return { actor: { personId, ip: null }, key, submission };
}

async function seedEvidenceFile(personId: string, key: string, contentType = "image/jpeg") {
  const termId = await seedTerm();
  const challengeId = await seedChallenge(termId, { kind: "EVIDENCE", passPercent: null });
  const participationId = await seedParticipation(challengeId, personId);
  const [row] = await db()
    .insert(challengeEvidenceFile)
    .values({ participationId, ordinal: 1, objectKey: key, contentType, byteSize: 10_000 })
    .returning({ id: challengeEvidenceFile.id });
  if (!row) throw new Error("seed evidence file");
  return row.id;
}

describe("evidencias de retos", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);
  const keys: string[] = [];

  afterAll(async () => {
    await Promise.all(keys.map((key) => deleteObject(key).catch(() => undefined)));
  });

  it("rechaza un tipo no admitido y un tamaño fuera de rango, y dice de qué lado se pasó", async () => {
    const personId = await seedMember("evidencia.tipo@eafit.edu.co");
    await expect(
      prepareEvidenceUpload({ contentType: "application/pdf", byteSize: 10_000 }, { personId }),
    ).rejects.toSatisfy((error) => error instanceof DomainError && error.message === errors[0]);
    await expect(
      prepareEvidenceUpload({ contentType: "image/png", byteSize: 100 }, { personId }),
    ).rejects.toSatisfy((error) => error instanceof DomainError && error.message === t("T-3264"));
    await expect(
      prepareEvidenceUpload(
        { contentType: "image/png", byteSize: EVIDENCE_MAX_BYTES + 1 },
        { personId },
      ),
    ).rejects.toSatisfy((error) => error instanceof DomainError && error.message === errors[1]);
  });

  it("un objeto propio de menos de 5 KB se rechaza diciendo que pesa poco, y se borra", async () => {
    const personId = await seedMember("evidencia.liviana@eafit.edu.co");
    const key = evidenceKey(personId, "image/png", "archivolivianoprueba");
    keys.push(key);
    await putObject(key, await flatImage(40, 40, "png"), "image/png");
    await expect(verifyEvidenceObjects(personId, [key])).rejects.toSatisfy(
      (error) => error instanceof DomainError && error.message === t("T-3264"),
    );
    expect(await headObject(key)).toBeNull();
  });

  it("verifica objetos del propio miembro y rechaza claves ajenas", async () => {
    const personId = await seedMember("evidencia.propia@eafit.edu.co");
    const otherId = await seedMember("evidencia.ajena@eafit.edu.co");
    const bytes = await syntheticImage();
    const key = evidenceKey(personId, "image/jpeg", "archivo1prueba");
    keys.push(key);
    await putObject(key, bytes, "image/jpeg");

    const verified = await verifyEvidenceObjects(personId, [key, key]);
    expect(verified).toHaveLength(1);
    expect(verified[0]).toMatchObject({ key, contentType: "image/jpeg" });

    const foreign = evidenceKey(otherId, "image/jpeg", "archivo2prueba");
    await expect(verifyEvidenceObjects(personId, [foreign])).rejects.toSatisfy(
      (error) => error instanceof DomainError && error.message === errors[0],
    );
    await expect(
      verifyEvidenceObjects(personId, [key, "evidence/no-existe/x.jpg"]),
    ).rejects.toThrow(DomainError);
  });

  it("quitar de la lista una imagen subida la borra del bucket, y quitarla dos veces no falla", async () => {
    const personId = await seedMember("evidencia.quitada@eafit.edu.co");
    const key = evidenceKey(personId, "image/jpeg", "archivoquitadoprueba");
    keys.push(key);
    await putObject(key, await syntheticImage(), "image/jpeg");

    expect(await discardEvidenceUploadAs({ personId, ip: null }, { key })).toBe("DISCARDED");
    expect(await headObject(key)).toBeNull();
    expect(await discardEvidenceUploadAs({ personId, ip: null }, { key })).toBe("DISCARDED");
  });

  it("nadie borra la imagen de otra persona, una ya procesada ni una clave que no es de evidencia", async () => {
    const personId = await seedMember("evidencia.intrusa@eafit.edu.co");
    const otherId = await seedMember("evidencia.duena@eafit.edu.co");
    const foreign = evidenceKey(otherId, "image/jpeg", "archivoajenoprueba");
    const processed = processedEvidenceKey("archivoprocesadoprueba");
    keys.push(foreign, processed);
    await putObject(foreign, await syntheticImage(), "image/jpeg");
    await putObject(processed, await syntheticImage(), "image/webp");

    const refused = [
      foreign,
      processed,
      `evidence/${personId}/../${otherId}/archivoajenoprueba.jpg`,
      `evidence/${personId}/`,
      "media/original/archivoajenoprueba.jpg",
      "",
    ];
    for (const key of refused) {
      await expect(discardEvidenceUploadAs({ personId, ip: null }, { key })).rejects.toSatisfy(
        (error) => error instanceof DomainError && error.message === errors[0],
      );
    }
    expect(await headObject(foreign)).not.toBeNull();
    expect(await headObject(processed)).not.toBeNull();
  });

  it("una imagen que una entrega ya usa no se borra al quitarla", async () => {
    const { actor, key, submission } = await uploadedForMission(
      "evidencia.usada@eafit.edu.co",
      "archivousadoprueba",
      keys,
    );
    expect((await submitEvidenceAs(actor, submission)).ok).toBe(true);

    expect(await discardEvidenceUploadAs(actor, { key })).toBe("IN_USE");
    expect(await headObject(key)).not.toBeNull();
  });

  it("quitar una imagen y entregarla a la vez hacen cola: quitada primero, la entrega se rechaza y no deja fila", async () => {
    const { actor, key, submission } = await uploadedForMission(
      "evidencia.carrera1@eafit.edu.co",
      "archivocarrera1prueba",
      keys,
    );
    const held = await holdTransaction((tx) => lockEvidenceUploads(tx, actor.personId));
    const [discarded, sent] = await firstThenSecond(
      held,
      () => discardEvidenceUploadAs(actor, { key }),
      () => submitEvidenceAs(actor, submission),
    );

    expect(discarded).toMatchObject({ status: "fulfilled", value: "DISCARDED" });
    // La entrega vuelve a mirar el bucket ya con el candado: el objeto no está y no la acepta.
    expect(outcome(sent)).toBe(errors[0]);
    expect(await headObject(key)).toBeNull();
    expect(await db().select().from(challengeParticipation)).toHaveLength(0);
    expect(await db().select().from(challengeEvidenceFile)).toHaveLength(0);
  });

  it("quitar una imagen y entregarla a la vez hacen cola: entregada primero, la imagen ya es de la entrega y no se borra", async () => {
    const { actor, key, submission } = await uploadedForMission(
      "evidencia.carrera2@eafit.edu.co",
      "archivocarrera2prueba",
      keys,
    );
    const held = await holdTransaction((tx) => lockEvidenceUploads(tx, actor.personId));
    const [sent, discarded] = await firstThenSecond(
      held,
      () => submitEvidenceAs(actor, submission),
      () => discardEvidenceUploadAs(actor, { key }),
    );

    expect(sent).toMatchObject({ status: "fulfilled", value: { ok: true } });
    expect(discarded).toMatchObject({ status: "fulfilled", value: "IN_USE" });
    expect(await headObject(key)).not.toBeNull();
    const files = await db()
      .select({ key: challengeEvidenceFile.objectKey })
      .from(challengeEvidenceFile);
    expect(files).toEqual([{ key }]);
  });

  it("procesa la imagen a WebP sin metadatos y marca READY", async () => {
    const personId = await seedMember("evidencia.procesa@eafit.edu.co");
    const bytes = await syntheticImage();
    const key = evidenceKey(personId, "image/jpeg", "archivo3prueba");
    keys.push(key, key.replace(/\.jpg$/, ".webp"));
    await putObject(key, bytes, "image/jpeg");
    const fileId = await seedEvidenceFile(personId, key);
    keys.push(processedEvidenceKey(fileId));

    const outcome = await processEvidenceFile(fileId);
    expect(outcome).toBe("ready");
    const [file] = await db()
      .select()
      .from(challengeEvidenceFile)
      .where(eq(challengeEvidenceFile.id, fileId));
    expect(file?.status).toBe("READY");
    expect(file?.objectKey).toBe(key);
    expect(file?.contentType).toBe("image/webp");

    const processed = await getObject(processedEvidenceKey(fileId));
    const meta = await sharp(processed).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    // El original se borró y la segunda corrida no repite trabajo.
    expect(await processEvidenceFile(fileId)).toBe("skipped");
  });

  it("marca FAILED una imagen indecodificable sin reintentar", async () => {
    const personId = await seedMember("evidencia.falla@eafit.edu.co");
    const key = evidenceKey(personId, "image/jpeg", "archivo4prueba");
    keys.push(key);
    await putObject(key, Buffer.alloc(10_000, 7), "image/jpeg");
    const fileId = await seedEvidenceFile(personId, key);
    keys.push(processedEvidenceKey(fileId));
    expect(await processEvidenceFile(fileId)).toBe("failed");
    const [file] = await db()
      .select()
      .from(challengeEvidenceFile)
      .where(eq(challengeEvidenceFile.id, fileId));
    expect(file?.status).toBe("FAILED");
    expect(file?.error).toBeTruthy();
  });

  it("una evidencia cuyo tipo guardado no es de los admitidos queda fallida con el motivo del catálogo", async () => {
    const personId = await seedMember("evidencia.tipo@eafit.edu.co");
    const key = evidenceKey(personId, "image/jpeg", "archivo5prueba");
    const fileId = await seedEvidenceFile(personId, key, "image/gif");
    expect(await processEvidenceFile(fileId)).toBe("failed");
    const [file] = await db()
      .select()
      .from(challengeEvidenceFile)
      .where(eq(challengeEvidenceFile.id, fileId));
    expect(file).toMatchObject({ status: "FAILED", error: tList("T-3207")[1] });
  });

  it("una evidencia que declara ser PNG y es otra cosa queda fallida con su motivo", async () => {
    const { personId, file, participation, rewards, jobs } = await submitAndProcess(
      {
        email: "evidencia.disfraz@eafit.edu.co",
        fileName: "archivo7prueba",
        bytes: syntheticSvg(),
        declaredType: "image/png",
      },
      keys,
    );

    expect(file.status).toBe("FAILED");
    expect(file.error).toBe(tList("T-3207")[1]);
    // No hay resultado que servir: ni objeto protegido ni redirección.
    expect(await headObject(processedEvidenceKey(file.id))).toBeNull();
    expect(await resolveEvidenceRedirect(file.id, { personId, isAdmin: true })).toEqual({
      status: 404,
    });
    // El job terminó en su primer intento y nada lo vuelve a encolar.
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ attempts: 1, deadLetterAt: null });
    expect(jobs[0]?.processedAt).not.toBeNull();
    expect(await drainOutbox()).toEqual({ processed: 0, failed: 0 });
    // ADR-067: la entrega sigue pendiente con su premio reservado hasta que GH la revise.
    expect(participation?.status).toBe("PENDING");
    expect(rewards).toEqual([{ status: "RESERVED" }]);
  });

  it("una evidencia de más píxeles que el tope queda fallida sin codificarse", async () => {
    // 40.008.000 píxeles en 0,5 MB: pasa el HEAD de tipo y tamaño de la entrega.
    const { file, participation, rewards, jobs } = await submitAndProcess(
      {
        email: "evidencia.enorme@eafit.edu.co",
        fileName: "archivo8prueba",
        bytes: await flatImage(8000, 5001, "png"),
        declaredType: "image/png",
      },
      keys,
    );

    expect(file.status).toBe("FAILED");
    expect(file.error).toBe(tList("T-3207")[2]);
    expect(await headObject(processedEvidenceKey(file.id))).toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ attempts: 1, deadLetterAt: null });
    expect(jobs[0]?.processedAt).not.toBeNull();
    expect(participation?.status).toBe("PENDING");
    expect(rewards).toEqual([{ status: "RESERVED" }]);
  });

  it("una evidencia válida más grande que el lado máximo se guarda reducida", async () => {
    const { file } = await submitAndProcess(
      {
        email: "evidencia.grande@eafit.edu.co",
        fileName: "archivo9prueba",
        bytes: await flatImage(3900, 2600, "jpeg"),
        declaredType: "image/jpeg",
      },
      keys,
    );

    expect(file.status).toBe("READY");
    const meta = await sharp(await getObject(processedEvidenceKey(file.id))).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width, meta.height)).toBe(EVIDENCE_MAX_SIDE);
    // Conserva la proporción de 3:2.
    expect(meta.width / meta.height).toBeCloseTo(1.5, 2);
  });

  it("entrega 404 en PENDING, 403 a otra persona y 302 al autor y al admin", async () => {
    const personId = await seedMember("evidencia.autor@eafit.edu.co");
    const otherId = await seedMember("evidencia.otra@eafit.edu.co");
    const bytes = await syntheticImage();
    const key = evidenceKey(personId, "image/jpeg", "archivo5prueba");
    keys.push(key, key.replace(/\.jpg$/, ".webp"));
    await putObject(key, bytes, "image/jpeg");
    const fileId = await seedEvidenceFile(personId, key);
    keys.push(processedEvidenceKey(fileId));

    expect(await resolveEvidenceRedirect(fileId, { personId, isAdmin: false })).toEqual({
      status: 404,
    });
    await processEvidenceFile(fileId);
    expect(await resolveEvidenceRedirect(fileId, { personId: otherId, isAdmin: false })).toEqual({
      status: 403,
    });
    const own = await resolveEvidenceRedirect(fileId, { personId, isAdmin: false });
    expect(own.status).toBe(302);
    if (own.status === 302) {
      expect(own.url).toContain("http");
      expect(own.cacheControl).toBe("private, no-store");
    }
    const admin = await resolveEvidenceRedirect(fileId, { personId: otherId, isAdmin: true });
    expect(admin.status).toBe(302);
  });

  it("la anonimización borra los objetos, las filas y el texto de evidencia", async () => {
    const personId = await seedMember("evidencia.anon@eafit.edu.co");
    const termId = await seedTerm();
    const challengeId = await seedChallenge(termId, { kind: "EVIDENCE", passPercent: null });
    const participationId = await seedParticipation(challengeId, personId, {
      status: "COMPLETED",
      evidenceText: "Relato de prueba.",
    });
    const bytes = await syntheticImage();
    const key = evidenceKey(personId, "image/jpeg", "archivo6prueba");
    keys.push(key);
    await putObject(key, bytes, "image/jpeg");
    await db().insert(challengeEvidenceFile).values({
      participationId,
      ordinal: 1,
      objectKey: key,
      contentType: "image/jpeg",
      byteSize: bytes.length,
    });
    expect(await headObject(key)).not.toBeNull();

    await enqueueEvent(db(), eventOf(personAnonymized, { actorId: null, personId }));
    await drainOutbox();

    expect(
      await db()
        .select()
        .from(challengeEvidenceFile)
        .where(inArray(challengeEvidenceFile.participationId, [participationId])),
    ).toEqual([]);
    const [entrega] = await db()
      .select({ evidenceText: challengeParticipation.evidenceText })
      .from(challengeParticipation)
      .where(eq(challengeParticipation.id, participationId));
    expect(entrega?.evidenceText).toBeNull();
    // El objeto salió del bucket (deleteObject): headObject ya no lo encuentra.
    expect(await headObject(key)).toBeNull();
  });
});
