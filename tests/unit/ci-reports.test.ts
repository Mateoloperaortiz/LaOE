import { describe, expect, it } from "vitest";
import { verifyE2eReports, verifyVitestReport } from "../../scripts/ci/reports.mjs";

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

function report(current: number, ids: string[]) {
  const specs = [spec("admin", "setup"), spec("miembro", "setup"), ...ids.map((id) => spec(id))];
  return {
    errors: [] as unknown[],
    suites: [{ specs }] as const,
    config: { workers: 1, fullyParallel: true, forbidOnly: true, shard: { current, total: 2 } },
    stats: { expected: specs.length, unexpected: 0, skipped: 0, flaky: 0, duration: 100 },
  };
}

function fixture() {
  return {
    inventory: report(1, ["uno", "dos", "tres"]),
    reports: [report(1, ["uno", "dos"]), report(2, ["tres"])] as const,
  };
}

function scenario(value: ReturnType<typeof report>) {
  const item = value.suites[0].specs.find((spec) => spec.tests[0].projectName === "chromium");
  if (!item) throw new Error("La fixture necesita un escenario");
  return item;
}

describe("integridad de los informes E2E", () => {
  it("cuenta una vez los escenarios y exige autenticación en cada máquina", () => {
    const { inventory, reports } = fixture();
    expect(verifyE2eReports(inventory, reports)).toMatchObject({
      uniqueCases: 5,
      scenarios: 3,
      setupPerShard: 2,
    });
  });
  it("rechaza informes ausentes, repetidos o sin su autenticación", () => {
    const { inventory, reports } = fixture();
    expect(() => verifyE2eReports(inventory, reports.slice(0, 1))).toThrow("dos informes");
    expect(() => verifyE2eReports(inventory, [reports[0], reports[0]])).toThrow(
      "Partición duplicada",
    );
    reports[1].suites[0].specs.shift();
    reports[1].stats.expected--;
    expect(() => verifyE2eReports(inventory, reports)).toThrow("Autenticación incompleta");
  });
  it("detecta una omisión aunque todos los contadores del reporte reducido estén en verde", () => {
    const { inventory, reports } = fixture();
    reports[0].suites[0].specs.pop();
    reports[0].stats.expected--;
    expect(() => verifyE2eReports(inventory, reports)).toThrow("Faltan escenarios");
  });
  it("detecta escenarios repetidos entre máquinas", () => {
    const { inventory, reports } = fixture();
    reports[1].suites[0].specs.push(spec("uno"));
    reports[1].stats.expected++;
    expect(() => verifyE2eReports(inventory, reports)).toThrow("Escenario repetido");
  });
  it("rechaza un caso ajeno al inventario", () => {
    const { inventory, reports } = fixture();
    scenario(reports[1]).id = "desconocido";
    expect(() => verifyE2eReports(inventory, reports)).toThrow("ajeno al inventario");
  });
  it("rechaza un caso que no pasó por el drenaje estricto del outbox", () => {
    const { inventory, reports } = fixture();
    scenario(reports[1]).tests[0].annotations = [];
    expect(() => verifyE2eReports(inventory, reports)).toThrow("outbox");
  });
  it.each(["unexpected", "skipped", "flaky"] as const)("rechaza casos %s", (status) => {
    const { inventory, reports } = fixture();
    reports[0].stats[status] = 1;
    expect(() => verifyE2eReports(inventory, reports)).toThrow(status);
  });
  it("rechaza reintentos, fallos esperados y errores globales", () => {
    const { inventory, reports } = fixture();
    const test = scenario(reports[0]).tests[0];
    test.results[0].retry = 1;
    expect(() => verifyE2eReports(inventory, reports)).toThrow("reintento");
    test.results[0].retry = 0;
    test.expectedStatus = "failed";
    expect(() => verifyE2eReports(inventory, reports)).toThrow("esperaba un fallo");
    test.expectedStatus = "passed";
    reports[0].errors.push({ message: "Servidor caído" });
    expect(() => verifyE2eReports(inventory, reports)).toThrow("errores globales");
  });
  it("exige la configuración que protege contra concurrencia y pruebas enfocadas", () => {
    const { inventory, reports } = fixture();
    reports[0].config.workers = 2;
    expect(() => verifyE2eReports(inventory, reports)).toThrow("worker");
    reports[0].config.workers = 1;
    reports[0].config.forbidOnly = false;
    expect(() => verifyE2eReports(inventory, reports)).toThrow("enfocadas");
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
