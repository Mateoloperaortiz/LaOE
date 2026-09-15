import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import {
  EVIDENCE_MAX_BYTES,
  evidenceKey,
  prepareEvidenceUpload,
  processEvidenceFile,
  processedEvidenceKey,
  resolveEvidenceRedirect,
  verifyEvidenceObjects,
} from "@/modules/participation/domain/evidence";
import { challengeEvidenceFile, challengeParticipation } from "@/modules/participation/schema";
import { deleteObject, getObject, headObject, putObject } from "@/shared/adapters/storage";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { tList } from "@/shared/copy";
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

  it("rechaza un tipo no admitido y un tamaño fuera de rango", async () => {
    const personId = await seedMember("evidencia.tipo@eafit.edu.co");
    await expect(
      prepareEvidenceUpload({ contentType: "application/pdf", byteSize: 10_000 }, { personId }),
    ).rejects.toSatisfy((error) => error instanceof DomainError && error.message === errors[0]);
    await expect(
      prepareEvidenceUpload({ contentType: "image/png", byteSize: 100 }, { personId }),
    ).rejects.toSatisfy((error) => error instanceof DomainError && error.message === errors[1]);
    await expect(
      prepareEvidenceUpload(
        { contentType: "image/png", byteSize: EVIDENCE_MAX_BYTES + 1 },
        { personId },
      ),
    ).rejects.toSatisfy((error) => error instanceof DomainError && error.message === errors[1]);
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

    await enqueueEvent(db(), { type: "person.anonymized", payload: { personId } });
    await drain(30);

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
