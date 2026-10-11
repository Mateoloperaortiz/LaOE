import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { confirmUploadAs, getMedia, listMedia, prepareUpload } from "@/modules/content";
import { lockPersonAnonymization } from "@/modules/people";
import { deleteObject, headObject } from "@/shared/adapters/storage";
import { t } from "@/shared/copy";
import { seedMember } from "../factories";
import { noisePng, uploadAsBrowser } from "../helpers/media";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Quién confirma qué clave (ADR-113 regla 5), por la interfaz pública de `content` y contra Garage en
// local. El alcance lo declara quien llama; el comando decide con la clave, no con el propósito declarado.

const keys: string[] = [];

type Scope = Parameters<typeof confirmUploadAs>[2];
const ADMIN: Scope = { by: "ADMIN" };
const SELF: Scope = { by: "SELF" };
/** Lo que compone la capa de la app: content pregunta y people responde con la persona tomada. */
const ownerCheck = { lockOwner: lockPersonAnonymization };
// Errores de quien programa, no copy: la comprobación falta o respondió algo que no se reconoce.
const MISSING_OWNER_CHECK = /exige la comprobación del dueño/;
const NOT_AN_ANSWER = /respondió algo que no se reconoce/;

/** Sube el objeto al bucket como hace el navegador y devuelve su clave, sin confirmarla. */
async function store(purpose: "media" | "photo", ownerId: string): Promise<string> {
  const bytes = await noisePng(80, 80);
  const prepared = await prepareUpload(
    {
      filename: "imagen.png",
      contentType: "image/png",
      byteSize: bytes.byteLength,
      visibility: "PUBLIC",
      purpose,
    },
    { personId: ownerId },
  );
  keys.push(prepared.key);
  await uploadAsBrowser(prepared, { bytes, contentType: "image/png", filename: "imagen.png" });
  return prepared.key;
}

/** Nada quedó registrado ni encolado, y el objeto sigue en el bucket para quien sí puede confirmarlo. */
async function expectNothingConfirmed(key: string): Promise<void> {
  expect((await listMedia({ q: "", page: 1, pageSize: 20 })).total).toBe(0);
  expect(await drainOutbox()).toEqual({ processed: 0, failed: 0 });
  expect(await headObject(key)).not.toBeNull();
}

const rejected = { name: "DomainError", message: t("T-363") };

