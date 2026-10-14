import { readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { z } from "zod";
import { closeDb } from "@/db/client";
import { getEnv } from "@/env";
import {
  configureGalleryCollectionAs,
  findGalleryPhotoForImportAs,
  getGalleryAlbum,
  getGalleryCollection,
  publishGalleryCollectionAs,
  registerGalleryPhotoAs,
  upsertGalleryAlbumAs,
  upsertGalleryCollectionAs,
} from "@/modules/content";
import { listPermissionsFor } from "@/modules/identity";
import { getMembershipRef, getPersonRecord } from "@/modules/people";
import { headObject, putObject } from "@/shared/adapters/storage";
import {
  GALLERY_PREPARATION_VERSION,
  GalleryImportError,
  galleryObjectKey,
  galleryVariantWidths,
  groupGallerySources,
  isExcludedGalleryDirectory,
  isGalleryPhotoPath,
  type Preparation,
  type PreparedPhoto,
  planGalleryAlbums,
  preparationSchema,
  type SourceEntry,
  safeRelativePath,
  sourceIndexSchema,
} from "./gallery-import-model";
import {
  galleryHash,
  optionalGalleryJson,
  readGalleryJson,
  readPreparedGalleryPhoto,
  writeGalleryJson,
} from "./gallery-import-prepare";

export interface ImportGalleryOptions {
  output: string;
  actorId: string;
  targetOrigin: string;
  publish: boolean;
  concurrency: number;
  verifyOnly?: boolean;
}

const progressSchema = z.object({
  version: z.literal(GALLERY_PREPARATION_VERSION),
  targetHash: z.string().regex(/^[a-f0-9]{64}$/),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  collectionId: z.string(),
  registered: z.record(z.string(), z.string()),
  configured: z.boolean(),
  published: z.boolean(),
  updatedAt: z.string(),
});
type ImportProgress = z.infer<typeof progressSchema>;
type ImportActor = Awaited<ReturnType<typeof requireImportActor>>;
type RemoteVariants = Parameters<typeof registerGalleryPhotoAs>[1]["variants"];
type ExistingPhoto = Awaited<ReturnType<typeof findGalleryPhotoForImportAs>>;
const remoteVariantsSchema = z.record(
  z.string(),
  z.object({
    key: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    byteSize: z.number().int().positive(),
    contentType: z.literal("image/webp"),
  }),
);

/** No se imprime ni se guarda ninguna credencial del destino en el checkpoint. */
export function galleryTargetHash(
  targetOrigin: string,
  environment: { APP_URL: string; DATABASE_URL: string; S3_ENDPOINT: string; S3_BUCKET: string },
): string {
  let origin: URL;
  try {
    origin = new URL(targetOrigin);
  } catch {
    throw new GalleryImportError("El destino debe ser un origen web explícito");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.origin !== targetOrigin ||
    new URL(environment.APP_URL).origin !== targetOrigin
  ) {
    throw new GalleryImportError("El origen elegido no coincide con APP_URL del entorno cargado");
  }
  return galleryHash(
    Buffer.from(
      JSON.stringify([
        targetOrigin,
        environment.DATABASE_URL,
        environment.S3_ENDPOINT,
        environment.S3_BUCKET,
      ]),
    ),
  );
}

/** El plan completo debe concordar con el inventario, también después de una reanudación. */
export function validateGalleryImportPlan(plan: Preparation, entries: SourceEntry[]): void {
  const groups = groupGallerySources(entries);
  if (
    !plan.complete ||
    plan.preparedCount !== plan.uniqueCount ||
    plan.sourceCount !== entries.length ||
    plan.uniqueCount !== groups.size ||
    (plan.expectedSourceCount !== undefined && plan.expectedSourceCount !== entries.length) ||
    (plan.expectedUniqueCount !== undefined && plan.expectedUniqueCount !== groups.size) ||
    new Set(entries.map((entry) => entry.relativePath)).size !== entries.length
  ) {
    throw new GalleryImportError(
      "El manifiesto no acredita una preparación completa del inventario",
    );
  }
  for (const entry of entries) {
    const path = safeRelativePath(entry.relativePath);
    if (
      path !== entry.relativePath ||
      !isGalleryPhotoPath(path) ||
      path.split("/").some((part) => part.startsWith(".") || isExcludedGalleryDirectory(part))
    ) {
      throw new GalleryImportError("El inventario contiene una ruta excluida o insegura");
    }
  }
  const expectedAlbums = planGalleryAlbums(entries);
  if (
    new Set(plan.albums.map((album) => album.slug)).size !== plan.albums.length ||
    plan.albums.length !== expectedAlbums.length ||
    !groups.has(plan.heroSourceHash) ||
    plan.featuredSourceHashes.length > 96 ||
    new Set(plan.featuredSourceHashes).size !== plan.featuredSourceHashes.length ||
    plan.featuredSourceHashes.some((hash) => !groups.has(hash))
  ) {
    throw new GalleryImportError("Los álbumes o la selección no coinciden con el inventario");
  }
  for (const album of plan.albums) {
    const expected = expectedAlbums.find((item) => item.slug === album.slug);
    const hashes = new Set(album.sourceHashes);
    if (
      !expected ||
      hashes.size !== album.sourceHashes.length ||
      hashes.size !== expected.sourceHashes.length ||
      expected.sourceHashes.some((hash) => !hashes.has(hash)) ||
      !hashes.has(album.coverSourceHash)
    ) {
      throw new GalleryImportError("Una pertenencia o portada no coincide con su álbum");
    }
  }
}

async function requireImportActor(personId: string) {
  const [person, membership, permissions] = await Promise.all([
    getPersonRecord(personId),
    getMembershipRef(personId),
    listPermissionsFor(personId),
  ]);
  if (
    !person ||
    person.anonymizedAt !== null ||
    !membership ||
    !["ACTIVE", "HONORARY"].includes(membership.status) ||
    !permissions.some(
      (permission) => permission.code === "ADMIN" && permission.committeeId === null,
    )
  ) {
    throw new GalleryImportError("La carga requiere una persona vigente con permiso ADMIN");
  }
  return { personId, ip: null, isAdmin: true, membershipStatus: membership.status };
}

export async function validatePreparedGalleryPhoto(
  output: string,
  entry: SourceEntry,
  collectionSlug: string,
): Promise<PreparedPhoto> {
  output = await realpath(output);
  const photo = await readPreparedGalleryPhoto(output, entry.sourceHash);
  const folder = resolve(output, "photos", entry.sourceHash);
  const widths = new Set(galleryVariantWidths(photo.width));
  if (
    photo.sourceByteSize !== entry.byteSize ||
    photo.variants.length !== widths.size ||
    new Set(photo.variants.map((variant) => variant.width)).size !== widths.size
  ) {
    throw new GalleryImportError("Las variantes no cubren todas las resoluciones del original");
  }
  for (const variant of photo.variants) {
    const path = await realpath(resolve(output, variant.path));
    if (!path.startsWith(`${folder}${sep}`)) {
      throw new GalleryImportError("Una variante resuelve fuera de su carpeta privada");
    }
    const metadata = await sharp(await readFile(path), {
      failOn: "warning",
      limitInputPixels: 80_000_000,
    }).metadata();
    if (
      !widths.has(variant.width) ||
      variant.key !== galleryObjectKey(collectionSlug, entry.sourceHash, variant.width) ||
      variant.byteSize > 20 * 1024 * 1024 ||
      metadata.format !== "webp" ||
      metadata.width !== variant.width ||
      metadata.height !== variant.height ||
      Math.abs(variant.height - Math.round((photo.height * variant.width) / photo.width)) > 1 ||
      metadata.exif ||
      metadata.xmp ||
      metadata.iptc ||
      (metadata.orientation !== undefined && metadata.orientation !== 1)
    ) {
      throw new GalleryImportError(
        "Una copia no es WebP saneada o no coincide con sus dimensiones",
      );
    }
  }
  return photo;
}

async function lockImport(path: string): Promise<void> {
  try {
    await writeFile(path, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    const pid = Number(await readFile(path, "utf8"));
    if (!Number.isSafeInteger(pid) || pid < 1)
      throw new GalleryImportError("El bloqueo de importación no es válido");
    try {
      process.kill(pid, 0);
    } catch (failure) {
      if (!(failure instanceof Error && "code" in failure && failure.code === "ESRCH"))
        throw failure;
      await rm(path);
      await writeFile(path, String(process.pid), { flag: "wx", mode: 0o600 });
      return;
    }
    throw new GalleryImportError("Hay otra carga activa para este destino");
  }
}

/** Detiene nuevas fotos tras el primer fallo y espera las escrituras que ya empezaron. */
async function importBatch<T>(
  items: readonly T[],
  concurrency: number,
  action: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  let failure: unknown;
  let failed = false;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (!failed) {
        const item = items[cursor++];
        if (item === undefined) return;
        try {
          await action(item);
        } catch (error) {
          failed = true;
          failure ??= error;
        }
      }
    }),
  );
  if (failed) throw failure;
}

