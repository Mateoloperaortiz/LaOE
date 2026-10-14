import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  albumForSource,
  galleryObjectKey,
  galleryVariantWidths,
  groupGallerySources,
  isExcludedGalleryDirectory,
  isGalleryPhotoPath,
  type Preparation,
  planGalleryAlbums,
  type SourceEntry,
} from "../../scripts/gallery-import-model";
import {
  galleryHash,
  prepareGallery,
  readPreparedGalleryPhoto,
  writeGalleryJson,
} from "../../scripts/gallery-import-prepare";
import {
  galleryTargetHash,
  importGallery,
  validateGalleryImportPlan,
  validatePreparedGalleryPhoto,
} from "../../scripts/gallery-import-remote";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  person: vi.fn(),
  membership: vi.fn(),
  permissions: vi.fn(),
  collection: vi.fn(),
  album: vi.fn(),
  find: vi.fn(),
  register: vi.fn(),
  configure: vi.fn(),
  publish: vi.fn(),
  collectionView: vi.fn(),
  albumView: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
}));
const environment = {
  APP_URL: "https://synthetic.invalid",
  DATABASE_URL: "postgresql://synthetic@localhost/synthetic",
  S3_ENDPOINT: "https://bucket.synthetic.invalid",
  S3_BUCKET: "synthetic",
};
vi.mock("@/db/client", () => ({ closeDb: mocks.close }));
vi.mock("@/env", () => ({ getEnv: () => environment }));
vi.mock("@/modules/identity", () => ({ listPermissionsFor: mocks.permissions }));
vi.mock("@/modules/people", () => ({
  getMembershipRef: mocks.membership,
  getPersonRecord: mocks.person,
}));
vi.mock("@/modules/content", () => ({
  upsertGalleryCollectionAs: mocks.collection,
  upsertGalleryAlbumAs: mocks.album,
  findGalleryPhotoForImportAs: mocks.find,
  registerGalleryPhotoAs: mocks.register,
  configureGalleryCollectionAs: mocks.configure,
  publishGalleryCollectionAs: mocks.publish,
  getGalleryCollection: mocks.collectionView,
  getGalleryAlbum: mocks.albumView,
}));
vi.mock("@/shared/adapters/storage", () => ({ headObject: mocks.head, putObject: mocks.put }));

let directory: string;
let objects: Map<string, { contentType: string; byteSize: number }>;
type SavedPhoto = {
  id: string;
  collectionId: string;
  alt: string;
  albums: { slug: string; sortOrder: number }[];
  width: number;
  height: number;
  variants: Record<
    string,
    { key: string; width: number; height: number; byteSize: number; contentType: string }
  >;
};
let saved: Map<string, SavedPhoto>;
beforeEach(async () => {
  vi.resetAllMocks();
  directory = await mkdtemp(join(tmpdir(), "private-gallery-import-"));
  objects = new Map();
  saved = new Map();
  mocks.person.mockResolvedValue({ anonymizedAt: null });
  mocks.membership.mockResolvedValue({ status: "ACTIVE" });
  mocks.permissions.mockResolvedValue([{ code: "ADMIN", committeeId: null }]);
  mocks.collection.mockResolvedValue({ id: "syntheticcollection" });
  mocks.album.mockResolvedValue({ id: "syntheticalbum" });
  mocks.find.mockImplementation(async (_actor: unknown, hash: string, collectionId?: string) => {
    const row = saved.get(hash);
    return row
      ? {
          ...row,
          albums:
            collectionId === undefined
              ? null
              : collectionId === row.collectionId
                ? structuredClone(row.albums)
                : [],
        }
      : null;
  });
  mocks.put.mockImplementation(async (key: string, bytes: Uint8Array, contentType: string) => {
    objects.set(key, { contentType, byteSize: bytes.length });
  });
  mocks.head.mockImplementation(async (key: string) => objects.get(key) ?? null);
  mocks.register.mockImplementation(
    async (_actor: unknown, photo: SavedPhoto & { sourceHash: string }) => {
      const id = saved.get(photo.sourceHash)?.id ?? `syntheticphoto${saved.size}`;
      saved.set(photo.sourceHash, {
        id,
        collectionId: photo.collectionId,
        alt: photo.alt,
        albums: structuredClone(photo.albums),
        width: photo.width,
        height: photo.height,
        variants: photo.variants,
      });
      return { id, created: true };
    },
  );
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function fixture(count = 1): Promise<{ plan: Preparation; entries: SourceEntry[] }> {
  const entries: SourceEntry[] = [];
  for (let index = 0; index < count; index++) {
    const source = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: { r: index % 256, g: 30 + Math.floor(index / 256), b: 90 },
      },
    })
      .png()
      .toBuffer();
    const hash = galleryHash(source);
    const webp = await sharp(source).webp().toBuffer();
    const folder = join(directory, "photos", hash);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "w24.webp"), webp);
    await writeGalleryJson(join(folder, "prepared.json"), {
      version: 1,
      sourceHash: hash,
      sourceByteSize: source.length,
      width: 24,
      height: 16,
      variants: [
        {
          path: `photos/${hash}/w24.webp`,
          key: galleryObjectKey("synthetic", hash, 24),
          width: 24,
          height: 16,
          byteSize: webp.length,
          sha256: galleryHash(webp),
          contentType: "image/webp",
        },
      ],
    });
    entries.push({
      relativePath: `Feria/photo-${index}.png`,
      sourceHash: hash,
      byteSize: source.length,
      mtimeMs: 0,
      ctimeMs: 0,
    });
  }
  const hero = entries[0];
  if (!hero) throw new Error("synthetic fixture missing hero");
  const plan: Preparation = {
    version: 1,
    sourceRoot: join(directory, "source"),
    collection: {
      slug: "synthetic",
      title: "Colección sintética",
      description: "Prueba sin personas reales",
    },
    sourceCount: entries.length,
    uniqueCount: entries.length,
    expectedSourceCount: entries.length,
    expectedUniqueCount: entries.length,
    preparedCount: entries.length,
    complete: true,
    heroSourceHash: hero.sourceHash,
    featuredSourceHashes: [hero.sourceHash],
    albums: planGalleryAlbums(entries),
  };
  await writeGalleryJson(join(directory, "manifest.json"), plan);
  await writeGalleryJson(join(directory, "source-index.json"), {
    version: 1,
    sourceRoot: plan.sourceRoot,
    complete: true,
    entries,
  });
  return { plan, entries };
}

