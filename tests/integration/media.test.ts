import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  confirmUpload,
  getPublicMediaRef,
  listReadyPublicMedia,
  prepareUpload,
  resolveMediaRedirect,
} from "@/modules/content/domain/media";
import { processMedia } from "@/modules/content/domain/media-process";
import { mediaAsset } from "@/modules/content/schema";
import { outbox } from "@/modules/system/schema";
import { deleteObject, headObject } from "@/shared/adapters/storage";
import { tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { noisePng, uploadAsBrowser } from "../helpers/media";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Contra Garage en local: la subida directa se simula con fetch y FormData, como hace el navegador.

const keys: string[] = [];

async function uploadDirect(
  bytes: Buffer | string,
  contentType: string,
  filename: string,
  byteSize: number,
) {
  const prepared = await prepareUpload({ filename, contentType, byteSize, visibility: "PUBLIC" });
  keys.push(prepared.key);
  await uploadAsBrowser(prepared, { bytes, contentType, filename });
  return prepared.key;
}

describe("medios", () => {
  beforeEach(truncateAll);
  afterAll(async () => {
    await Promise.all(keys.map((key) => deleteObject(key).catch(() => undefined)));
    await closeDb();
  });

  it("un medio cuyo tipo guardado no es de los admitidos queda fallido con el motivo del catálogo", async () => {
    const [row] = await getDb()
      .insert(mediaAsset)
      .values({
        objectKey: "uploads/tipo-de-antes.gif",
        originalFilename: "tipo-de-antes.gif",
        contentType: "image/gif",
        byteSize: 10_000,
      })
      .returning({ id: mediaAsset.id });
    const id = row?.id ?? "";
    expect(await processMedia(id)).toBe("failed");
    const [asset] = await getDb().select().from(mediaAsset).where(eq(mediaAsset.id, id));
    expect(asset).toMatchObject({ status: "FAILED", error: tList("T-3207")[1] });
  });

  it("rechaza tipos y tamaños fuera de regla antes de firmar", async () => {
    await expect(
      prepareUpload({
        filename: "a.gif",
        contentType: "image/gif",
        byteSize: 10_000,
        visibility: "PUBLIC",
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      prepareUpload({
        filename: "a.png",
        contentType: "image/png",
        byteSize: 100,
        visibility: "PUBLIC",
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("confirma una subida, genera las variantes por outbox y resuelve el 302 por ancho", async () => {
    const png = await noisePng(1200, 800);
    const key = await uploadDirect(png, "image/png", "portada.png", png.byteLength);

    const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      confirmUpload(
        ctx,
        { key, filename: "portada.png", visibility: "PUBLIC", purpose: "media" },
        { by: "ADMIN" },
      ),
    );
    let [asset] = await getDb().select().from(mediaAsset).where(eq(mediaAsset.id, id));
    expect(asset).toMatchObject({
      status: "PENDING",
      contentType: "image/png",
      byteSize: png.byteLength,
    });
    const [job] = await getDb()
      .select()
      .from(outbox)
      .where(
        and(eq(outbox.eventType, "media.process"), eq(outbox.dedupeKey, `media.process:${id}`)),
      );
    expect(job?.payload).toEqual({ assetId: id });
    // Confirmar dos veces la misma clave falla con el texto del inventario.
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        confirmUpload(
          ctx,
          { key, filename: "portada.png", visibility: "PUBLIC", purpose: "media" },
          { by: "ADMIN" },
        ),
      ),
    ).rejects.toBeInstanceOf(DomainError);

    // Todavía no está lista: la entrega responde 404.
    expect(await resolveMediaRedirect(id, 960, { authenticated: false })).toEqual({ status: 404 });

    expect(await processMedia(id)).toBe("ready");
    [asset] = await getDb().select().from(mediaAsset).where(eq(mediaAsset.id, id));
    expect(asset).toMatchObject({ status: "READY", width: 1200, height: 800, error: null });
    // 1600 agrandaría; `full` es la completa, que se entrega en lugar del original (ADR-114 regla 8).
    expect(Object.keys(asset?.variants ?? {}).sort()).toEqual(["full", "w480", "w960"]);
    for (const variant of Object.values(asset?.variants ?? {})) {
      keys.push(variant.key);
      expect(await headObject(variant.key)).toMatchObject({ contentType: "image/webp" });
      expect(variant.byteSize).toBeGreaterThan(0);
    }
    expect(asset?.variants.w480?.height).toBe(320);
    // Procesar de nuevo no repite el trabajo.
    expect(await processMedia(id)).toBe("skipped");

    const exact = await resolveMediaRedirect(id, 960, { authenticated: false });
    expect(exact.status).toBe(302);
    if (exact.status === 302) {
      expect(exact.url).toContain(`variants/${id}/w960.webp`);
      expect(exact.cacheControl).toBe("public, max-age=518400");
      expect((await fetch(exact.url)).status).toBe(200);
    }
    const between = await resolveMediaRedirect(id, 700, { authenticated: false });
    expect(between.status === 302 && between.url).toContain("w480.webp");
    const whole = await resolveMediaRedirect(id, null, { authenticated: false });
    expect(whole.status === 302 && whole.url).toContain(`variants/${id}/full.webp`);
    expect(whole.status === 302 && whole.url).not.toContain(key);

    expect(await getPublicMediaRef(id)).toMatchObject({ id, width: 1200, height: 800 });
    expect(await listReadyPublicMedia()).toEqual([{ id, label: "portada.png · 1200×800" }]);
  });

  it("marca FAILED sin reintento un objeto que no es una imagen y exige sesión para lo privado", async () => {
    const text = "esto no es una imagen ".repeat(400); // > 5 KB
    const key = await uploadDirect(text, "image/png", "falso.png", Buffer.byteLength(text));
    const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      confirmUpload(
        ctx,
        { key, filename: "falso.png", visibility: "PRIVATE", purpose: "media" },
        { by: "ADMIN" },
      ),
    );
    expect(await processMedia(id)).toBe("failed");
    const [asset] = await getDb().select().from(mediaAsset).where(eq(mediaAsset.id, id));
    expect(asset?.status).toBe("FAILED");
    expect(asset?.error).toContain("decodificar");
    expect(await resolveMediaRedirect(id, null, { authenticated: true })).toEqual({ status: 404 });

    const png = await noisePng(300, 200);
    const privateKey = await uploadDirect(png, "image/png", "privada.png", png.byteLength);
    const created = await runCommand(SYSTEM_ACTOR, (ctx) =>
      confirmUpload(
        ctx,
        { key: privateKey, filename: "privada.png", visibility: "PRIVATE", purpose: "media" },
        { by: "ADMIN" },
      ),
    );
    expect(await processMedia(created.id)).toBe("ready");
    expect(await resolveMediaRedirect(created.id, null, { authenticated: false })).toEqual({
      status: 403,
    });
    const allowed = await resolveMediaRedirect(created.id, null, { authenticated: true });
    expect(allowed.status).toBe(302);
    if (allowed.status === 302) {
      expect(allowed.cacheControl).toBe("private, max-age=300");
    }
    // Sin variantes de ancho (300 px no admite ninguna) se sirve la completa, y no es pública.
    expect(await getPublicMediaRef(created.id)).toBeNull();
  });

  it("un medio de más píxeles que el tope queda fallido con su motivo y sin variantes", async () => {
    // 40.008.000 píxeles de un solo color: 0,5 MB, dentro del tamaño que admite la subida.
    const png = await sharp({
      create: { width: 8000, height: 5001, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
      .png()
      .toBuffer();
    const key = await uploadDirect(png, "image/png", "enorme.png", png.byteLength);
    const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      confirmUpload(
        ctx,
        { key, filename: "enorme.png", visibility: "PUBLIC", purpose: "media" },
        { by: "ADMIN" },
      ),
    );

    // El job corre por el outbox y termina: un fallo del handler rompería el drenado.
    await drainOutbox();

    const [asset] = await getDb().select().from(mediaAsset).where(eq(mediaAsset.id, id));
    expect(asset).toMatchObject({ status: "FAILED", error: tList("T-3207")[2] });
    expect(asset?.variants).toEqual({});
    expect(await headObject(`variants/${id}/w480.webp`)).toBeNull();
    expect(await resolveMediaRedirect(id, 480, { authenticated: false })).toEqual({ status: 404 });
    expect(await drainOutbox()).toEqual({ processed: 0, failed: 0 });
  });
});