describe("confirmar un medio", () => {
  beforeEach(truncateAll);

  it("sin la comprobación del dueño no se confirma nada: ni un medio ni una foto propia", async () => {
    const member = await seedMember("sin.comprobacion@eafit.edu.co");
    const mediaKey = await store("media", member);
    const photoKey = await store("photo", member);
    for (const check of [undefined, null, {}, { lockOwner: "sí" }]) {
      await expect(
        confirmUploadAs(
          { personId: member, ip: null },
          { key: mediaKey, filename: "medio.png", visibility: "PUBLIC", purpose: "media" },
          ADMIN,
          check as never,
        ),
      ).rejects.toThrow(MISSING_OWNER_CHECK);
      await expect(
        confirmUploadAs(
          { personId: member, ip: null },
          { key: photoKey, filename: "yo.png", visibility: "PRIVATE", purpose: "photo" },
          SELF,
          check as never,
        ),
      ).rejects.toThrow(MISSING_OWNER_CHECK);
    }
    await expectNothingConfirmed(mediaKey);
    expect(await headObject(photoKey)).not.toBeNull();
  });

  it("una respuesta de la comprobación que no se reconoce tampoco deja confirmar la foto", async () => {
    const member = await seedMember("respuesta.rara@eafit.edu.co");
    const photoKey = await store("photo", member);
    for (const answer of [undefined, {}, { anonymized: "no" }, "viva"]) {
      await expect(
        confirmUploadAs(
          { personId: member, ip: null },
          { key: photoKey, filename: "yo.png", visibility: "PRIVATE", purpose: "photo" },
          SELF,
          { lockOwner: () => Promise.resolve(answer as never) },
        ),
      ).rejects.toThrow(NOT_AN_ANSWER);
    }
    // Es un error de quien programa: no se registra nada y el objeto queda para quien sí puede confirmarlo.
    await expectNothingConfirmed(photoKey);
  });
  afterAll(async () => {
    await Promise.all(keys.map((key) => deleteObject(key).catch(() => undefined)));
    await closeDb();
  });

  it("un miembro sin ADMIN no confirma como medio una clave que no es su foto, aunque declare que es una foto", async () => {
    const admin = await seedMember("admin.medios@eafit.edu.co");
    const member = await seedMember("miembro.medios@eafit.edu.co");
    const key = await store("media", admin);

    await expect(
      confirmUploadAs(
        { personId: member, ip: null },
        { key, filename: "colada.png", visibility: "PUBLIC", purpose: "photo" },
        SELF,
        ownerCheck,
      ),
    ).rejects.toMatchObject(rejected);
    await expectNothingConfirmed(key);
  });

  it("un miembro sin ADMIN tampoco la confirma declarando que es un medio", async () => {
    const admin = await seedMember("admin.directo@eafit.edu.co");
    const member = await seedMember("miembro.directo@eafit.edu.co");
    const key = await store("media", admin);

    await expect(
      confirmUploadAs(
        { personId: member, ip: null },
        { key, filename: "directa.png", visibility: "PUBLIC", purpose: "media" },
        SELF,
        ownerCheck,
      ),
    ).rejects.toMatchObject(rejected);
    await expectNothingConfirmed(key);
  });

  it("rechaza un propósito que no coincide con el prefijo de la clave, también a ADMIN", async () => {
    const admin = await seedMember("admin.proposito@eafit.edu.co");
    const mediaKey = await store("media", admin);
    const photoKey = await store("photo", admin);

    await expect(
      confirmUploadAs(
        { personId: admin, ip: null },
        { key: mediaKey, filename: "medio.png", visibility: "PUBLIC", purpose: "photo" },
        ADMIN,
        ownerCheck,
      ),
    ).rejects.toMatchObject(rejected);
    await expect(
      confirmUploadAs(
        { personId: admin, ip: null },
        { key: photoKey, filename: "foto.png", visibility: "PUBLIC", purpose: "media" },
        ADMIN,
        ownerCheck,
      ),
    ).rejects.toMatchObject(rejected);
    await expectNothingConfirmed(mediaKey);
    expect(await headObject(photoKey)).not.toBeNull();
  });

  it("sin alcance declarado, o con uno que no se reconoce, no confirma nada", async () => {
    const admin = await seedMember("admin.alcance@eafit.edu.co");
    const mediaKey = await store("media", admin);
    const photoKey = await store("photo", admin);
    const media = { key: mediaKey, filename: "medio.png", visibility: "PUBLIC", purpose: "media" };
    const photo = { key: photoKey, filename: "foto.png", visibility: "PRIVATE", purpose: "photo" };

    for (const scope of [
      undefined,
      null,
      {},
      { by: "OTRO" },
      { by: "admin" },
      { by: "MEMBER" },
      "ADMIN",
    ]) {
      await expect(
        confirmUploadAs({ personId: admin, ip: null }, media as never, scope as never, ownerCheck),
      ).rejects.toMatchObject(rejected);
      await expect(
        confirmUploadAs({ personId: admin, ip: null }, photo as never, scope as never, ownerCheck),
      ).rejects.toMatchObject(rejected);
    }
    await expectNothingConfirmed(mediaKey);
    expect(await headObject(photoKey)).not.toBeNull();
  });

  it("sin propósito declarado, o con uno que no se reconoce, no confirma nada", async () => {
    const admin = await seedMember("admin.sinproposito@eafit.edu.co");
    const key = await store("media", admin);

    for (const purpose of [undefined, "", "MEDIA", "uploads"]) {
      await expect(
        confirmUploadAs(
          { personId: admin, ip: null },
          { key, filename: "medio.png", visibility: "PUBLIC", purpose } as never,
          ADMIN,
          ownerCheck,
        ),
      ).rejects.toMatchObject(rejected);
    }
    await expectNothingConfirmed(key);
  });

  it("la foto de otra persona no se confirma, ni como miembro ni como ADMIN", async () => {
    const owner = await seedMember("duena.foto@eafit.edu.co");
    const other = await seedMember("otra.foto@eafit.edu.co");
    const key = await store("photo", owner);

    for (const scope of [SELF, ADMIN]) {
      await expect(
        confirmUploadAs(
          { personId: other, ip: null },
          { key, filename: "ajena.png", visibility: "PRIVATE", purpose: "photo" },
          scope,
          ownerCheck,
        ),
      ).rejects.toMatchObject(rejected);
    }
    await expectNothingConfirmed(key);
  });

  it("un miembro confirma su propia foto y queda privada aunque la pida pública", async () => {
    const member = await seedMember("miembro.foto@eafit.edu.co");
    const key = await store("photo", member);

    const { id } = await confirmUploadAs(
      { personId: member, ip: null },
      { key, filename: "yo.png", visibility: "PUBLIC", purpose: "photo" },
      SELF,
      ownerCheck,
    );

    expect(await getMedia(id)).toMatchObject({
      objectKey: key,
      visibility: "PRIVATE",
      uploadedById: member,
      status: "PENDING",
    });
  });

  it("ADMIN confirma un medio con la visibilidad que pide, y su propia foto como cualquiera", async () => {
    const admin = await seedMember("admin.confirma@eafit.edu.co");
    const mediaKey = await store("media", admin);
    const photoKey = await store("photo", admin);

    const media = await confirmUploadAs(
      { personId: admin, ip: null },
      { key: mediaKey, filename: "portada.png", visibility: "PUBLIC", purpose: "media" },
      ADMIN,
      ownerCheck,
    );
    const photo = await confirmUploadAs(
      { personId: admin, ip: null },
      { key: photoKey, filename: "yo.png", visibility: "PUBLIC", purpose: "photo" },
      ADMIN,
      ownerCheck,
    );

    expect(await getMedia(media.id)).toMatchObject({
      objectKey: mediaKey,
      visibility: "PUBLIC",
      uploadedById: admin,
    });
    expect(await getMedia(photo.id)).toMatchObject({ objectKey: photoKey, visibility: "PRIVATE" });
  });
});