const options = () => ({
  output: directory,
  actorId: "syntheticadmin",
  targetOrigin: environment.APP_URL,
  publish: true,
  concurrency: 2,
});
const progressPath = () =>
  join(directory, `import-${galleryTargetHash(environment.APP_URL, environment)}.json`);

describe("inventario de Fotos", () => {
  it("omite jugadores y videos, reúne cámaras y mantiene selecciones sin duplicar bytes", () => {
    expect(isExcludedGalleryDirectory("Fotos jugadores azules")).toBe(true);
    expect(isGalleryPhotoPath("photo.MOV")).toBe(false);
    expect(isGalleryPhotoPath("photo.HEIC")).toBe(true);
    expect(albumForSource("Días - Viernes/Cámara 3/photo.JPG").slug).toBe("viernes");
    const first: SourceEntry = {
      relativePath: "Carnival/one.jpg",
      byteSize: 12,
      sourceHash: "a".repeat(64),
      mtimeMs: 0,
      ctimeMs: 0,
    };
    const second = { ...first, relativePath: "OE Jueves/copy.jpg" };
    expect(groupGallerySources([first, second]).size).toBe(1);
    expect(planGalleryAlbums([first, second]).map((album) => album.slug)).toEqual([
      "carnival",
      "la-oe-en-dias",
    ]);
    expect(galleryVariantWidths(700)).toEqual([480, 700]);
  });

  it("rechaza planes parciales, rutas excluidas y pertenencias incompletas", async () => {
    const { plan, entries } = await fixture();
    expect(() => validateGalleryImportPlan({ ...plan, complete: false }, entries)).toThrow(
      "completa",
    );
    const entry = entries[0];
    if (!entry) throw new Error("missing synthetic entry");
    expect(() =>
      validateGalleryImportPlan(plan, [{ ...entry, relativePath: "Jugadores/photo.png" }]),
    ).toThrow("excluida");
    const album = plan.albums[0];
    if (!album) throw new Error("missing synthetic album");
    expect(() =>
      validateGalleryImportPlan({ ...plan, albums: [{ ...album, sourceHashes: [] }] }, entries),
    ).toThrow("pertenencia");
  });

  it("valida origen explícito y separa checkpoints al cambiar base o bucket", () => {
    expect(() => galleryTargetHash("https://other.invalid", environment)).toThrow("APP_URL");
    expect(() => galleryTargetHash(`${environment.APP_URL}/`, environment)).toThrow("origen");
    expect(galleryTargetHash(environment.APP_URL, environment)).not.toBe(
      galleryTargetHash(environment.APP_URL, { ...environment, S3_BUCKET: "other" }),
    );
    expect(galleryTargetHash(environment.APP_URL, environment)).not.toBe(
      galleryTargetHash(environment.APP_URL, {
        ...environment,
        DATABASE_URL: "postgresql://synthetic@localhost/other",
      }),
    );
  });

  it("detecta bytes alterados y enlaces externos antes de escribir", async () => {
    const { entries } = await fixture();
    const entry = entries[0];
    if (!entry) throw new Error("missing synthetic entry");
    const file = join(directory, "photos", entry.sourceHash, "w24.webp");
    await writeFile(file, "changed");
    await expect(validatePreparedGalleryPhoto(directory, entry, "synthetic")).rejects.toThrow(
      "SHA256",
    );
    const fresh = await fixture();
    const clean = fresh.entries[0];
    if (!clean) throw new Error("missing synthetic entry");
    const outside = join(directory, "outside.webp");
    await writeFile(outside, await readFile(file));
    await rm(file);
    await symlink(outside, file);
    await expect(validatePreparedGalleryPhoto(directory, clean, "synthetic")).rejects.toThrow(
      "fuera",
    );
  });

  it("rechaza EXIF aunque tamaño y hash del manifiesto coincidan", async () => {
    const { entries } = await fixture();
    const entry = entries[0];
    if (!entry) throw new Error("missing synthetic entry");
    const folder = join(directory, "photos", entry.sourceHash);
    const file = join(folder, "w24.webp");
    const bytes = await sharp(await readFile(file))
      .withExif({ IFD0: { Artist: "Synthetic fixture" } })
      .webp()
      .toBuffer();
    await writeFile(file, bytes);
    const prepared = await readPreparedGalleryPhotoBeforeChange();
    await writeGalleryJson(join(folder, "prepared.json"), prepared);
    await expect(validatePreparedGalleryPhoto(directory, entry, "synthetic")).rejects.toThrow(
      "saneada",
    );

    async function readPreparedGalleryPhotoBeforeChange() {
      const prepared = JSON.parse(await readFile(join(folder, "prepared.json"), "utf8"));
      prepared.variants[0].sha256 = galleryHash(bytes);
      prepared.variants[0].byteSize = bytes.length;
      return prepared;
    }
  });

  it("prepara una orientación correcta sin EXIF y omite ocultos, jugadores y videos", async () => {
    const source = join(directory, "source");
    const output = join(directory, "prepared");
    const image = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#123456" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    for (const folder of ["Feria", "Jugadores", ".hidden"]) {
      await mkdir(join(source, folder), { recursive: true });
      await writeFile(join(source, folder, "photo.jpg"), image);
    }
    await writeFile(join(source, "Feria", ".hidden.jpg"), image);
    await writeFile(join(source, "Feria", "video.mov"), "synthetic video");
    await prepareGallery({
      source,
      output,
      collection: { slug: "synthetic", title: "Sintética", description: "Prueba" },
      banner: "Feria/photo.jpg",
      expectedSourceCount: 1,
      expectedUniqueCount: 1,
      concurrency: 1,
    });
    const photo = await readPreparedGalleryPhoto(output, galleryHash(image));
    expect([photo.width, photo.height]).toEqual([20, 40]);
    const variant = photo.variants[0];
    if (!variant) throw new Error("missing synthetic variant");
    const metadata = await sharp(await readFile(join(output, variant.path))).metadata();
    expect(metadata.exif).toBeUndefined();
    expect([metadata.width, metadata.height]).toEqual([20, 40]);
  });
});

