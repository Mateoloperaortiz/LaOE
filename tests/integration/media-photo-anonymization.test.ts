import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { mediaProcess } from "@/domain-events/content";
import { personAnonymized } from "@/domain-events/people";
import { confirmUploadAs, getMedia, prepareUpload } from "@/modules/content";
import { confirmUpload } from "@/modules/content/domain/media";
import { fullVariantKey, variantKey } from "@/modules/content/domain/media-pure";
import { mediaAsset } from "@/modules/content/schema";
import { listSubmissionsByPerson } from "@/modules/forms";
import {
  anonymizePersonAs,
  endMembershipAs,
  getPersonRecord,
  listAlumniByYear,
  lockPersonAnonymization,
  recordConsentAs,
  requestDeletionAs,
  setOwnPhotoAs,
} from "@/modules/people";
import { anonymizePerson } from "@/modules/people/domain/membership";
import { deleteObject, headObject, putObject } from "@/shared/adapters/storage";
import { t } from "@/shared/copy";
import { holdCommand, waitingOn } from "../helpers/locks";
import { noisePng, uploadAsBrowser } from "../helpers/media";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedForm, seedMember, seedSubmission } from "./factories";

// La foto propia cuando la persona pide la eliminación de sus datos (ADR-030 regla 4, ADR-116 regla 8):
// con el dominio de verdad, contra Postgres y Garage en local, y por la ruta que entrega un medio. Del
// bucket solo se simula que falle: rechaza el borrado de una clave o la lectura mientras la prueba lo pida.

const admin = { personId: null, ip: null };
/** Lo que compone la capa de la app: content pregunta y people responde con la persona tomada. */
const ownerCheck = { lockOwner: lockPersonAnonymization };
const keys: string[] = [];
let signedInAs: string | null = null;

const bucket = vi.hoisted(() => ({
  /** La clave cuyo borrado rechaza el bucket. */
  rejectsDeleteOf: null as string | null,
  /** El bucket no deja leer: `media.process` falla y queda en espera. */
  unreadable: false,
  /** Lo que pasa justo después de la próxima escritura en el bucket, una sola vez. */
  afterNextPut: null as (() => Promise<unknown>) | null,
}));

vi.mock("@/shared/adapters/storage", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/shared/adapters/storage")>();
  return {
    ...mod,
    deleteObject: (key: string) =>
      key === bucket.rejectsDeleteOf
        ? Promise.reject(new Error("bucket caído"))
        : mod.deleteObject(key),
    getObject: (key: string) =>
      bucket.unreadable ? Promise.reject(new Error("bucket caído")) : mod.getObject(key),
    putObject: async (...args: Parameters<typeof mod.putObject>) => {
      await mod.putObject(...args);
      const then = bucket.afterNextPut;
      bucket.afterNextPut = null;
      await then?.();
    },
  };
});

vi.mock("@/modules/identity", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/identity")>();
  return {
    ...mod,
    getActor: () =>
      Promise.resolve(
        signedInAs === null
          ? null
          : {
              personId: signedInAs,
              sessionId: "sesion-test",
              email: "miembro@test.dev",
              name: "Miembro Sintético",
              firstName: "Miembro",
              membershipStatus: "ACTIVE" as const,
              permissions: [],
              otpVerifiedAt: new Date(),
              sessionLastSeenAt: new Date(),
            },
      ),
  };
});

const { GET } = await import("@/app/api/media/[id]/route");

/** El instante en que el poller ya reintenta un primer fallo: un minuto después (ADR-012). */
const afterBackoff = () => new Date(Date.now() + 2 * 60_000);

interface Uploaded {
  id: string;
  /** El original y, si ya se procesó, cada variante: todo lo que el medio tiene en el bucket. */
  objects: string[];
}

/** Sube como hace el navegador y confirma. Con `process`, además corre el outbox que arma las variantes. */
async function upload(
  personId: string,
  purpose: "media" | "photo",
  options: { process: boolean } = { process: true },
): Promise<Uploaded> {
  const bytes = await noisePng(520, 400);
  const visibility = purpose === "photo" ? "PRIVATE" : "PUBLIC";
  const contentType = "image/png";
  const prepared = await prepareUpload(
    { filename: "retrato", contentType, byteSize: bytes.byteLength, visibility, purpose },
    { personId },
  );
  keys.push(prepared.key);
  await uploadAsBrowser(prepared, { bytes, contentType, filename: "retrato" });
  const { id } = await confirmUploadAs(
    { personId },
    { key: prepared.key, filename: "retrato", visibility, purpose },
    purpose === "photo" ? { by: "SELF" } : { by: "ADMIN" },
    ownerCheck,
  );
  if (!options.process) {
    return { id, objects: [prepared.key] };
  }
  await drainOutbox();
  const variants = Object.values((await getMedia(id))?.variants ?? {}).map(
    (variant) => variant.key,
  );
  keys.push(...variants);
  return { id, objects: [prepared.key, ...variants] };
}

