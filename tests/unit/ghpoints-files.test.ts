import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadGhEvidence, sha256 } from "../../scripts/lib/ghpoints-files";

let directory: string, root: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "gh-import-test-"));
  root = path.join(directory, "package");
  await mkdir(root);
  await writeFile(path.join(root, "source.txt"), "synthetic");
  await writeFile(path.join(directory, "outside.txt"), "synthetic");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const manifest = (file = "source.txt", hash = sha256("synthetic")) => ({
  sources: [{ key: "SOURCE", path: file, sha256: hash }],
});
describe("evidencias de importación", () => {
  it("verifica bytes y hash", async () => {
    expect((await loadGhEvidence(manifest(), root)).get("SOURCE")?.bytes.toString()).toBe(
      "synthetic",
    );
  });
  it("rechaza cambios de la evidencia", async () => {
    await writeFile(path.join(root, "source.txt"), "changed");
    await expect(loadGhEvidence(manifest(), root)).rejects.toThrow("Cambió");
  });
  it("rechaza rutas que salen del paquete y enlaces externos", async () => {
    await expect(loadGhEvidence(manifest("../outside.txt"), root)).rejects.toThrow("sale");
    await symlink(path.join(directory, "outside.txt"), path.join(root, "link.txt"));
    await expect(loadGhEvidence(manifest("link.txt"), root)).rejects.toThrow("sale");
  });
});
