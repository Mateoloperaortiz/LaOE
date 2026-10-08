import { randomBytes } from "node:crypto";
import { Cron } from "croner";
import { asc, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { mediaBackfill } from "@/domain-events/content";
import { getEnv } from "@/env";
import { SCHEDULE } from "@/jobs/schedule";
import { enqueueScheduled } from "@/jobs/scheduler";
import { confirmUploadAs, getMedia, prepareUpload, resolveMediaRedirect } from "@/modules/content";
import {
  BACKFILL_BATCH,
  BACKFILL_PAUSE_MS,
  queueFullVariantBackfill,
} from "@/modules/content/domain/media-backfill";
import { processMedia } from "@/modules/content/domain/media-process";
import { mediaAsset } from "@/modules/content/schema";
import { lockPersonAnonymization } from "@/modules/people";
import { outbox } from "@/modules/system/schema";
import { deleteObject, headObject, putObject } from "@/shared/adapters/storage";
import { noisePng, uploadAsBrowser } from "../helpers/media";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Lo que se entrega de un medio (ADR-114 regla 8), por la interfaz pública de `content` y contra Garage
// en local: se sube como sube el navegador, se procesa por el outbox y se descarga lo que firma el 302.

const keys: string[] = [];

/** Lo que compone la capa de la app: content pregunta y people responde con la persona tomada. */
const ownerCheck = { lockOwner: lockPersonAnonymization };

/** El modelo del teléfono que viaja en el EXIF de las fotos de prueba. */
const PHONE = "Telefono-de-prueba-XZ";

/** Una foto como sale de un teléfono: JPEG con marca, modelo y ubicación en el EXIF. */
async function phonePhoto(width: number, height: number): Promise<Buffer> {
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .withExif({
      IFD0: { Make: "Marca de prueba", Model: PHONE },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "6/1 12/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "75/1 34/1 0/1",
      },
    })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Sube como hace el navegador, confirma y procesa por el outbox. Devuelve el id del medio. */
async function upload(
  personId: string,
  purpose: "media" | "photo",
  bytes: Buffer,
  contentType: "image/jpeg" | "image/png",
): Promise<string> {
  const visibility = purpose === "photo" ? "PRIVATE" : "PUBLIC";
  const prepared = await prepareUpload(
    { filename: "imagen", contentType, byteSize: bytes.byteLength, visibility, purpose },
    { personId },
  );
  keys.push(prepared.key);
  await uploadAsBrowser(prepared, { bytes, contentType, filename: "imagen" });
  const { id } = await confirmUploadAs(
    { personId },
    { key: prepared.key, filename: "imagen", visibility, purpose },
    purpose === "photo" ? { by: "SELF" } : { by: "ADMIN" },
    ownerCheck,
  );
  await drainOutbox();
  keys.push(...Object.values((await getMedia(id))?.variants ?? {}).map((variant) => variant.key));
  return id;
}

async function assetOf(id: string) {
  const asset = await getMedia(id);
  if (!asset) {
    throw new Error(`No existe el medio ${id}`);
  }
  return asset;
}

/** La dirección que se firma para quien pide el medio con sesión. */
async function signed(id: string, width: number | null): Promise<string> {
  const result = await resolveMediaRedirect(id, width, { authenticated: true });
  if (result.status !== 302) {
    throw new Error(`Se esperaba un 302 y llegó ${result.status}`);
  }
  return result.url;
}

/** Lo que recibe quien pide el medio con sesión: la dirección que se firmó y los bytes que entrega. */
async function delivered(id: string, width: number | null): Promise<{ url: string; body: Buffer }> {
  const url = await signed(id, width);
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return { url, body: Buffer.from(await response.arrayBuffer()) };
}

/** Qué metadatos trae lo entregado: el bloque EXIF, el XMP y el modelo del teléfono en claro. */
async function metadataOf(body: Buffer): Promise<{ exif: boolean; xmp: boolean; phone: boolean }> {
  const metadata = await sharp(body).metadata();
  return {
    exif: metadata.exif !== undefined,
    xmp: metadata.xmp !== undefined,
    phone: body.includes(PHONE),
  };
}

const NONE = { exif: false, xmp: false, phone: false };

/** Anchos que alguien puede pedir, también los que la ruta no dejaría pasar. */
const WIDTHS = [null, 1, 96, 479, 480, 700, 960, 1600, 9999, 0, -5, 0.5, Number.NaN, Infinity];

/**
 * Deja un medio como quedaba procesado antes de ADR-114 regla 8: listo, con sus variantes de ancho y
 * sin la completa. No hay comando que produzca ese estado: es el de las filas que ya existen.
 */
async function asProcessedBefore(id: string): Promise<void> {
  const { full, ...ladder } = (await assetOf(id)).variants;
  await getDb().update(mediaAsset).set({ variants: ladder }).where(eq(mediaAsset.id, id));
  if (full) {
    await deleteObject(full.key);
  }
}

/**
 * Un medio de antes, escrito a mano con un id que fija su lugar en el recorrido del relleno. `bytes`
 * es lo que hay en el bucket bajo su clave; null si el objeto ya no está.
 */
async function oldAsset(
  id: string,
  bytes: Buffer | string | null,
  contentType = "image/png",
): Promise<{ id: string; objectKey: string }> {
  const objectKey = `uploads/2026/01/${id}.bin`;
  keys.push(objectKey, `variants/${id}/full.webp`);
  // El bucket no se vacía entre pruebas: lo que haya de otra corrida bajo estas claves se quita.
  await deleteObject(`variants/${id}/full.webp`);
  if (bytes === null) {
    await deleteObject(objectKey);
  } else {
    await putObject(objectKey, bytes, contentType);
  }
  await getDb()
    .insert(mediaAsset)
    .values({
      id,
      visibility: "PRIVATE",
      objectKey,
      originalFilename: `${id}.bin`,
      contentType,
      byteSize: 10_000,
      status: "READY",
    });
  return { id, objectKey };
}

function backfillEntry() {
  const entry = SCHEDULE.find((item) => item.events.includes(mediaBackfill.type));
  if (!entry) {
    throw new Error("El relleno de medios no está programado");
  }
  return entry;
}

/** Lo que hace el scheduler a su hora: encola el arranque de una pasada. */
async function startBackfill(): Promise<void> {
  await enqueueScheduled(backfillEntry());
}

async function withFullVariant(): Promise<string[]> {
  const rows = await getDb().select().from(mediaAsset).orderBy(asc(mediaAsset.id));
  return rows.filter((row) => "full" in row.variants).map((row) => row.id);
}

async function pendingEvents(): Promise<Array<{ type: string; payload: unknown }>> {
  return getDb()
    .select({ type: outbox.eventType, payload: outbox.payload })
    .from(outbox)
    .where(isNull(outbox.processedAt));
}

/** El instante en que ya venció la pausa entre dos lotes. */
function afterPause(): Date {
  return new Date(Date.now() + BACKFILL_PAUSE_MS + 1_000);
}

afterAll(async () => {
  await Promise.all(keys.map((key) => deleteObject(key).catch(() => undefined)));
  await closeDb();
});

describe("lo que se entrega de un medio", () => {
  beforeEach(truncateAll);

  it("la foto de un miembro pedida sin ancho no trae la ubicación ni el modelo del teléfono", async () => {
    const member = await seedMember("foto.grande@eafit.edu.co");
    const photo = await phonePhoto(1200, 800);
    // La foto que se sube sí los trae: si no, la prueba no dice nada.
    expect(await metadataOf(photo)).toEqual({ exif: true, xmp: false, phone: true });
    const id = await upload(member, "photo", photo, "image/jpeg");
    const asset = await assetOf(id);

    const { url, body } = await delivered(id, null);

    expect(await metadataOf(body)).toEqual(NONE);
    expect(url).not.toContain(asset.objectKey);
  });

  it("una foto de menos de 480 píxeles de ancho tampoco, se pida con el ancho que se pida", async () => {
    const member = await seedMember("foto.chica@eafit.edu.co");
    const id = await upload(member, "photo", await phonePhoto(300, 400), "image/jpeg");
    const asset = await assetOf(id);

    // 480 es el ancho con el que la piden el directorio, la tarjeta de la persona y Mi OE.
    for (const width of [null, 480, 96, 1600]) {
      const { url, body } = await delivered(id, width);
      expect(await metadataOf(body)).toEqual(NONE);
      expect(url).not.toContain(asset.objectKey);
    }
  });

  it("al procesar un medio queda su variante completa, del tamaño del original, y las de ancho se eligen como antes", async () => {
    const admin = await seedMember("portada@eafit.edu.co");
    const id = await upload(admin, "media", await noisePng(1200, 800), "image/png");
    const asset = await assetOf(id);

    expect(Object.keys(asset.variants).sort()).toEqual(["full", "w480", "w960"]);
    const full = asset.variants.full;
    expect(full).toMatchObject({
      key: `variants/${id}/full.webp`,
      width: 1200,
      height: 800,
      contentType: "image/webp",
    });
    expect(await headObject(`variants/${id}/full.webp`)).toEqual({
      contentType: "image/webp",
      byteSize: full?.byteSize,
    });

    // Sin ancho, la completa. Con ancho, la escalera de siempre: la completa no es un peldaño más.
    expect(await signed(id, null)).toContain(`variants/${id}/full.webp`);
    expect(await signed(id, 960)).toContain(`variants/${id}/w960.webp`);
    expect(await signed(id, 700)).toContain(`variants/${id}/w480.webp`);
    expect(await signed(id, 100)).toContain(`variants/${id}/w480.webp`);
    expect(await signed(id, 1200)).toContain(`variants/${id}/w960.webp`);
    expect(await signed(id, 4000)).toContain(`variants/${id}/w960.webp`);
    // El original no se firma con ningún ancho.
    for (const width of WIDTHS) {
      expect(await signed(id, width)).not.toContain(asset.objectKey);
    }
    const body = (await delivered(id, null)).body;
    expect(await sharp(body).metadata()).toMatchObject({
      format: "webp",
      width: 1200,
      height: 800,
    });
  });

  it("una foto tomada con el teléfono de lado se entrega derecha y sin reducir", async () => {
    const member = await seedMember("foto.de.lado@eafit.edu.co");
    // 400 × 600 en el archivo, con la orientación EXIF que la gira un cuarto de vuelta al mostrarla:
    // derecha mide 600 × 400, más ancha que el archivo.
    const sideways = await sharp(randomBytes(400 * 600 * 3), {
      raw: { width: 400, height: 600, channels: 3 },
    })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 80 })
      .toBuffer();
    expect((await sharp(sideways).metadata()).orientation).toBe(6);
    const id = await upload(member, "photo", sideways, "image/jpeg");

    expect((await assetOf(id)).variants.full).toMatchObject({ width: 600, height: 400 });
    const metadata = await sharp((await delivered(id, null)).body).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 600, height: 400 });
    expect(metadata.orientation).toBeUndefined();
  });

  it("la variante completa no pasa de 2560 píxeles de lado: una foto más grande sale reducida a ese lado y sus variantes de ancho no cambian", async () => {
    const member = await seedMember("foto.grande@eafit.edu.co");
    // 3000 × 4000: una foto vertical de 12 megapíxeles, lo corriente en un teléfono. El lado que
    // manda es el alto, no el ancho.
    const big = await sharp({
      create: { width: 3000, height: 4000, channels: 3, background: "#c85028" },
    })
      .jpeg()
      .toBuffer();
    const id = await upload(member, "photo", big, "image/jpeg");
    const asset = await assetOf(id);

    expect(asset).toMatchObject({ status: "READY", error: null, width: 3000, height: 4000 });
    expect(Object.keys(asset.variants).sort()).toEqual(["full", "w1600", "w480", "w960"]);
    expect(asset.variants.full).toMatchObject({ width: 1920, height: 2560 });
    expect(asset.variants.w1600).toMatchObject({ width: 1600, height: 2133 });
    const metadata = await sharp((await delivered(id, null)).body).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 1920, height: 2560 });
  });

  it("una imagen más ancha de lo que admite un WebP queda lista, con la completa reducida al mismo lado", async () => {
    const admin = await seedMember("panoramica@eafit.edu.co");
    const id = await upload(admin, "media", await noisePng(17_000, 40), "image/png");
    const asset = await assetOf(id);

    expect(asset).toMatchObject({ status: "READY", error: null, width: 17_000, height: 40 });
    expect(Object.keys(asset.variants).sort()).toEqual(["full", "w1600", "w480", "w960"]);
    expect(asset.variants.full).toMatchObject({ width: 2560, height: 6 });
    expect(await signed(id, null)).toContain(`variants/${id}/full.webp`);
  });
});

