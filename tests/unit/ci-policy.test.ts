import { describe, expect, it } from "vitest";
import { classifyPaths, comparisonBase, verifyJobs } from "../../scripts/ci/policy.mjs";

const base = "a".repeat(40);
const head = "b".repeat(40);
const jobs = (mode = "full") => ({
  cambios: { result: "success", outputs: { mode } },
  ...Object.fromEntries(
    ["calidad", "respaldo", "integracion", "e2e"].map((name) => [
      name,
      { result: mode === "full" ? "success" : "skipped" },
    ]),
  ),
});

describe("clasificación conservadora de CI", () => {
  it("permite el recorrido ligero para documentación conocida", () => {
    expect(classifyPaths(["docs/09-roadmap.md", "docs/adr/ADR-053-ci.md"])).toBe("documentation");
    expect(classifyPaths(["docs/ci-cd-2026-09-11.json"])).toBe("documentation");
    expect(classifyPaths(["docs/04-decisiones.md", "docs/10-verificacion.md"])).toBe(
      "documentation",
    );
  });
  it.each([
    "src/app/page.tsx",
    "drizzle/0014.sql",
    "docs/14-copy-y-textos.md",
    "docs/nueva-regla.md",
    "scripts/ci/policy.mjs",
    ".github/workflows/ci.yml",
    "tests/e2e/nuevo.spec.ts",
    "package-lock.json",
    "public/nuevo.svg",
    ".railway/railway.ts",
  ])("ejecuta todo cuando un cambio mixto incluye %s", (path) => {
    expect(classifyPaths(["docs/15-runbook.md", path])).toBe("full");
  });
  it("no deduce documentación de un diff vacío o no disponible", () => {
    expect(classifyPaths([])).toBe("full");
    expect(classifyPaths(null)).toBe("full");
  });
  it("usa el before completo del push, aunque el último commit sea documental", () => {
    expect(
      comparisonBase("push", { before: base, after: head, head_commit: { id: head } }, head),
    ).toBe(base);
    expect(comparisonBase("pull_request", { pull_request: { base: { sha: base } } }, head)).toBe(
      base,
    );
  });
  it("manda a validación completa referencias nuevas, incoherentes y ejecuciones manuales", () => {
    expect(comparisonBase("push", { before: "0".repeat(40), after: head }, head)).toBeNull();
    expect(comparisonBase("push", { before: base, after: base }, head)).toBeNull();
    expect(comparisonBase("push", { before: "main", after: head }, head)).toBeNull();
    expect(comparisonBase("workflow_dispatch", { before: base, after: head }, head)).toBeNull();
  });
});

describe("resultado final de CI", () => {
  it("acepta la suite completa aprobada y las omisiones explícitas documental y de promoción", () => {
    expect(verifyJobs(jobs())).toBe("full");
    expect(verifyJobs(jobs("documentation"))).toBe("documentation");
    expect(verifyJobs(jobs("promotion"))).toBe("promotion");
  });
  it("exige que una promoción omita los jobs pesados en vez de ejecutarlos a medias", () => {
    expect(() => verifyJobs({ ...jobs("promotion"), e2e: { result: "success" } })).toThrow("e2e");
    expect(() => verifyJobs({ ...jobs("promotion"), calidad: { result: "failure" } })).toThrow(
      "calidad",
    );
  });
  it.each([
    "failure",
    "cancelled",
    "skipped",
    undefined,
  ])("rechaza E2E con resultado %s", (result) => {
    expect(() => verifyJobs({ ...jobs(), e2e: { result } })).toThrow("e2e");
  });
  it("no permite que una clasificación fallida o desconocida pinte verde", () => {
    expect(() => verifyJobs({ ...jobs(), cambios: { result: "failure" } })).toThrow(
      "clasificación",
    );
    expect(() => verifyJobs(jobs("desconocido"))).toThrow("Modo");
  });
});
