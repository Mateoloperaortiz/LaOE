import { describe, expect, it } from "vitest";
import {
  findPromotionEvidence,
  promotionHead,
  selectEvidenceRun,
  verifyEvidence,
} from "../../scripts/ci/promotion.mjs";

const head = "c".repeat(40);
const run = (overrides: Record<string, unknown> = {}) => ({
  id: 1001,
  head_sha: head,
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  path: ".github/workflows/ci.yml",
  html_url: "https://github.com/Mateoloperaortiz/LaOE/actions/runs/1001",
  created_at: "2026-09-11T15:00:00Z",
  repository: { full_name: "Mateoloperaortiz/LaOE" },
  ...overrides,
});
const evidence = (overrides: Record<string, unknown> = {}) => ({
  schema: 1,
  sha: head,
  runId: "1001",
  mode: "full",
  result: "success",
  unit: { cases: 432, files: 60 },
  integration: { cases: 309, files: 65 },
  e2e: {
    uniqueCases: 169,
    scenarios: 167,
    setupPerShard: 2,
    outbox: "sin fallos en todos los escenarios",
    shards: [{ shard: 1, files: 20, cases: 60, durationMs: 1000 }],
    durations: [{ id: "x", file: "a.spec.ts", title: "uno", durationMs: 10 }],
  },
  ...overrides,
});

describe("qué push puede reutilizar evidencia", () => {
  it("solo un push a production cuyo HEAD es el after del evento", () => {
    expect(promotionHead("push", "refs/heads/production", { after: head }, head)).toBe(head);
    expect(promotionHead("push", "refs/heads/main", { after: head }, head)).toBeNull();
    expect(
      promotionHead("pull_request", "refs/heads/production", { after: head }, head),
    ).toBeNull();
    expect(promotionHead("workflow_dispatch", "refs/heads/production", {}, head)).toBeNull();
    expect(
      promotionHead("push", "refs/heads/production", { after: "e".repeat(40) }, head),
    ).toBeNull();
    expect(promotionHead("push", "refs/heads/production", { after: "main" }, "main")).toBeNull();
  });
});

describe("selección de la ejecución de main", () => {
  it("elige la más reciente aprobada del mismo SHA, workflow y push a main", () => {
    const older = run({ id: 900, created_at: "2026-09-11T14:00:00Z" });
    expect(selectEvidenceRun(head, [older, run()], "2000")?.id).toBe(1001);
  });
  it.each([
    ["otro SHA", { head_sha: "e".repeat(40) }],
    ["un PR", { event: "pull_request" }],
    ["otra rama", { head_branch: "production" }],
    ["otro workflow", { path: ".github/workflows/smoke.yml" }],
    ["un fallo", { conclusion: "failure" }],
    ["una ejecución en curso", { status: "in_progress", conclusion: null }],
    ["otro repositorio", { repository: { full_name: "otro/repo" } }],
    ["una fecha inválida", { created_at: "ayer" }],
  ])("descarta %s", (_label, overrides) => {
    expect(selectEvidenceRun(head, [run(overrides)], "2000")).toBeNull();
  });
  it("nunca se reutiliza a sí misma y rechaza listados inválidos", () => {
    expect(selectEvidenceRun(head, [run()], "1001")).toBeNull();
    expect(() => selectEvidenceRun(head, null, "2000")).toThrow("Listado");
  });
});

describe("verificación de la evidencia", () => {
  it("resume la ejecución y las familias sin copiar las duraciones", () => {
    const reused = verifyEvidence(head, run(), evidence());
    expect(reused).toMatchObject({
      runId: "1001",
      sha: head,
      headBranch: "main",
      unit: { cases: 432 },
      integration: { cases: 309 },
      e2e: { uniqueCases: 169, scenarios: 167 },
    });
    expect(reused.e2e).not.toHaveProperty("durations");
  });
  it.each([
    ["otro SHA en la evidencia", evidence({ sha: "e".repeat(40) }), "otro SHA"],
    ["otra ejecución", evidence({ runId: "999" }), "otra ejecución"],
    ["un CI documental", evidence({ mode: "documentation" }), "completo"],
    ["una promoción anterior", evidence({ mode: "promotion" }), "completo"],
    ["un resultado fallido", evidence({ result: "failure" }), "aprobada"],
    ["un esquema desconocido", evidence({ schema: 2 }), "Esquema"],
    ["unitarias sin casos", evidence({ unit: { cases: 0 } }), "unit"],
    ["E2E sin escenarios", evidence({ e2e: { uniqueCases: 0, scenarios: 0 } }), "E2E"],
  ])("rechaza %s", (_label, item, message) => {
    expect(() => verifyEvidence(head, run(), item)).toThrow(message);
  });
  it("rechaza una ejecución que no sea un push aprobado a main de este workflow", () => {
    expect(() => verifyEvidence(head, run({ head_branch: "production" }), evidence())).toThrow(
      "main",
    );
    expect(() => verifyEvidence(head, run({ event: "workflow_dispatch" }), evidence())).toThrow(
      "push",
    );
    expect(() => verifyEvidence(head, run({ conclusion: "cancelled" }), evidence())).toThrow(
      "aprobada",
    );
    expect(() => verifyEvidence("main", run(), evidence())).toThrow("SHA inválido");
  });
});

describe("búsqueda de evidencia con la API", () => {
  it("devuelve la ejecución y su resultado cuando ambos existen y cumplen", async () => {
    const found = await findPromotionEvidence(head, {
      listRuns: async () => [run()],
      downloadResult: async (id: number) => (id === 1001 ? evidence() : null),
      currentRunId: "2000",
    });
    expect(found).toMatchObject({ run: { id: 1001, head_sha: head }, evidence: { mode: "full" } });
  });
  it("no reutiliza nada sin ejecución candidata o sin artefacto", async () => {
    const missing = { downloadResult: async () => evidence(), currentRunId: "2000" };
    expect(await findPromotionEvidence(head, { ...missing, listRuns: async () => [] })).toBeNull();
    expect(
      await findPromotionEvidence(head, {
        listRuns: async () => [run()],
        downloadResult: async () => null,
        currentRunId: "2000",
      }),
    ).toBeNull();
  });
  it("falla, y no aprueba, cuando la evidencia existe pero no cumple", async () => {
    await expect(
      findPromotionEvidence(head, {
        listRuns: async () => [run()],
        downloadResult: async () => evidence({ mode: "documentation" }),
        currentRunId: "2000",
      }),
    ).rejects.toThrow("completo");
  });
});