/** Sube la foto como hace el navegador y no la confirma: devuelve lo que recibiría la confirmación. */
async function uploadUnconfirmed(personId: string) {
  const bytes = await noisePng(520, 400);
  const contentType = "image/png";
  const prepared = await prepareUpload(
    {
      filename: "retrato",
      contentType,
      byteSize: bytes.byteLength,
      visibility: "PRIVATE",
      purpose: "photo",
    },
    { personId },
  );
  keys.push(prepared.key);
  await uploadAsBrowser(prepared, { bytes, contentType, filename: "retrato" });
  return {
    key: prepared.key,
    filename: "retrato",
    visibility: "PRIVATE" as const,
    purpose: "photo" as const,
  };
}

/** Cuántos medios hay registrados con esa clave. */
async function registered(key: string): Promise<number> {
  const rows = await getDb()
    .select({ id: mediaAsset.id })
    .from(mediaAsset)
    .where(eq(mediaAsset.objectKey, key));
  return rows.length;
}

/** Cuáles de esas claves siguen en el bucket. */
async function stillStored(objectKeys: string[]): Promise<string[]> {
  const found = await Promise.all(
    objectKeys.map(async (key) => ((await headObject(key)) ? key : null)),
  );
  return found.filter((key) => key !== null);
}

/** Lo que responde la ruta a `/api/media/<id>` a quien tiene sesión como `viewerId`. */
async function statusFor(viewerId: string, id: string): Promise<number> {
  signedInAs = viewerId;
  const response = await GET(new Request(`https://oeeafit.com/api/media/${id}?w=480`), {
    params: Promise.resolve({ id }),
  });
  return response.status;
}

async function anonymize(personId: string): Promise<void> {
  await requestDeletionAs({ personId });
  await anonymizePersonAs(admin, personId);
}

