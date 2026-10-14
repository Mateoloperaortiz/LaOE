import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp, { type Metadata } from "sharp";
import { z } from "zod";
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
  preparedPhotoSchema,
  type SourceEntry,
  sourceIndexSchema,
} from "./gallery-import-model";

const execute = promisify(execFile);
const MAX_SOURCE_BYTES = 128 * 1024 * 1024;
const IMAGE_OPTIONS = { failOn: "warning", limitInputPixels: 80_000_000 } as const;

export interface PrepareGalleryOptions {
  source: string;
  output: string;
  collection: Preparation["collection"];
  banner: string;
  highlights?: string;
  expectedSourceCount?: number;
  expectedUniqueCount?: number;
  concurrency: number;
  maxPhotos?: number;
}

export function galleryHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function writeGalleryJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function readGalleryJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const info = await stat(path);
  if (!info.isFile() || info.size > 64 * 1024 * 1024) {
    throw new GalleryImportError("Un manifiesto no es regular o supera el límite local");
  }
  const parsed = schema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) throw new GalleryImportError("Un manifiesto local no cumple su contrato");
  return parsed.data;
}

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function optionalGalleryJson<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    return await readGalleryJson(path, schema);
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function galleryConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  action: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = cursor++;
        const item = items[index];
        if (item === undefined) return;
        await action(item, index);
      }
    }),
  );
}

async function scanPaths(root: string, directory = root): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    // No se siguen enlaces: una carpeta excluida no vuelve por otro nombre.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && !isExcludedGalleryDirectory(entry.name)) {
      paths.push(...(await scanPaths(root, path)));
    } else if (entry.isFile() && isGalleryPhotoPath(entry.name)) {
      paths.push(relative(root, path).split(sep).join("/"));
    }
  }
  return paths.sort((a, b) => a.localeCompare(b, "es"));
}

async function hashSource(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}

async function scanSources(sourceRoot: string, output: string): Promise<SourceEntry[]> {
  const indexPath = join(output, "source-index.json");
  const previous = await optionalGalleryJson(indexPath, sourceIndexSchema);
  if (previous && previous.sourceRoot !== sourceRoot) {
    throw new GalleryImportError("El checkpoint pertenece a otra carpeta de origen");
  }
  const cached = new Map(previous?.entries.map((entry) => [entry.relativePath, entry]));
  const paths = await scanPaths(sourceRoot);
  const entries: SourceEntry[] = [];
  process.stdout.write(`Escaneo local: ${paths.length} fotos; se excluyen jugadores y videos.\n`);
  for (const relativePath of paths) {
    const path = join(sourceRoot, relativePath);
    const info = await stat(path);
    if (!info.isFile() || info.size < 1 || info.size > MAX_SOURCE_BYTES) {
      throw new GalleryImportError("Un original no es regular o supera el límite de 128 MiB");
    }
    const entry = cached.get(relativePath);
    const unchanged =
      entry &&
      entry.byteSize === info.size &&
      entry.mtimeMs === info.mtimeMs &&
      entry.ctimeMs === info.ctimeMs;
    const sourceHash = unchanged ? entry.sourceHash : await hashSource(path);
    const after = await stat(path);
    if (
      after.size !== info.size ||
      after.mtimeMs !== info.mtimeMs ||
      after.ctimeMs !== info.ctimeMs
    ) {
      throw new GalleryImportError("Un original cambió durante el escaneo; repetí la preparación");
    }
    entries.push({
      relativePath,
      sourceHash,
      byteSize: info.size,
      mtimeMs: info.mtimeMs,
      ctimeMs: info.ctimeMs,
    });
    if (entries.length % 100 === 0) {
      await writeGalleryJson(indexPath, {
        version: GALLERY_PREPARATION_VERSION,
        sourceRoot,
        complete: false,
        entries,
      });
      process.stdout.write(`SHA256 verificado: ${entries.length}/${paths.length}.\n`);
    }
  }
  await writeGalleryJson(indexPath, {
    version: GALLERY_PREPARATION_VERSION,
    sourceRoot,
    complete: true,
    entries,
  });
  return entries;
}

export async function readPreparedGalleryPhoto(
  output: string,
  hash: string,
): Promise<PreparedPhoto> {
  const photo = await readGalleryJson(
    join(output, "photos", hash, "prepared.json"),
    preparedPhotoSchema,
  );
  if (photo.sourceHash !== hash)
    throw new GalleryImportError("El checkpoint de una foto no coincide con su SHA256");
  for (const variant of photo.variants) {
    const path = resolve(output, variant.path);
    if (!path.startsWith(`${resolve(output, "photos", hash)}${sep}`)) {
      throw new GalleryImportError("Una variante sale de su carpeta privada");
    }
    const bytes = await readFile(path);
    if (bytes.length !== variant.byteSize || galleryHash(bytes) !== variant.sha256) {
      throw new GalleryImportError("Una variante local no coincide con su tamaño o SHA256");
    }
  }
  return photo;
}