function remoteVariantsFor(photo: PreparedPhoto, existing: ExistingPhoto): RemoteVariants {
  const localVariants = Object.fromEntries(
    photo.variants.map(({ path: _path, sha256: _hash, ...variant }) => [
      `w${variant.width}`,
      variant,
    ]),
  );
  const parsed = remoteVariantsSchema.safeParse(existing?.variants ?? localVariants);
  if (!parsed.success) {
    throw new GalleryImportError("Las variantes remotas no cumplen el contrato de WebP privadas");
  }
  const variants: RemoteVariants = parsed.data;
  if (
    (existing && (existing.width !== photo.width || existing.height !== photo.height)) ||
    Object.keys(variants).length !== photo.variants.length
  ) {
    throw new GalleryImportError("La foto remota tiene dimensiones o resoluciones incompatibles");
  }
  for (const [name, variant] of Object.entries(variants)) {
    const local = photo.variants.find((item) => name === `w${item.width}`);
    if (
      !local ||
      local.width !== variant.width ||
      local.height !== variant.height ||
      local.byteSize !== variant.byteSize ||
      variant.contentType !== "image/webp" ||
      !new RegExp(`^fotos/[a-z0-9-]+/${photo.sourceHash}/w${local.width}\\.webp$`).test(variant.key)
    ) {
      throw new GalleryImportError(
        "Las variantes remotas no concuerdan con las copias verificadas",
      );
    }
  }
  return variants;
}