describe("carga privada reanudable", () => {
  it("publica solo tras registrar todas las fotos, confirmar objetos y configurar la selección", async () => {
    await fixture(2);
    await importGallery(options());
    expect(saved.size).toBe(2);
    expect(mocks.configure).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: true }),
      expect.objectContaining({
        expectedPhotoCount: 2,
        expectedAlbumCounts: { feria: 2 },
        expectedFeaturedCount: 1,
      }),
    );
    const progress = JSON.parse(await readFile(progressPath(), "utf8"));
    expect(progress.published).toBe(true);
    expect(Object.keys(progress.registered)).toHaveLength(2);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("un fallo DB no acredita una foto y reintentar vuelve a comprobar bucket y registro", async () => {
    await fixture();
    mocks.register.mockRejectedValueOnce(new Error("synthetic transaction failure"));
    await expect(importGallery(options())).rejects.toThrow("transaction");
    expect(JSON.parse(await readFile(progressPath(), "utf8")).registered).toEqual({});
    expect(mocks.publish).not.toHaveBeenCalled();
    await importGallery(options());
    expect(saved.size).toBe(1);
    const puts = mocks.put.mock.calls.length;
    objects.clear();
    await importGallery(options());
    expect(mocks.put.mock.calls.length).toBe(puts + 1);
    expect(mocks.register).toHaveBeenCalledTimes(2);
  });

  it("la reanudación coteja DB y HEAD sin registrar de nuevo fotos completas, aunque el checkpoint diga otra cosa", async () => {
    await fixture(2);
    await importGallery({ ...options(), publish: false });
    const checkpoint = JSON.parse(await readFile(progressPath(), "utf8"));
    checkpoint.registered = {};
    await writeGalleryJson(progressPath(), checkpoint);
    const before = mocks.head.mock.calls.length;
    await importGallery({ ...options(), publish: false });
    expect(mocks.register).toHaveBeenCalledTimes(2);
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(mocks.head.mock.calls.length).toBe(before + 2);
    expect(mocks.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ isAdmin: true }),
      expect.any(String),
      "syntheticcollection",
    );
    expect(Object.keys(JSON.parse(await readFile(progressPath(), "utf8")).registered)).toHaveLength(
      2,
    );
  });

  it.each([
    "faltante",
    "orden incorrecto",
  ])("repara una pertenencia %s y deja intactas las demás fotos", async (failure) => {
    const { entries } = await fixture(2);
    await importGallery({ ...options(), publish: false });
    const hash = entries[0]?.sourceHash;
    const photo = hash ? saved.get(hash) : null;
    if (!photo) throw new Error("missing saved synthetic photo");
    photo.albums = failure === "faltante" ? [] : [{ slug: "feria", sortOrder: 999 }];
    await importGallery({ ...options(), publish: false });
    expect(mocks.register).toHaveBeenCalledTimes(3);
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(saved.get(hash ?? "")?.albums).toEqual([{ slug: "feria", sortOrder: 0 }]);
  });

  it("el checkpoint no omite una foto ausente de la base", async () => {
    await fixture();
    await importGallery({ ...options(), publish: false });
    saved.clear();
    await importGallery({ ...options(), publish: false });
    expect(mocks.register).toHaveBeenCalledTimes(2);
    expect(saved.size).toBe(1);
  });

  it("un objeto que no confirma no se registra ni se publica", async () => {
    await fixture();
    mocks.head.mockResolvedValue(null);
    await expect(importGallery(options())).rejects.toThrow("confirmó");
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("la revocación de ADMIN entre lotes impide fotos nuevas y la publicación", async () => {
    await fixture(26);
    mocks.permissions.mockImplementation(async () =>
      saved.size >= 25 ? [] : [{ code: "ADMIN", committeeId: null }],
    );
    await expect(importGallery(options())).rejects.toThrow("ADMIN");
    expect(saved.size).toBe(25);
    expect(mocks.register).toHaveBeenCalledTimes(25);
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("reconsulta la membresía justo antes de publicar", async () => {
    await fixture();
    mocks.configure.mockImplementation(async () => {
      mocks.membership.mockResolvedValue({ status: "INACTIVE" });
    });
    await expect(importGallery(options())).rejects.toThrow("ADMIN");
    expect(saved.size).toBe(1);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(progressPath(), "utf8")).configured).toBe(true);
    expect(JSON.parse(await readFile(progressPath(), "utf8")).published).toBe(false);
  });

  it("verifica selección y paginación completa sin escrituras y detecta relaciones alteradas", async () => {
    const { plan } = await fixture(98);
    await importGallery(options());
    const album = plan.albums[0];
    if (!album) throw new Error("missing synthetic album");
    const photoView = (hash: string) => {
      const row = saved.get(hash);
      if (!row) throw new Error("missing saved synthetic photo");
      return { id: row.id, width: 24, height: 16, alt: "Sintética", widths: [24] };
    };
    const view = {
      id: "syntheticalbum",
      slug: album.slug,
      title: album.title,
      caption: album.caption,
      cover: photoView(album.coverSourceHash),
      photoCount: album.sourceHashes.length,
    };
    mocks.collectionView.mockResolvedValue({
      id: "syntheticcollection",
      ...plan.collection,
      hero: photoView(plan.heroSourceHash),
      featured: plan.featuredSourceHashes.map(photoView),
      albums: [view],
    });
    mocks.albumView.mockImplementation(
      async (
        _collection: string,
        _album: string,
        pagination: { page: number; pageSize: number },
      ) => ({
        ...view,
        collectionSlug: plan.collection.slug,
        collectionTitle: plan.collection.title,
        ...pagination,
        totalPages: 2,
        photos: album.sourceHashes
          .slice((pagination.page - 1) * 96, pagination.page * 96)
          .map(photoView),
      }),
    );
    const writes = [
      mocks.put,
      mocks.register,
      mocks.collection,
      mocks.album,
      mocks.configure,
      mocks.publish,
    ];
    const counts = writes.map((mock) => mock.mock.calls.length);
    await importGallery({ ...options(), publish: false, verifyOnly: true });
    expect(mocks.albumView).toHaveBeenCalledTimes(2);
    expect(writes.map((mock) => mock.mock.calls.length)).toEqual(counts);
    mocks.albumView.mockResolvedValue({
      ...view,
      page: 1,
      pageSize: 96,
      totalPages: 2,
      photos: [],
    });
    await expect(importGallery({ ...options(), publish: false, verifyOnly: true })).rejects.toThrow(
      "pertenencias",
    );
    expect(writes.map((mock) => mock.mock.calls.length)).toEqual(counts);
  });
});
