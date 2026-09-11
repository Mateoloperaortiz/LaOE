import { describe, expect, it } from "vitest";
import {
  verifyE2eReports,
  verifyIntegrationReports,
  verifyVitestReport,
} from "../../scripts/ci/reports.mjs";

function spec(id: string, projectName = "chromium") {
  const result = { status: "passed", retry: 0, errors: [] as unknown[], duration: 10 };
  const test = {
    projectName,
    expectedStatus: "passed",
    status: "expected",
    annotations: [{ type: "outbox", description: "sin fallos" }],
    results: [result] as const,
  };
  return {
    id,
    file: `${id}.spec.ts`,
    title: id,
    tests: [test] as const,
  };
}

function report(ids: string[]) {
  const specs = [spec("admin", "setup"), spec("miembro", "setup"), ...ids.map((id) => spec(id))];
  return {
    errors: [] as unknown[],
    suites: [{ specs }] as const,
    config: {
      workers: 1,
      forbidOnly: true,
      shard: null as null | { current: number; total: number },
    },
    stats: { expected: specs.length, unexpected: 0, skipped: 0, flaky: 0, duration: 100 },
  };
}

function fixture() {
  return {
    inventory: report(["uno", "dos", "tres"]),
    reports: [report(["uno", "dos"]), report(["tres"])] as const,
    partitions: [{ files: ["uno.spec.ts", "dos.spec.ts"] }, { files: ["tres.spec.ts"] }],
  };
}

function scenario(value: ReturnType<typeof report>) {
  const item = value.suites[0].specs.find((spec) => spec.tests[0].projectName === "chromium");
  if (!item) throw new Error("La fixture necesita un escenario");
  return item;
}

describe("integridad de los informes E2E", () => {
  it("cuenta una vez los escenarios y exige autenticación en cada máquina", () => {
    const { inventory, reports, partitions } = fixture();
    expect(verifyE2eReports(inventory, reports, partitions)).toMatchObject({
      uniqueCases: 5,
      scenarios: 3,
      setupPerShard: 2,
      shards: [
        { shard: 1, files: 2, cases: 4 },
        { shard: 2, files: 1, cases: 3 },
      ],
    });
  });
  it("rechaza informes ausentes, repetidos o sin su autenticación", () => {
    const { inventory, reports, partitions } = fixture();
    expect(() => verifyE2eReports(inventory, reports.slice(0, 1), partitions)).toThrow(
      "2 informes",
    );
    expect(() => verifyE2eReports(inventory, [reports[0], reports[0]], partitions)).toThrow(
      "repetido",
    );
    expect(() => verifyE2eReports(inventory, reports, [])).toThrow("reparto");
    reports[1].suites[0].specs.shift();
    reports[1].stats.expected--;
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow(
      "Autenticación incompleta",
    );
  });
  it("exige que cada máquina ejecute exactamente los archivos de su partición", () => {
    const { inventory, reports, partitions } = fixture();
    expect(() => verifyE2eReports(inventory, reports, [partitions[1], partitions[0]])).toThrow(
      "exactamente sus archivos",
    );
    reports[0].config.shard = { current: 1, total: 2 };
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("--shard");
  });
  it("detecta una omisión aunque todos los contadores del reporte reducido estén en verde", () => {
    const { inventory, reports, partitions } = fixture();
    reports[0].suites[0].specs.pop();
    reports[0].stats.expected--;
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("exactamente");
    partitions[0]?.files.pop();
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("Faltan escenarios");
  });
  it("detecta escenarios repetidos entre máquinas", () => {
    const { inventory, reports, partitions } = fixture();
    reports[1].suites[0].specs.push(spec("uno"));
    reports[1].stats.expected++;
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("Escenario repetido");
  });
  it("rechaza un caso ajeno al inventario", () => {
    const { inventory, reports, partitions } = fixture();
    scenario(reports[1]).id = "desconocido";
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("ajeno al inventario");
  });
  it("rechaza un caso que no pasó por el drenaje estricto del outbox", () => {
    const { inventory, reports, partitions } = fixture();
    scenario(reports[1]).tests[0].annotations = [];
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("outbox");
  });
  it.each(["unexpected", "skipped", "flaky"] as const)("rechaza casos %s", (status) => {
    const { inventory, reports, partitions } = fixture();
    reports[0].stats[status] = 1;
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow(status);
  });
  it("rechaza reintentos, fallos esperados y errores globales", () => {
    const { inventory, reports, partitions } = fixture();
    const test = scenario(reports[0]).tests[0];
    test.results[0].retry = 1;
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("reintento");
    test.results[0].retry = 0;
    test.expectedStatus = "failed";
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("esperaba un fallo");
    test.expectedStatus = "passed";
    reports[0].errors.push({ message: "Servidor caído" });
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("errores globales");
  });
  it("exige la configuración que protege contra concurrencia y pruebas enfocadas", () => {
    const { inventory, reports, partitions } = fixture();
    reports[0].config.workers = 2;
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("worker");
    reports[0].config.workers = 1;
    reports[0].config.forbidOnly = false;
    expect(() => verifyE2eReports(inventory, reports, partitions)).toThrow("enfocadas");
  });
});

