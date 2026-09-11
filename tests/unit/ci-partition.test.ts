import { describe, expect, it } from "vitest";
import durations from "../../scripts/ci/e2e-durations.json" with { type: "json" };
import {
  durationsFromResult,
  E2E_SHARDS,
  listSpecFiles,
  parseShard,
  partitionFiles,
} from "../../scripts/ci/e2e-partition.mjs";
import {
  durationsFromVitestReport,
  INTEGRATION_SHARDS,
  integrationFileOf,
  integrationPartitions,
  listIntegrationFiles,
} from "../../scripts/ci/integration-partition.mjs";

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
    expect(E2E_SHARDS).toBe(5);
    expect(parseShard("2/5")).toBe(2);
    expect(() => parseShard("1/4")).toThrow("declara 4");
    expect(() => parseShard("6/5")).toThrow("no existe");
    expect(() => parseShard("0/5")).toThrow("inválida");
    expect(parseShard("2/2", 2)).toBe(2);
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

describe("reparto de la integración por archivo", () => {
  it("lista los archivos de integración con la ruta del repo y normaliza las del informe", () => {
    const listed = listIntegrationFiles();
    expect(listed.length).toBeGreaterThan(40);
    expect(listed.every((name) => /^tests\/integration\/.+\.test\.ts$/.test(name))).toBe(true);
    expect(integrationFileOf("/home/runner/work/LaOE/LaOE/tests/integration/otp.test.ts")).toBe(
      "tests/integration/otp.test.ts",
    );
    expect(integrationFileOf("C:\\repo\\tests\\integration\\otp.test.ts")).toBe(
      "tests/integration/otp.test.ts",
    );
    expect(() => integrationFileOf("/repo/tests/unit/otp.test.ts")).toThrow("ajeno");
  });
  it("suma la duración de cada archivo de un informe aprobado", () => {
    const report = {
      success: true,
      testResults: [
        { name: "/repo/tests/integration/b.test.ts", startTime: 1000, endTime: 3550 },
        { name: "/repo/tests/integration/a.test.ts", startTime: 1000, endTime: 1200 },
      ],
    };
    expect(durationsFromVitestReport(report, "1", "abc")).toEqual({
      sourceRunId: "1",
      sourceSha: "abc",
      files: { "tests/integration/a.test.ts": 0.2, "tests/integration/b.test.ts": 2.6 },
    });
    expect(() => durationsFromVitestReport({ ...report, success: false })).toThrow("aprobado");
    expect(() =>
      durationsFromVitestReport({
        ...report,
        testResults: [...report.testResults, report.testResults[0]],
      }),
    ).toThrow("repetido");
  });
  it("deja cada archivo actual en una única partición no vacía", () => {
    const listed = listIntegrationFiles();
    const partitions = integrationPartitions();
    expect(partitions).toHaveLength(INTEGRATION_SHARDS);
    expect(partitions.every((partition) => partition.files.length > 0)).toBe(true);
    expect(partitions.flatMap((partition) => partition.files).sort()).toEqual(listed);
  });
});
