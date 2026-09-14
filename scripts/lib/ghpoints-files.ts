import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { GhImportError, type GhManifest } from "./ghpoints-plan";

export const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

/** Mantiene el paquete acotado y no sigue rutas ni enlaces fuera del directorio de evidencia. */
export async function loadGhEvidence(manifest: Pick<GhManifest, "sources">, sourceRoot: string) {
  const root = await realpath(sourceRoot);
  const files = new Map<string, { bytes: Buffer; path: string; contentType: string }>();
  let total = 0;
  for (const source of manifest.sources) {
    if (path.isAbsolute(source.path))
      throw new GhImportError("La evidencia debe usar rutas relativas al paquete");
    const actual = await realpath(path.resolve(root, source.path));
    const relative = path.relative(root, actual);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative))
      throw new GhImportError("La evidencia sale del directorio del paquete");
    const info = await stat(actual);
    total += info.size;
    if (!info.isFile() || info.size > 30 * 1024 * 1024 || total > 200 * 1024 * 1024)
      throw new GhImportError("La evidencia supera los límites de tamaño");
    const bytes = await readFile(actual);
    if (bytes.length !== info.size || sha256(bytes) !== source.sha256)
      throw new GhImportError(`Cambió la evidencia ${source.key}`);
    const contentType = actual.endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : /\.jpe?g$/i.test(actual)
        ? "image/jpeg"
        : actual.endsWith(".json")
          ? "application/json"
          : "text/plain; charset=utf-8";
    files.set(source.key, { bytes, path: source.path, contentType });
  }
  return files;
}