async function preparePhoto(
  sourceRoot: string,
  output: string,
  slug: string,
  entry: SourceEntry,
): Promise<void> {
  const folder = join(output, "photos", entry.sourceHash);
  if (await optionalGalleryJson(join(folder, "prepared.json"), preparedPhotoSchema)) {
    const existing = await readPreparedGalleryPhoto(output, entry.sourceHash);
    if (
      existing.variants.some(
        (variant) => variant.key !== galleryObjectKey(slug, entry.sourceHash, variant.width),
      )
    ) {
      throw new GalleryImportError("El checkpoint de las variantes pertenece a otra colección");
    }
    return;
  }
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const bytes = await readFile(join(sourceRoot, entry.relativePath));
  if (bytes.length !== entry.byteSize || galleryHash(bytes) !== entry.sourceHash) {
    throw new GalleryImportError("Un original ya no coincide con el SHA256 del escaneo");
  }
  let input = bytes;
  const decodeFolder = join(folder, "decode");
  try {
    let metadata: Metadata;
    try {
      metadata = await sharp(input, IMAGE_OPTIONS).metadata();
      if (/\.hei[cf]$/i.test(entry.relativePath)) {
        // La cabecera HEIF puede leerse aunque libvips no tenga el códec HEVC.
        await sharp(input, IMAGE_OPTIONS).resize({ width: 1, height: 1 }).png().toBuffer();
      }
    } catch (error) {
      if (!/\.hei[cf]$/i.test(entry.relativePath) || process.platform !== "darwin") throw error;
      await mkdir(decodeFolder, { mode: 0o700 });
      const heicPath = join(decodeFolder, `source${extname(entry.relativePath).toLowerCase()}`);
      const pngPath = join(decodeFolder, "decoded.png");
      await writeFile(heicPath, bytes, { mode: 0o600 });
      await execute("sips", ["-s", "format", "png", heicPath, "--out", pngPath], {
        timeout: 120_000,
        maxBuffer: 64_000,
      });
      input = await readFile(pngPath);
      metadata = await sharp(input, IMAGE_OPTIONS).metadata();
    }
    if (!metadata.width || !metadata.height)
      throw new GalleryImportError("No se pudieron leer las dimensiones de una foto");
    const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    const width = rotated ? metadata.height : metadata.width;
    const height = rotated ? metadata.width : metadata.height;
    const variants: PreparedPhoto["variants"] = [];
    for (const target of galleryVariantWidths(width)) {
      const quality = target <= 480 ? 72 : target <= 960 ? 76 : target <= 1600 ? 80 : 82;
      // sharp elimina EXIF, GPS, IPTC y XMP por defecto; no se usa keepMetadata.
      const result = await sharp(input, IMAGE_OPTIONS)
        .rotate()
        .resize({ width: target, withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      const check = await sharp(result.data).metadata();
      if (check.exif || check.xmp || check.iptc || result.info.width > width) {
        throw new GalleryImportError("Una variante conservó metadatos o agrandó el original");
      }
      const filename = `w${result.info.width}.webp`;
      const temporary = join(folder, `${filename}.tmp`);
      await writeFile(temporary, result.data, { mode: 0o600 });
      await rename(temporary, join(folder, filename));
      variants.push({
        path: `photos/${entry.sourceHash}/${filename}`,
        key: galleryObjectKey(slug, entry.sourceHash, result.info.width),
        width: result.info.width,
        height: result.info.height,
        byteSize: result.data.length,
        sha256: galleryHash(result.data),
        contentType: "image/webp",
      });
    }
    await writeGalleryJson(join(folder, "prepared.json"), {
      version: GALLERY_PREPARATION_VERSION,
      sourceHash: entry.sourceHash,
      sourceByteSize: entry.byteSize,
      width,
      height,
      variants,
    });
  } finally {
    await rm(decodeFolder, { recursive: true, force: true });
  }
}

const highlightsSchema = z.object({ images: z.array(z.object({ source: z.string() })) });

export async function prepareGallery(options: PrepareGalleryOptions): Promise<void> {
  const sourceRoot = await realpath(resolve(options.source));
  const requestedOutput = resolve(options.output);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (
    requestedOutput === repoRoot ||
    requestedOutput.startsWith(`${repoRoot}${sep}`) ||
    requestedOutput.startsWith(`${sourceRoot}${sep}`) ||
    requestedOutput === sourceRoot
  ) {
    throw new GalleryImportError(
      "Las copias privadas deben quedar fuera del repositorio y del origen",
    );
  }
  await mkdir(requestedOutput, { recursive: true, mode: 0o700 });
  const output = await realpath(requestedOutput);
  if (
    output === repoRoot ||
    output === sourceRoot ||
    output.startsWith(`${repoRoot}${sep}`) ||
    output.startsWith(`${sourceRoot}${sep}`)
  ) {
    throw new GalleryImportError("La carpeta privada resuelve dentro del repositorio o del origen");
  }
  const lockPath = join(output, "prepare.lock");
  try {
    await writeFile(lockPath, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch {
    const pid = Number(await readFile(lockPath, "utf8"));
    try {
      process.kill(pid, 0);
      throw new GalleryImportError("Hay otra preparación activa en esta carpeta");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
      await rm(lockPath);
      await writeFile(lockPath, String(process.pid), { flag: "wx", mode: 0o600 });
    }
  }
  try {
    const entries = await scanSources(sourceRoot, output);
    const groups = groupGallerySources(entries);
    if (options.expectedSourceCount && entries.length !== options.expectedSourceCount)
      throw new GalleryImportError("El conteo de archivos no coincide con el inventario esperado");
    if (options.expectedUniqueCount && groups.size !== options.expectedUniqueCount)
      throw new GalleryImportError(
        "El conteo de fotos únicas no coincide con el inventario esperado",
      );
    const byPath = new Map(
      entries.map((entry) => [resolve(sourceRoot, entry.relativePath), entry.sourceHash]),
    );
    const heroSourceHash = byPath.get(resolve(sourceRoot, options.banner));
    if (!heroSourceHash)
      throw new GalleryImportError("La portada elegida no aparece en las fotos incluidas");
    const highlights = options.highlights
      ? await readGalleryJson(resolve(options.highlights), highlightsSchema)
      : { images: [] };
    const featuredSourceHashes = [
      ...new Set(
        highlights.images.map((image) => {
          const hash = byPath.get(resolve(image.source));
          if (!hash)
            throw new GalleryImportError("Una foto destacada no aparece en las fotos incluidas");
          return hash;
        }),
      ),
    ];
    const plan: Preparation = {
      version: GALLERY_PREPARATION_VERSION,
      sourceRoot,
      collection: options.collection,
      sourceCount: entries.length,
      uniqueCount: groups.size,
      ...(options.expectedSourceCount ? { expectedSourceCount: options.expectedSourceCount } : {}),
      ...(options.expectedUniqueCount ? { expectedUniqueCount: options.expectedUniqueCount } : {}),
      preparedCount: 0,
      complete: false,
      heroSourceHash,
      featuredSourceHashes,
      albums: planGalleryAlbums(entries),
    };
    preparationSchema.parse(plan);
    await writeGalleryJson(join(output, "manifest.json"), plan);
    const orderedHashes = [...new Set([heroSourceHash, ...featuredSourceHashes, ...groups.keys()])];
    const selected = options.maxPhotos ? orderedHashes.slice(0, options.maxPhotos) : orderedHashes;
    const failures: { sourceHash: string; errorType: string }[] = [];
    sharp.cache(false);
    sharp.concurrency(1);
    process.stdout.write(
      `Preparación: ${groups.size} fotos únicas; ${entries.length - groups.size} copias conservan sus álbumes.\n`,
    );
    await galleryConcurrent(selected, options.concurrency, async (hash) => {
      const entry = groups.get(hash)?.[0];
      if (!entry) throw new GalleryImportError("Una foto del plan no tiene original");
      try {
        await preparePhoto(sourceRoot, output, plan.collection.slug, entry);
        plan.preparedCount++;
      } catch (error) {
        failures.push({
          sourceHash: hash,
          errorType:
            error instanceof GalleryImportError
              ? error.message
              : "No se pudo decodificar o escribir la foto",
        });
        process.stderr.write(`Foto ${hash.slice(0, 12)}: preparación pendiente.\n`);
      }
      if ((plan.preparedCount + failures.length) % 25 === 0) {
        await writeGalleryJson(join(output, "progress.json"), {
          preparedCount: plan.preparedCount,
          uniqueCount: plan.uniqueCount,
          failures: failures.length,
          updatedAt: new Date().toISOString(),
        });
        process.stdout.write(
          `WebP preparadas: ${plan.preparedCount}/${groups.size}; pendientes por error: ${failures.length}.\n`,
        );
      }
    });
    plan.complete = plan.preparedCount === plan.uniqueCount && failures.length === 0;
    await writeGalleryJson(join(output, "manifest.json"), plan);
    await writeGalleryJson(join(output, "failures.json"), failures);
    process.stdout.write(
      `Preparación ${plan.complete ? "completa" : "parcial"}: ${plan.preparedCount}/${groups.size}. No se consultó la base ni se subió ningún archivo.\n`,
    );
    if (failures.length)
      throw new GalleryImportError(
        "Quedaron fotos pendientes; el registro privado permite revisar y reanudar",
      );
  } finally {
    await rm(lockPath, { force: true });
  }
}
