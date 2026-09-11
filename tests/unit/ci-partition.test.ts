import { describe, expect, it } from "vitest";
import durations from "../../scripts/ci/e2e-durations.json" with { type: "json" };
import {
  durationsFromResult,
  E2E_SHARDS,
  listSpecFiles,
  parseShard,
  partitionFiles,
} from "../../scripts/ci/e2e-partition.mjs";

const known = {
  "a.spec.ts": 100,
  "b.spec.ts": 60,
  "c.spec.ts": 50,
  "d.spec.ts": 40,
  "e.spec.ts": 30,
  "f.spec.ts": 20,
};
const files = Object.keys(known);

describe("reparto de escenarios E2E por archivo", () => {
  it("manda el archivo más largo al runner menos cargado, sin depender del orden de entrada", () => {
    const forward = partitionFiles(files, known, 3);
    expect(forward).toEqual([
      { files: ["a.spec.ts"], seconds: 100 },
      { files: ["b.spec.ts", "e.spec.ts", "f.spec.ts"], seconds: 110 },
      { files: ["c.spec.ts", "d.spec.ts"], seconds: 90 },
    ]);
    expect(partitionFiles([...files].reverse(), known, 3)).toEqual(forward);
  });
  it("cubre cada archivo exactamente una vez", () => {
    const all = partitionFiles(files, known, 4).flatMap((partition) => partition.files);
    expect([...all].sort()).toEqual([...files].sort());
    expect(new Set(all).size).toBe(files.length);
  });
  it("pesa un archivo desconocido con la mediana de las duraciones conocidas", () => {
    const partitions = partitionFiles([...files, "z.spec.ts"], known, 2);
    expect(partitions.map((partition) => partition.seconds)).toEqual([175, 170]);
    expect(partitions.filter((partition) => partition.files.includes("z.spec.ts"))).toHaveLength(1);
  });
  it("reparte por nombre cuando no hay duraciones", () => {
    expect(partitionFiles(files, {}, 3)).toEqual([
      { files: ["a.spec.ts", "d.spec.ts"], seconds: 2 },
      { files: ["b.spec.ts", "e.spec.ts"], seconds: 2 },
      { files: ["c.spec.ts", "f.spec.ts"], seconds: 2 },
    ]);
  });
  it("rechaza repartos sin archivos o sin runners", () => {
    expect(() => partitionFiles([], known, 3)).toThrow("archivos");
    expect(() => partitionFiles(files, known, 0)).toThrow("particiones");
  });
  it("exige que la matriz del workflow declare el mismo total que el reparto", () => {
    expect(E2E_SHARDS).toBe(3);
    expect(parseShard("2/3")).toBe(2);
    expect(() => parseShard("1/2")).toThrow("declara 2");
    expect(() => parseShard("4/3")).toThrow("no existe");
    expect(() => parseShard("0/3")).toThrow("inválida");
    expect(() => parseShard(undefined)).toThrow("inválida");
  });
});

describe("duraciones por archivo desde un resultado de CI", () => {
  const result = (overrides: Record<string, unknown> = {}) => ({
    runId: "34618190390",
    sha: "d".repeat(40),
    mode: "full",
    result: "success",
    e2e: {
      durations: [
        { file: "auth.setup.ts", title: "entra", durationMs: 3000 },
        { file: "a.spec.ts", title: "uno", durationMs: 1234 },
        { file: "a.spec.ts", title: "dos", durationMs: 1000 },
        { file: "b.spec.ts", title: "tres", durationMs: 500 },
      ],
    },
    ...overrides,
  });
  it("suma los casos de cada archivo y excluye la autenticación", () => {
    expect(durationsFromResult(result())).toEqual({
      sourceRunId: "34618190390",
      sourceSha: "d".repeat(40),
      files: { "a.spec.ts": 2.2, "b.spec.ts": 0.5 },
    });
  });
  it("solo acepta un CI completo y aprobado con duraciones", () => {
    expect(() => durationsFromResult(result({ mode: "documentation" }))).toThrow("completo");
    expect(() => durationsFromResult(result({ result: "failure" }))).toThrow("aprobado");
    expect(() => durationsFromResult(result({ e2e: {} }))).toThrow("duraciones");
  });
});

describe("la suite real y sus duraciones versionadas", () => {
  it("lista solo escenarios, ordenados y sin la autenticación", () => {
    const listed = listSpecFiles();
    expect(listed.length).toBeGreaterThan(40);
    expect(listed).toEqual([...listed].sort());
    expect(listed.every((name) => /\.spec\.ts$/.test(name))).toBe(true);
    expect(listed.some((name) => name.includes("setup"))).toBe(false);
  });
  it("deja cada archivo actual en una única partición no vacía", () => {
    const listed = listSpecFiles();
    const partitions = partitionFiles(listed, durations.files);
    expect(partitions).toHaveLength(E2E_SHARDS);
    expect(partitions.every((partition) => partition.files.length > 0)).toBe(true);
    expect(partitions.flatMap((partition) => partition.files).sort()).toEqual(listed);
  });
});
