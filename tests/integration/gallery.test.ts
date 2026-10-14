import { createHash, randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  getGalleryAlbum,
  getGalleryCollection,
  openGalleryPhoto,
} from "@/modules/content/domain/gallery";
import {
  configureGalleryCollectionAs,
  findGalleryPhotoForImportAs,
  publishGalleryCollectionAs,
  registerGalleryPhotoAs,
  upsertGalleryAlbumAs,
  upsertGalleryCollectionAs,
} from "@/modules/content/domain/gallery-import";
import { resolveMediaRedirect } from "@/modules/content/domain/media";
import { galleryAlbum, galleryCollection, galleryPhoto } from "@/modules/content/schema";
import { auditLog } from "@/modules/system/schema";
import { deleteObject, putObject } from "@/shared/adapters/storage";
import { DomainError } from "@/shared/lib/errors";
import { seedMember, seedPermission } from "../factories";
import { seedSyntheticGallery } from "../factories/gallery";
import { truncateAll } from "./db";

const keys: string[] = [];

async function adminActor() {
  const personId = await seedMember("galeria-prueba@eafit.edu.co");
  await seedPermission(personId, "ADMIN");
  return { personId, ip: null, isAdmin: true, membershipStatus: "ACTIVE" };
}

async function preparedPhoto(slug: string) {
  const sourceHash = createHash("sha256").update(randomUUID()).digest("hex");
  const data = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "#001f3e" },
  })
    .webp()
    .toBuffer();
  const key = `fotos/${slug}/${sourceHash}/w300.webp`;
  await putObject(key, data, "image/webp");
  keys.push(key);
  return {
    sourceHash,
    width: 300,
    height: 200,
    alt: "Imagen geométrica de prueba",
    variants: {
      w300: {
        key,
        width: 300,
        height: 200,
        byteSize: data.byteLength,
        contentType: "image/webp" as const,
      },
    },
  };
}