describe("la foto propia al anonimizar", () => {
  beforeEach(async () => {
    await truncateAll();
    signedInAs = null;
    bucket.rejectsDeleteOf = null;
    bucket.unreadable = false;
    bucket.afterNextPut = null;
  });
  afterAll(async () => {
    bucket.rejectsDeleteOf = null;
    await Promise.all(keys.map((key) => deleteObject(key).catch(() => undefined)));
    await closeDb();
  });

  it("anonimizar borra la fila de la foto, el original y cada variante, también la completa, y la ruta responde que no existe", async () => {
    const leaving = await seedMember("sale.foto@eafit.edu.co");
    const other = await seedMember("otra.foto@eafit.edu.co");
    const photo = await upload(leaving, "photo");
    await setOwnPhotoAs({ personId: leaving }, photo.id);
    // Antes: el original, la de 480 y la completa están en el bucket, y otro miembro la recibe.
    expect(photo.objects).toContain(fullVariantKey(photo.id));
    expect(photo.objects).toContain(variantKey(photo.id, 480));
    expect(await stillStored(photo.objects)).toHaveLength(3);
    expect(await statusFor(other, photo.id)).toBe(302);

    await anonymize(leaving);
    await drainOutbox();

    expect(await getMedia(photo.id)).toBeNull();
    expect(await stillStored(photo.objects)).toEqual([]);
    expect(await statusFor(other, photo.id)).toBe(404);
    expect((await getPersonRecord(leaving))?.photoAssetId).toBeNull();
  });

  it("una foto que se confirma después de anonimizar no se registra, y su objeto se borra", async () => {
    const leaving = await seedMember("tarde.foto@eafit.edu.co");
    const input = await uploadUnconfirmed(leaving);
    await anonymize(leaving);
    await drainOutbox();

    await expect(
      confirmUploadAs({ personId: leaving }, input, { by: "SELF" }, ownerCheck),
    ).rejects.toThrow(t("T-363"));

    expect(await registered(input.key)).toBe(0);
    expect(await stillStored([input.key])).toEqual([]);
    expect(await drainOutbox()).toEqual({ processed: 0, failed: 0 });
  });

  it("confirmar una foto mientras la persona se anonimiza espera la anonimización y no la registra", async () => {
    const leaving = await seedMember("carrera.foto@eafit.edu.co");
    const input = await uploadUnconfirmed(leaving);
    await requestDeletionAs({ personId: leaving });
    // La anonimización queda escrita y sin confirmar: quien confirma todavía lee a la persona viva.
    const held = await holdCommand(admin, (ctx) => anonymizePerson(ctx, leaving));
    const confirming = confirmUploadAs({ personId: leaving }, input, { by: "SELF" }, ownerCheck);
    void confirming.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await expect(confirming).rejects.toThrow(t("T-363"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, confirming]);
    }
    await drainOutbox();
    expect(await registered(input.key)).toBe(0);
    expect(await stillStored([input.key])).toEqual([]);
  });

  it("anonimizar mientras se confirma una foto espera la confirmación y después se la lleva", async () => {
    const leaving = await seedMember("llevada.foto@eafit.edu.co");
    const input = await uploadUnconfirmed(leaving);
    await requestDeletionAs({ personId: leaving });
    // La confirmación queda escrita y sin confirmar, con la persona tomada.
    const held = await holdCommand({ personId: leaving }, (ctx) =>
      confirmUpload(ctx, input, { by: "SELF" }, ownerCheck),
    );
    const anonymizing = anonymizePersonAs(admin, leaving);
    void anonymizing.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await anonymizing;
    } finally {
      held.release();
      await Promise.allSettled([held.done, anonymizing]);
    }
    expect(await registered(input.key)).toBe(1);
    await drainOutbox();
    expect(await registered(input.key)).toBe(0);
    expect(await stillStored([input.key])).toEqual([]);
  });

  it("se van también las fotos que la persona había reemplazado, y no la de otro miembro ni un medio que ella subió como admin", async () => {
    const leaving = await seedMember("sale.varias@eafit.edu.co");
    const other = await seedMember("se.queda@eafit.edu.co");
    const replaced = await upload(leaving, "photo");
    const current = await upload(leaving, "photo");
    await setOwnPhotoAs({ personId: leaving }, replaced.id);
    await setOwnPhotoAs({ personId: leaving }, current.id);
    const cover = await upload(leaving, "media");
    const neighbour = await upload(other, "photo");
    await setOwnPhotoAs({ personId: other }, neighbour.id);

    await anonymize(leaving);
    await drainOutbox();

    expect(await getMedia(replaced.id)).toBeNull();
    expect(await getMedia(current.id)).toBeNull();
    expect(await stillStored([...replaced.objects, ...current.objects])).toEqual([]);
    // Lo que no es su foto sigue entero: se reconoce por la clave `photos/<personId>/`, no por quién subió.
    expect(await getMedia(cover.id)).toMatchObject({ status: "READY", uploadedById: leaving });
    expect(await stillStored(cover.objects)).toEqual(cover.objects);
    expect(await getMedia(neighbour.id)).toMatchObject({ status: "READY" });
    expect(await stillStored(neighbour.objects)).toEqual(neighbour.objects);
    expect((await getPersonRecord(other))?.photoAssetId).toBe(neighbour.id);
  });

  it("si el bucket falla a mitad del borrado la fila queda como rastro, y el reintento termina aunque parte ya no esté", async () => {
    const leaving = await seedMember("sale.falla@eafit.edu.co");
    const photo = await upload(leaving, "photo");
    await setOwnPhotoAs({ personId: leaving }, photo.id);
    const formId = await seedForm("encuesta-foto");
    await seedSubmission(formId, "sale.falla@eafit.edu.co", { personId: leaving });
    await anonymize(leaving);

    bucket.rejectsDeleteOf = fullVariantKey(photo.id);
    await drainOutbox({ expectFailures: [personAnonymized] });
    // El medio sigue en la base con sus claves: es lo que le dice al reintento qué falta por borrar.
    expect(await getMedia(photo.id)).toMatchObject({ id: photo.id });
    expect(await stillStored(photo.objects)).toContain(fullVariantKey(photo.id));
    // Lo que no depende del bucket no esperó: las respuestas de formularios ya se borraron.
    expect(await listSubmissionsByPerson(leaving)).toEqual([]);

    bucket.rejectsDeleteOf = null;
    const retry = await drainOutbox({ now: afterBackoff() });
    expect(retry.failed).toBe(0);
    expect(await getMedia(photo.id)).toBeNull();
    expect(await stillStored(photo.objects)).toEqual([]);
  });

  it("una foto cuyo proceso quedó en espera se borra con lo que alcanzó a escribir, y el proceso reintentado no la revive", async () => {
    const leaving = await seedMember("sale.pendiente@eafit.edu.co");
    const photo = await upload(leaving, "photo", { process: false });
    bucket.unreadable = true;
    await drainOutbox({ expectFailures: [mediaProcess] });
    bucket.unreadable = false;
    // Una variante que el proceso alcanzó a escribir antes de caerse: está en el bucket y no en la fila.
    const written = variantKey(photo.id, 480);
    keys.push(written, fullVariantKey(photo.id));
    await putObject(written, await noisePng(48, 48), "image/webp");
    await setOwnPhotoAs({ personId: leaving }, photo.id);
    expect(await getMedia(photo.id)).toMatchObject({ status: "PENDING", variants: {} });

    await anonymize(leaving);
    await drainOutbox({ expectFailures: [mediaProcess] });

    expect(await getMedia(photo.id)).toBeNull();
    expect(await stillStored([...photo.objects, written])).toEqual([]);

    const retry = await drainOutbox({ now: afterBackoff() });
    expect(retry.failed).toBe(0);
    expect(await getMedia(photo.id)).toBeNull();
    expect(await stillStored([...photo.objects, written, fullVariantKey(photo.id)])).toEqual([]);
  });

  it("si la anonimización se procesa mientras la foto se está procesando, lo que el proceso escribe después no queda huérfano", async () => {
    // Dos workers: uno arma las variantes y el otro, entre una escritura y la siguiente, procesa
    // `person.anonymized` y borra el medio. Lo que el primero escriba después ya no tiene fila.
    const leaving = await seedMember("sale.procesando@eafit.edu.co");
    const photo = await upload(leaving, "photo", { process: false });
    await setOwnPhotoAs({ personId: leaving }, photo.id);
    await anonymize(leaving);
    const written = [variantKey(photo.id, 480), fullVariantKey(photo.id)];
    keys.push(...written);
    let cleanedBy = 0;
    bucket.afterNextPut = async () => {
      cleanedBy = (await drainOutbox()).processed;
    };

    await drainOutbox();

    expect(cleanedBy).toBeGreaterThan(0);
    expect(await getMedia(photo.id)).toBeNull();
    expect(await stillStored([...photo.objects, ...written])).toEqual([]);
  });

  // Esto sí está decidido: ADR-030 regla 2 conserva la foto en el perfil de egresado si hay consentimiento
  // (el de galería para aparecer y el de directorio para la foto). Anonimizar la borra; la baja no.
  it("a la baja con consentimiento el perfil de egresado conserva la foto: la galería la muestra y la ruta la entrega", async () => {
    const leaving = await seedMember("egresa.foto@eafit.edu.co");
    const other = await seedMember("mira.galeria@eafit.edu.co");
    const photo = await upload(leaving, "photo");
    await setOwnPhotoAs({ personId: leaving }, photo.id);
    await recordConsentAs(admin, leaving, "DIRECTORY_PHOTO", "SELF");

    await endMembershipAs(admin, leaving, {
      endReason: "GRADUATION",
      memorialConsent: true,
      contactConsent: false,
    });
    await drainOutbox();

    const gallery = (await listAlumniByYear()).flatMap((year) => year.entries);
    expect(gallery).toMatchObject([{ personId: leaving, photoAssetId: photo.id }]);
    expect(await getMedia(photo.id)).toMatchObject({ status: "READY" });
    expect(await stillStored(photo.objects)).toEqual(photo.objects);
    expect(await statusFor(other, photo.id)).toBe(302);
  });

  // Lo que el código hace mientras la decisión abierta 20 no diga otra cosa. ADR-030 regla 2 conserva la
  // foto del egresado si hay consentimiento; qué pasa con ella cuando no lo hay es la misma pregunta que
  // revocar el consentimiento, y esa no se elige aquí.
  it("mientras la decisión 20 siga abierta, a la baja sin consentimiento la foto se queda como estaba: su fila, sus objetos y la entrega con sesión", async () => {
    const leaving = await seedMember("baja.foto@eafit.edu.co");
    const other = await seedMember("mira.foto@eafit.edu.co");
    const photo = await upload(leaving, "photo");
    await setOwnPhotoAs({ personId: leaving }, photo.id);

    await endMembershipAs(admin, leaving, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });
    await drainOutbox();

    expect(await getMedia(photo.id)).toMatchObject({ status: "READY" });
    expect(await stillStored(photo.objects)).toEqual(photo.objects);
    expect((await getPersonRecord(leaving))?.photoAssetId).toBe(photo.id);
    expect(await statusFor(other, photo.id)).toBe(302);
  });
});