async function importPhoto(
  actor: ImportActor,
  output: string,
  collectionId: string,
  photo: PreparedPhoto,
  albums: { slug: string; title: string; sortOrder: number }[],
  collectionTitle: string,
): Promise<string> {
  const existing = await findGalleryPhotoForImportAs(actor, photo.sourceHash);
  const variants = remoteVariantsFor(photo, existing);
  for (const variant of Object.values(variants)) {
    const local = photo.variants.find((item) => item.width === variant.width);
    if (!local) throw new GalleryImportError("Falta una variante local verificada");
    const stored = existing ? await headObject(variant.key) : null;
    if (!stored || stored.contentType !== "image/webp" || stored.byteSize !== local.byteSize) {
      const bytes = await readFile(resolve(output, local.path));
      if (bytes.length !== local.byteSize || galleryHash(bytes) !== local.sha256) {
        throw new GalleryImportError("Una copia preparada cambió antes de subirla");
      }
      await putObject(variant.key, bytes, "image/webp");
      const confirmed = await headObject(variant.key);
      if (
        !confirmed ||
        confirmed.contentType !== "image/webp" ||
        confirmed.byteSize !== bytes.length
      ) {
        throw new GalleryImportError("El bucket no confirmó la variante subida");
      }
    }
  }
  const primary = albums[0];
  if (!primary) throw new GalleryImportError("Una foto no pertenece a ningún álbum");
  const saved = await registerGalleryPhotoAs(actor, {
    collectionId,
    sourceHash: photo.sourceHash,
    width: photo.width,
    height: photo.height,
    alt: `${collectionTitle} · ${primary.title} · ${primary.sortOrder + 1}`,
    variants,
    albums: albums.map(({ slug, sortOrder }) => ({ slug, sortOrder })),
  });
  return saved.id;
}

