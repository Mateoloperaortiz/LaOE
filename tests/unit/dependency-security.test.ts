import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const fromExcel = createRequire(require.resolve("exceljs"));
const fromDrizzle = createRequire(require.resolve("drizzle-kit"));
const fromLoader = createRequire(fromDrizzle.resolve("@esbuild-kit/esm-loader"));
const fromCore = createRequire(fromLoader.resolve("@esbuild-kit/core-utils"));

// Los casos de los avisos GHSA-w5hq-g745-h8pq y GHSA-67mh-4wv8-2f99, sobre las copias
// que cargan los consumidores reales. Comprobar otra copia del árbol no detectaría la regresión.
describe("dependencias transitivas corregidas", () => {
  it("el UUID de ExcelJS rechaza una escritura fuera del buffer", () => {
    const uuid: {
      v5(value: string, namespace: string, buffer: Uint8Array, offset: number): Uint8Array;
    } = fromExcel("uuid");
    const buffer = new Uint8Array(8).fill(170);
    expect(() => uuid.v5("prueba", "6ba7b810-9dad-11d1-80b4-00c04fd430c8", buffer, 4)).toThrow(
      RangeError,
    );
    expect(buffer).toEqual(new Uint8Array(8).fill(170));
  });

  it("el esbuild del cargador no permite leer su servidor desde un origen ajeno", async () => {
    const esbuild: typeof import("esbuild") = fromCore("esbuild");
    const directory = await mkdtemp(join(tmpdir(), "oe-esbuild-cors-"));
    const context = await esbuild.context({
      stdin: { contents: "export const value = 42;", sourcefile: "entrada.js" },
      outfile: join(directory, "salida.js"),
      write: false,
    });
    try {
      const { port } = await context.serve({ host: "127.0.0.1", port: 0, servedir: directory });
      const url = `http://127.0.0.1:${port}/salida.js`;
      const local = await fetch(url);
      expect(local.status).toBe(200);
      expect(await local.text()).toContain("42");
      const response = await fetch(url, {
        headers: { Origin: "https://origen-ajeno.invalid" },
      });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await context.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