describe("el relleno de los medios procesados antes", () => {
  beforeEach(truncateAll);

  it("está programado cada hora, a los veinte minutos", () => {
    const schedule = new Cron(backfillEntry().cron, {
      timezone: getEnv().APP_TIMEZONE,
      paused: true,
    });
    try {
      expect(schedule.nextRun(new Date("2026-10-07T15:00:00Z"))).toEqual(
        new Date("2026-10-07T15:20:00Z"),
      );
      expect(schedule.nextRun(new Date("2026-10-07T15:20:01Z"))).toEqual(
        new Date("2026-10-07T16:20:00Z"),
      );
    } finally {
      schedule.stop();
    }
  });

  it("un medio de antes se sirve como antes hasta que el relleno le escribe su variante completa, y desde ahí su original no se entrega", async () => {
    const member = await seedMember("foto.de.antes@eafit.edu.co");
    const id = await upload(member, "photo", await phonePhoto(1200, 800), "image/jpeg");
    await asProcessedBefore(id);
    const { objectKey } = await assetOf(id);

    // Antes del relleno nada cambia: sin ancho sale el original, con sus metadatos.
    const before = await delivered(id, null);
    expect(before.url).toContain(objectKey);
    expect(await metadataOf(before.body)).toEqual({ exif: true, xmp: false, phone: true });
    expect(await signed(id, 960)).toContain(`variants/${id}/w960.webp`);

    await startBackfill();
    await drainOutbox();

    const asset = await assetOf(id);
    expect(asset.status).toBe("READY");
    expect(Object.keys(asset.variants).sort()).toEqual(["full", "w480", "w960"]);
    expect(asset.variants.full).toMatchObject({ width: 1200, height: 800 });
    const after = await delivered(id, null);
    expect(after.url).toContain(`variants/${id}/full.webp`);
    expect(await metadataOf(after.body)).toEqual(NONE);
    for (const width of WIDTHS) {
      expect(await signed(id, width)).not.toContain(objectKey);
    }
    // El original sigue en el bucket: deja de entregarse, no se borra.
    expect(await headObject(objectKey)).not.toBeNull();
  });

  it("un medio de antes con la variante completa anotada en nulo cuenta como sin ella: el relleno se la escribe y su original deja de entregarse", async () => {
    const member = await seedMember("foto.con.nulo@eafit.edu.co");
    const id = await upload(member, "photo", await phonePhoto(600, 400), "image/jpeg");
    await asProcessedBefore(id);
    // Ningún comando escribe ese nulo: es un estado del JSON guardado, no del tipo.
    await getDb()
      .update(mediaAsset)
      .set({ variants: sql`${mediaAsset.variants} || '{"full": null}'::jsonb` })
      .where(eq(mediaAsset.id, id));
    const { objectKey } = await assetOf(id);
    expect((await delivered(id, null)).url).toContain(objectKey);

    await startBackfill();
    await drainOutbox();

    expect((await assetOf(id)).variants.full).toMatchObject({ width: 600, height: 400 });
    const after = await delivered(id, null);
    expect(after.url).toContain(`variants/${id}/full.webp`);
    expect(await metadataOf(after.body)).toEqual(NONE);
  });

  it("repetir el relleno no vuelve a trabajar sobre un medio que ya tiene su variante", async () => {
    const member = await seedMember("foto.repetida@eafit.edu.co");
    const id = await upload(member, "photo", await phonePhoto(600, 400), "image/jpeg");
    await asProcessedBefore(id);
    await startBackfill();
    await drainOutbox();
    const done = await assetOf(id);
    expect(Object.keys(done.variants).sort()).toEqual(["full", "w480"]);

    await startBackfill();
    // Solo corre el arranque de la pasada: no encuentra a nadie y no encola nada.
    expect(await drainOutbox()).toEqual({ processed: 1, failed: 0 });
    expect(await pendingEvents()).toEqual([]);
    expect(await processMedia(id)).toBe("skipped");
    expect(await assetOf(id)).toEqual(done);
  });

  it("va de a pocos: un lote por pasada y el siguiente un minuto después, hasta que no queda ninguno", async () => {
    const png = await noisePng(80, 80);
    const total = BACKFILL_BATCH + 2;
    const ids = Array.from(
      { length: total },
      (_, index) => `lote-${String(index).padStart(2, "0")}`,
    );
    for (const id of ids) {
      await oldAsset(id, png);
    }

    await startBackfill();
    await drainOutbox();

    // El primer lote, por id, y el siguiente agendado con el cursor en el último que tomó.
    expect(await withFullVariant()).toEqual(ids.slice(0, BACKFILL_BATCH));
    expect(await pendingEvents()).toEqual([
      { type: "media.backfill", payload: { cursor: ids[BACKFILL_BATCH - 1] } },
    ]);
    // Todavía no venció la pausa: drenar de nuevo no lo adelanta.
    expect(await drainOutbox()).toEqual({ processed: 0, failed: 0 });

    await drainOutbox({ now: afterPause() });

    expect(await withFullVariant()).toEqual(ids);
    expect(await pendingEvents()).toEqual([]);
    for (const id of ids) {
      expect(await signed(id, 480)).toContain(`variants/${id}/full.webp`);
    }
  });

  it("un medio de antes que ya no se puede recodificar sigue publicado como estaba y no frena a los demás", async () => {
    // Los cinco primeros del recorrido llenan el primer lote y ninguno se puede recodificar.
    const stuck = [
      await oldAsset("trabado-a1", "esto no es una imagen ".repeat(400)),
      await oldAsset("trabado-a2", "%PDF-1.7 un documento".repeat(400), "application/pdf"),
      await oldAsset("trabado-a3", null),
      await oldAsset("trabado-a4", "GIF89a".repeat(400), "image/gif"),
      await oldAsset("trabado-a5", (await noisePng(80, 80)).subarray(0, 60)),
    ];
    expect(stuck).toHaveLength(BACKFILL_BATCH);
    // Por id va después de los cinco: le toca el segundo lote.
    const good = await oldAsset("trabado-z9", await phonePhoto(300, 200), "image/jpeg");

    await startBackfill();
    // Ninguno hace fallar su trabajo: `drainOutbox` rompería con un handler fallido.
    await drainOutbox();
    expect(await withFullVariant()).toEqual([]);
    await drainOutbox({ now: afterPause() });

    expect(await withFullVariant()).toEqual([good.id]);
    expect(await metadataOf((await delivered(good.id, null)).body)).toEqual(NONE);
    for (const item of stuck) {
      // Sigue listo, sin error y servido desde su original, como antes del cambio.
      const asset = await assetOf(item.id);
      expect(asset).toMatchObject({ status: "READY", error: null });
      expect(asset.variants).toEqual({});
      expect(await signed(item.id, null)).toContain(item.objectKey);
      expect(await headObject(`variants/${item.id}/full.webp`)).toBeNull();
    }

    // La pasada de la hora siguiente los vuelve a intentar y termina igual: no queda nada pendiente.
    await startBackfill();
    await drainOutbox();
    await drainOutbox({ now: afterPause() });
    expect(await pendingEvents()).toEqual([]);
    expect(await withFullVariant()).toEqual([good.id]);
  });

  it("no toca un medio que sigue pendiente ni uno que quedó fallido", async () => {
    const png = await noisePng(80, 80);
    const pending = await oldAsset("estado-pendiente", png);
    const failed = await oldAsset("estado-fallido", png);
    const db = getDb();
    await db.update(mediaAsset).set({ status: "PENDING" }).where(eq(mediaAsset.id, pending.id));
    await db
      .update(mediaAsset)
      .set({ status: "FAILED", error: "motivo de antes" })
      .where(eq(mediaAsset.id, failed.id));

    await startBackfill();
    // Solo corre el arranque de la pasada: a ninguno de los dos le encola trabajo.
    expect(await drainOutbox()).toEqual({ processed: 1, failed: 0 });
    expect(await pendingEvents()).toEqual([]);
    expect(await assetOf(pending.id)).toMatchObject({ status: "PENDING", variants: {} });
    expect(await assetOf(failed.id)).toMatchObject({ status: "FAILED", error: "motivo de antes" });
    expect(await withFullVariant()).toEqual([]);
  });

  it("dos pasadas y varios procesos a la vez sobre el mismo medio dejan una sola variante completa y conservan las de ancho", async () => {
    const admin = await seedMember("portada.de.antes@eafit.edu.co");
    const id = await upload(admin, "media", await noisePng(1200, 800), "image/png");
    const ladder = (await assetOf(id)).variants;
    await asProcessedBefore(id);

    // Dos pasadas simultáneas no encolan dos veces el trabajo del mismo medio.
    const queued = await Promise.all([
      queueFullVariantBackfill({ cursor: undefined, eventId: "pasada-a" }),
      queueFullVariantBackfill({ cursor: undefined, eventId: "pasada-b" }),
    ]);
    expect(queued).toEqual([
      { queued: 1, more: false },
      { queued: 1, more: false },
    ]);
    expect(await pendingEvents()).toEqual([{ type: "media.process", payload: { assetId: id } }]);

    // Y si igual corren varios a la vez, cada uno suma la completa sin pisar lo que había.
    const outcomes = await Promise.all(Array.from({ length: 4 }, () => processMedia(id)));
    expect(outcomes).toEqual(["ready", "ready", "ready", "ready"]);
    await drainOutbox();

    const asset = await assetOf(id);
    expect(asset.variants).toEqual({ ...ladder, full: asset.variants.full });
    expect(Object.keys(asset.variants).sort()).toEqual(["full", "w480", "w960"]);
    expect(await headObject(`variants/${id}/full.webp`)).toMatchObject({
      byteSize: asset.variants.full?.byteSize,
    });
    expect(await processMedia(id)).toBe("skipped");
  });
});