async function verifyGallery(
  options: ImportGalleryOptions,
  plan: Preparation,
  photos: Map<string, PreparedPhoto>,
): Promise<void> {
  const ids = new Map<string, string>();
  const ordered = [...photos.values()];
  for (let offset = 0; offset < ordered.length; offset += 25) {
    const actor = await requireImportActor(options.actorId);
    await importBatch(ordered.slice(offset, offset + 25), options.concurrency, async (photo) => {
      const existing = await findGalleryPhotoForImportAs(actor, photo.sourceHash);
      if (!existing)
        throw new GalleryImportError("Una foto del inventario no está registrada en destino");
      const variants = remoteVariantsFor(photo, existing);
      for (const variant of Object.values(variants)) {
        const object = await headObject(variant.key);
        if (
          !object ||
          object.contentType !== "image/webp" ||
          object.byteSize !== variant.byteSize
        ) {
          throw new GalleryImportError(
            "Una variante remota está ausente o no coincide con el inventario",
          );
        }
      }
      ids.set(photo.sourceHash, existing.id);
    });
    process.stdout.write(
      `Fotos comprobadas sin escritura: ${Math.min(offset + 25, ordered.length)}/${ordered.length}.\n`,
    );
  }
  await requireImportActor(options.actorId);
  const collection = await getGalleryCollection(plan.collection.slug);
  if (
    !collection ||
    collection.title !== plan.collection.title ||
    collection.description !== plan.collection.description ||
    collection.hero?.id !== ids.get(plan.heroSourceHash) ||
    collection.albums.length !== plan.albums.length ||
    JSON.stringify(collection.featured.map((photo) => photo.id)) !==
      JSON.stringify(plan.featuredSourceHashes.map((hash) => ids.get(hash)))
  ) {
    throw new GalleryImportError(
      "La colección publicada o su selección no coincide con el manifiesto",
    );
  }
  for (const expected of plan.albums) {
    const album = collection.albums.find((item) => item.slug === expected.slug);
    if (
      !album ||
      album.title !== expected.title ||
      album.caption !== expected.caption ||
      album.cover?.id !== ids.get(expected.coverSourceHash) ||
      album.photoCount !== expected.sourceHashes.length
    ) {
      throw new GalleryImportError("Un álbum publicado no coincide con el inventario");
    }
    const totalPages = Math.ceil(expected.sourceHashes.length / 96);
    for (let page = 1; page <= totalPages; page++) {
      await requireImportActor(options.actorId);
      const view = await getGalleryAlbum(plan.collection.slug, expected.slug, {
        page,
        pageSize: 96,
      });
      const expectedIds = expected.sourceHashes
        .slice((page - 1) * 96, page * 96)
        .map((hash) => ids.get(hash));
      if (
        !view ||
        view.page !== page ||
        view.pageSize !== 96 ||
        view.totalPages !== totalPages ||
        view.photoCount !== expected.sourceHashes.length ||
        JSON.stringify(view.photos.map((photo) => photo.id)) !== JSON.stringify(expectedIds)
      ) {
        throw new GalleryImportError(
          "La paginación o las pertenencias de un álbum no coinciden con el plan",
        );
      }
    }
  }
  process.stdout.write(
    `Verificación completa: ${plan.uniqueCount} fotos y ${plan.albums.length} álbumes publicados; no se modificó la base ni el bucket.\n`,
  );
}