describe("colección privada de fotos", () => {
  beforeEach(truncateAll);
  afterAll(async () => {
    await Promise.all(keys.map((key) => deleteObject(key).catch(() => undefined)));
    await closeDb();
  });

  it("importa por hash sin duplicar objetos, publica con conteos y no entra por media", async () => {
    const actor = await adminActor();
    const collection = await upsertGalleryCollectionAs(actor, {
      slug: "prueba",
      title: "Prueba",
      description: "Fotos sintéticas",
    });
    await upsertGalleryAlbumAs(actor, {
      collectionId: collection.id,
      slug: "momentos",
      title: "Momentos",
      caption: "Prueba",
      sortOrder: 0,
    });
    await upsertGalleryAlbumAs(actor, {
      collectionId: collection.id,
      slug: "oe",
      title: "Selección OE",
      caption: "Prueba",
      sortOrder: 1,
    });
    const prepared = await preparedPhoto("prueba");
    const input = {
      ...prepared,
      collectionId: collection.id,
      albums: [
        { slug: "momentos", sortOrder: 0 },
        { slug: "oe", sortOrder: 0 },
      ],
    };
    const first = await registerGalleryPhotoAs(actor, input);
    expect(first.created).toBe(true);
    expect(await registerGalleryPhotoAs(actor, input)).toEqual({ id: first.id, created: false });
    expect((await getDb().select({ n: count() }).from(galleryPhoto))[0]?.n).toBe(1);
    expect(await getGalleryCollection("prueba")).toBeNull();
    expect(await openGalleryPhoto(first.id, 480)).toBeNull();
    await configureGalleryCollectionAs(actor, {
      collectionId: collection.id,
      heroSourceHash: prepared.sourceHash,
      albumCovers: { momentos: prepared.sourceHash, oe: prepared.sourceHash },
      featuredSourceHashes: [prepared.sourceHash],
    });
    await expect(
      publishGalleryCollectionAs(actor, {
        collectionId: collection.id,
        expectedAlbumCounts: { momentos: 2, oe: 1 },
        expectedPhotoCount: 1,
        expectedFeaturedCount: 1,
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await publishGalleryCollectionAs(actor, {
      collectionId: collection.id,
      expectedAlbumCounts: { momentos: 1, oe: 1 },
      expectedPhotoCount: 1,
      expectedFeaturedCount: 1,
    });
    const view = await getGalleryCollection("prueba");
    expect(view?.hero?.id).toBe(first.id);
    expect(view?.albums.map((album) => album.photoCount)).toEqual([1, 1]);
    expect(view?.featured.map((photo) => photo.id)).toEqual([first.id]);
    expect(JSON.stringify(view)).not.toContain("fotos/prueba/");
    expect(await findGalleryPhotoForImportAs(actor, prepared.sourceHash)).toMatchObject({
      id: first.id,
    });
    expect(await resolveMediaRedirect(first.id, 480, { authenticated: true })).toEqual({
      status: 404,
    });
    expect(await resolveMediaRedirect(first.id, null, { authenticated: false })).toEqual({
      status: 404,
    });
    const photo = await openGalleryPhoto(first.id, 480);
    expect(photo).not.toBeNull();
    if (!photo) throw new Error("foto no servida");
    const metadata = await sharp(
      Buffer.from(await new Response(photo.body).arrayBuffer()),
    ).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 300, height: 200 });
    expect(metadata.exif).toBeUndefined();
    expect(
      await getDb()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "gallery.collection-published")),
    ).toHaveLength(1);
  });

  it("rechaza no ADMIN, portadas ajenas y variantes no preparadas sin publicar", async () => {
    const actor = await adminActor();
    await expect(
      upsertGalleryCollectionAs(
        { ...actor, isAdmin: false },
        { slug: "denegado", title: "Prueba", description: "" },
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      upsertGalleryCollectionAs(
        { ...actor, membershipStatus: "ON_LEAVE" },
        { slug: "denegado", title: "Prueba", description: "" },
      ),
    ).rejects.toBeInstanceOf(DomainError);
    const one = await seedSyntheticGallery({
      slug: "primera",
      published: false,
      actorId: actor.personId,
    });
    const two = await seedSyntheticGallery({
      slug: "segunda",
      published: false,
      actorId: actor.personId,
    });
    keys.push(...one.keys, ...two.keys);
    const [foreign] = await getDb()
      .select()
      .from(galleryPhoto)
      .where(eq(galleryPhoto.id, two.photoIds[0] ?? ""));
    const [own] = await getDb()
      .select()
      .from(galleryPhoto)
      .where(eq(galleryPhoto.id, one.photoIds[0] ?? ""));
    if (!foreign || !own) throw new Error("fixture no creado");
    await expect(
      configureGalleryCollectionAs(actor, {
        collectionId: one.collectionId,
        heroSourceHash: foreign.sourceHash,
        albumCovers: {},
        featuredSourceHashes: [],
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      configureGalleryCollectionAs(actor, {
        collectionId: one.collectionId,
        heroSourceHash: own.sourceHash,
        albumCovers: { momentos: foreign.sourceHash },
        featuredSourceHashes: [],
      }),
    ).rejects.toBeInstanceOf(DomainError);
    const broken = await preparedPhoto("primera");
    await expect(
      registerGalleryPhotoAs(actor, {
        ...broken,
        variants: { w300: { ...broken.variants.w300, key: "uploads/original.jpg" } },
        collectionId: one.collectionId,
        albums: [{ slug: "momentos", sortOrder: 3 }],
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await getGalleryCollection("primera")).toBeNull();
  });

  it("repetir una importación publicada es un no-op y los cambios quedan rechazados", async () => {
    const actor = await adminActor();
    const collectionInput = { slug: "publicada", title: "Prueba", description: "Fotos sintéticas" };
    const collection = await upsertGalleryCollectionAs(actor, collectionInput);
    const albumInput = {
      collectionId: collection.id,
      slug: "momentos",
      title: "Momentos",
      caption: "Prueba",
      sortOrder: 0,
    };
    const album = await upsertGalleryAlbumAs(actor, albumInput);
    const prepared = await preparedPhoto("publicada");
    const photoInput = {
      ...prepared,
      collectionId: collection.id,
      albums: [{ slug: "momentos", sortOrder: 0 }],
    };
    const photo = await registerGalleryPhotoAs(actor, photoInput);
    const selection = {
      collectionId: collection.id,
      heroSourceHash: prepared.sourceHash,
      albumCovers: { momentos: prepared.sourceHash },
      featuredSourceHashes: [prepared.sourceHash],
    };
    const publication = {
      collectionId: collection.id,
      expectedAlbumCounts: { momentos: 1 },
      expectedPhotoCount: 1,
      expectedFeaturedCount: 1,
    };
    await configureGalleryCollectionAs(actor, selection);
    await publishGalleryCollectionAs(actor, publication);
    const auditCount = (await getDb().select({ n: count() }).from(auditLog))[0]?.n;
    expect(await upsertGalleryCollectionAs(actor, collectionInput)).toEqual(collection);
    expect(await upsertGalleryAlbumAs(actor, albumInput)).toEqual(album);
    expect(await registerGalleryPhotoAs(actor, photoInput)).toEqual({
      id: photo.id,
      created: false,
    });
    await configureGalleryCollectionAs(actor, selection);
    await publishGalleryCollectionAs(actor, publication);
    expect((await getDb().select({ n: count() }).from(auditLog))[0]?.n).toBe(auditCount);

    await expect(
      upsertGalleryCollectionAs(actor, { ...collectionInput, title: "Otro título" }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      upsertGalleryAlbumAs(actor, { ...albumInput, sortOrder: 1 }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      upsertGalleryAlbumAs(actor, { ...albumInput, slug: "nuevo" }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      registerGalleryPhotoAs(actor, {
        ...photoInput,
        albums: [{ slug: "momentos", sortOrder: 1 }],
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      registerGalleryPhotoAs(actor, { ...photoInput, alt: "Otro texto" }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      configureGalleryCollectionAs(actor, { ...selection, featuredSourceHashes: [] }),
    ).rejects.toBeInstanceOf(DomainError);

    // Un hash nuevo no exige subirlo para saber que ya no puede entrar a una colección publicada.
    const newHash = createHash("sha256").update(randomUUID()).digest("hex");
    await expect(
      registerGalleryPhotoAs(actor, {
        ...photoInput,
        sourceHash: newHash,
        variants: {
          w300: { ...prepared.variants.w300, key: `fotos/publicada/${newHash}/w300.webp` },
        },
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await findGalleryPhotoForImportAs(actor, newHash)).toBeNull();
    const view = await getGalleryAlbum("publicada", "momentos");
    expect(view?.photos.map((item) => item.id)).toEqual([photo.id]);
    expect(view?.photoCount).toBe(1);
    expect((await getDb().select({ n: count() }).from(galleryPhoto))[0]?.n).toBe(1);
  });

  it("no cambia la portada ni la selección de una colección publicada", async () => {
    const fixture = await seedSyntheticGallery({ photoCount: 2 });
    keys.push(...fixture.keys);
    const actor = await adminActor();
    const rows = await getDb().select().from(galleryPhoto);
    const first = rows.find((row) => row.id === fixture.photoIds[0]);
    const second = rows.find((row) => row.id === fixture.photoIds[1]);
    if (!first || !second) throw new Error("fixture no creado");
    const selection = {
      collectionId: fixture.collectionId,
      heroSourceHash: first.sourceHash,
      albumCovers: { momentos: first.sourceHash },
      featuredSourceHashes: [first.sourceHash],
    };
    await expect(
      configureGalleryCollectionAs(actor, { ...selection, heroSourceHash: second.sourceHash }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      configureGalleryCollectionAs(actor, {
        ...selection,
        albumCovers: { momentos: second.sourceHash },
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      configureGalleryCollectionAs(actor, {
        ...selection,
        featuredSourceHashes: [second.sourceHash],
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect((await getGalleryCollection("galeria-prueba"))?.hero?.id).toBe(first.id);
  });

  it("pagina en orden estable y retirar el álbum o colección corta metadata y bytes", async () => {
    const fixture = await seedSyntheticGallery({ photoCount: 5 });
    keys.push(...fixture.keys);
    const first = await getGalleryAlbum("galeria-prueba", "momentos", { page: 1, pageSize: 2 });
    const second = await getGalleryAlbum("galeria-prueba", "momentos", { page: 2, pageSize: 2 });
    expect(first?.photos.map((photo) => photo.id)).toEqual(fixture.photoIds.slice(0, 2));
    expect(second?.photos.map((photo) => photo.id)).toEqual(fixture.photoIds.slice(2, 4));
    expect(second).toMatchObject({ photoCount: 5, totalPages: 3, page: 2 });
    expect(JSON.stringify(second)).not.toContain("sourceHash");
    await getDb()
      .update(galleryAlbum)
      .set({ status: "DRAFT" })
      .where(eq(galleryAlbum.id, fixture.albumId));
    expect(await getGalleryAlbum("galeria-prueba", "momentos")).toBeNull();
    expect(await openGalleryPhoto(fixture.photoIds[0] ?? "", 480)).toBeNull();
    expect(await getGalleryCollection("galeria-prueba")).toMatchObject({
      albums: [],
      hero: null,
      featured: [],
    });
    await getDb()
      .update(galleryAlbum)
      .set({ status: "PUBLISHED" })
      .where(eq(galleryAlbum.id, fixture.albumId));
    await getDb()
      .update(galleryCollection)
      .set({ status: "DRAFT" })
      .where(eq(galleryCollection.id, fixture.collectionId));
    expect(await getGalleryCollection("galeria-prueba")).toBeNull();
    expect(await getGalleryAlbum("galeria-prueba", "momentos")).toBeNull();
    expect(await openGalleryPhoto(fixture.photoIds[0] ?? "", null)).toBeNull();
  });
});