describe("integridad de informes unitarios y de integración", () => {
  const complete = () => ({
    success: true,
    numTotalTests: 1,
    numPassedTests: 1,
    numFailedTests: 0,
    testResults: [{ assertionResults: [{ status: "passed" }] }],
  });
  it("acepta todos los casos aprobados", () => {
    expect(verifyVitestReport(complete())).toEqual({ cases: 1, files: 1 });
  });
  it("rechaza omisiones, fallos y resultados ausentes aunque success sea true", () => {
    expect(() => verifyVitestReport({ ...complete(), numTotalTests: 2 })).toThrow("omitió");
    expect(() => verifyVitestReport({ ...complete(), numFailedTests: 1 })).toThrow("fallos");
    expect(() => verifyVitestReport({ ...complete(), testResults: [] })).toThrow("incompleto");
  });
});

describe("integridad de los informes de integración por partición", () => {
  const fileOf = (name: string) => name.replace(/^.*\/(tests\/integration\/)/, "$1");
  const vitest = (names: string[]) => ({
    success: true,
    numTotalTests: names.length,
    numPassedTests: names.length,
    numFailedTests: 0,
    testResults: names.map((name) => ({
      name: `/repo/tests/integration/${name}.test.ts`,
      assertionResults: [{ status: "passed" }],
    })),
  });
  const partitions = () => [
    { files: ["tests/integration/a.test.ts", "tests/integration/b.test.ts"] },
    { files: ["tests/integration/c.test.ts"] },
  ];
  it("suma casos y archivos cuando cada máquina ejecutó exactamente su partición", () => {
    expect(
      verifyIntegrationReports([vitest(["a", "b"]), vitest(["c"])], partitions(), fileOf),
    ).toEqual({
      cases: 3,
      files: 3,
      shards: [
        { shard: 1, files: 2, cases: 2 },
        { shard: 2, files: 1, cases: 1 },
      ],
    });
  });
  it("rechaza particiones cambiadas, archivos repetidos, informes ausentes y fallos", () => {
    const [first, second] = partitions();
    expect(() =>
      verifyIntegrationReports([vitest(["a", "b"]), vitest(["c"])], [second, first], fileOf),
    ).toThrow("exactamente");
    expect(() =>
      verifyIntegrationReports([vitest(["a", "b"]), vitest(["a", "c"])], partitions(), fileOf),
    ).toThrow("repetido");
    expect(() => verifyIntegrationReports([vitest(["a", "b"])], partitions(), fileOf)).toThrow(
      "2 informes",
    );
    expect(() =>
      verifyIntegrationReports(
        [{ ...vitest(["a", "b"]), numFailedTests: 1 }, vitest(["c"])],
        partitions(),
        fileOf,
      ),
    ).toThrow("fallos");
    expect(() => verifyIntegrationReports([vitest(["a", "b"]), vitest(["c"])], [], fileOf)).toThrow(
      "reparto",
    );
  });
});