export async function importGallery(options: ImportGalleryOptions): Promise<void> {
  if (
    !Number.isSafeInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 4
  )
    throw new GalleryImportError("La carga admite entre una y cuatro fotos concurrentes");
  const output = await realpath(resolve(options.output));
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (output === repoRoot || output.startsWith(`${repoRoot}${sep}`)) {
    throw new GalleryImportError("Los checkpoints privados deben quedar fuera del repositorio");
  }
  const targetHash = galleryTargetHash(options.targetOrigin, getEnv());
  const lockPath = join(output, `import-${targetHash}.lock`);
  await lockImport(lockPath);
  try {
    const plan = await readGalleryJson(join(output, "manifest.json"), preparationSchema);
    const index = await readGalleryJson(join(output, "source-index.json"), sourceIndexSchema);
    if (!index.complete || index.sourceRoot !== plan.sourceRoot)
      throw new GalleryImportError(
        "El índice del origen no está completo o pertenece a otra carpeta",
      );
    validateGalleryImportPlan(plan, index.entries);
    const planHash = galleryHash(Buffer.from(JSON.stringify(plan)));
    const progressPath = join(output, `import-${targetHash}.json`);
    const previous = await optionalGalleryJson(progressPath, progressSchema);
    if (previous && (previous.targetHash !== targetHash || previous.planHash !== planHash)) {
      throw new GalleryImportError("El checkpoint remoto pertenece a otro destino o plan");
    }
    const photos = new Map<string, PreparedPhoto>();
    const groups = groupGallerySources(index.entries);
    process.stdout.write(`Verificación de copias locales: ${groups.size} fotos únicas.\n`);
    for (const [hash, copies] of groups) {
      const source = copies[0];
      if (!source) throw new GalleryImportError("Una foto del inventario no tiene origen");
      photos.set(hash, await validatePreparedGalleryPhoto(output, source, plan.collection.slug));
      if (photos.size % 250 === 0)
        process.stdout.write(`Copias verificadas: ${photos.size}/${groups.size}.\n`);
    }
    if (options.verifyOnly) {
      await verifyGallery(options, plan, photos);
      return;
    }
    // El ADMIN y la membresía se reconsultan al abrir cada lote de como máximo 25 fotos.
    let actor = await requireImportActor(options.actorId);
    const collection = await upsertGalleryCollectionAs(actor, plan.collection);
    for (const album of plan.albums) {
      await upsertGalleryAlbumAs(actor, {
        collectionId: collection.id,
        slug: album.slug,
        title: album.title,
        caption: album.caption,
        sortOrder: album.sortOrder,
      });
    }
    const progress: ImportProgress = previous ?? {
      version: GALLERY_PREPARATION_VERSION,
      targetHash,
      planHash,
      collectionId: collection.id,
      registered: {},
      configured: false,
      published: false,
      updatedAt: new Date().toISOString(),
    };
    // El JSON no salta fotos: la base y HEAD se reconsultan incluso si el proceso anterior terminó.
    progress.collectionId = collection.id;
    progress.configured = false;
    progress.published = false;
    let writes = Promise.resolve();
    const saveProgress = () => {
      writes = writes.then(() => writeGalleryJson(progressPath, progress));
      return writes;
    };
    await saveProgress();
    const memberships = new Map<string, { slug: string; title: string; sortOrder: number }[]>();
    for (const album of plan.albums) {
      for (const [sortOrder, hash] of album.sourceHashes.entries()) {
        const entries = memberships.get(hash) ?? [];
        entries.push({ slug: album.slug, title: album.title, sortOrder });
        memberships.set(hash, entries);
      }
    }
    const ordered = [...photos.values()];
    for (let offset = 0; offset < ordered.length; offset += 25) {
      actor = await requireImportActor(options.actorId);
      await importBatch(ordered.slice(offset, offset + 25), options.concurrency, async (photo) => {
        const id = await importPhoto(
          actor,
          output,
          collection.id,
          photo,
          memberships.get(photo.sourceHash) ?? [],
          plan.collection.title,
        );
        // Solo la confirmación de la transacción de registro acredita progreso remoto.
        progress.registered[photo.sourceHash] = id;
        progress.updatedAt = new Date().toISOString();
        await saveProgress();
      });
      process.stdout.write(
        `Fotos verificadas en destino: ${Math.min(offset + 25, ordered.length)}/${ordered.length}.\n`,
      );
    }
    actor = await requireImportActor(options.actorId);
    await configureGalleryCollectionAs(actor, {
      collectionId: collection.id,
      heroSourceHash: plan.heroSourceHash,
      albumCovers: Object.fromEntries(
        plan.albums.map((album) => [album.slug, album.coverSourceHash]),
      ),
      featuredSourceHashes: plan.featuredSourceHashes,
    });
    progress.configured = true;
    progress.updatedAt = new Date().toISOString();
    await saveProgress();
    if (options.publish) {
      actor = await requireImportActor(options.actorId);
      await publishGalleryCollectionAs(actor, {
        collectionId: collection.id,
        expectedAlbumCounts: Object.fromEntries(
          plan.albums.map((album) => [album.slug, album.sourceHashes.length]),
        ),
        expectedPhotoCount: plan.uniqueCount,
        expectedFeaturedCount: plan.featuredSourceHashes.length,
      });
      progress.published = true;
      progress.updatedAt = new Date().toISOString();
      await saveProgress();
    }
    process.stdout.write(
      `Carga completa: ${plan.uniqueCount} fotos únicas en ${plan.albums.length} álbumes; colección ${options.publish ? "publicada para integrantes" : "en borrador privado"}.\n`,
    );
  } finally {
    await rm(lockPath, { force: true });
    await closeDb();
  }
}
