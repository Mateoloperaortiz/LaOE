import assert from "node:assert/strict";

export function verifyVitestReport(report) {
  assert.equal(report.success, true, "Vitest no terminó aprobado");
  assert(Number.isInteger(report.numTotalTests) && report.numTotalTests > 0, "Vitest sin casos");
  assert.equal(report.numFailedTests, 0, "Vitest tiene fallos");
  assert.equal(report.numPassedTests, report.numTotalTests, "Vitest omitió casos");
  const assertions = report.testResults.flatMap((file) => file.assertionResults);
  assert.equal(assertions.length, report.numTotalTests, "Inventario de Vitest incompleto");
  assert(
    assertions.every((test) => test.status === "passed"),
    "Vitest tiene casos sin aprobar",
  );
  return { cases: report.numTotalTests, files: report.testResults.length };
}

/** Cada runner de integración ejecuta exactamente los archivos de su partición; ninguno se pierde. */
export function verifyIntegrationReports(reports, partitions, fileOf) {
  assert(Array.isArray(partitions) && partitions.length > 0, "Falta el reparto de integración");
  assert.equal(
    reports.length,
    partitions.length,
    `Se necesitan los ${partitions.length} informes de integración`,
  );
  const seen = new Set();
  const shards = [];
  let cases = 0;
  for (const [index, report] of reports.entries()) {
    const shard = index + 1;
    const summary = verifyVitestReport(report);
    const files = new Set();
    for (const file of report.testResults) {
      const name = fileOf(file.name);
      assert(!seen.has(name), `Archivo de integración repetido entre particiones: ${name}`);
      seen.add(name);
      files.add(name);
    }
    assert.deepEqual(
      files,
      new Set(partitions[index].files),
      `La partición ${shard} de integración no ejecutó exactamente sus archivos`,
    );
    cases += summary.cases;
    shards.push({ shard, files: files.size, cases: summary.cases });
  }
  return { cases, files: seen.size, shards };
}

function cases(report) {
  assert.deepEqual(report.errors, [], "El informe contiene errores globales");
  const result = new Map();
  function visit(suites) {
    assert(Array.isArray(suites), "Falta el inventario de suites");
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        assert(typeof spec.id === "string" && spec.id.length > 0, "Caso sin identificador");
        assert(Array.isArray(spec.tests) && spec.tests.length > 0, "Caso sin proyectos");
        for (const test of spec.tests) {
          assert(typeof test.projectName === "string", "Caso sin proyecto");
          const key = `${test.projectName}/${spec.id}`;
          assert(!result.has(key), `Caso duplicado en el informe: ${key}`);
          result.set(key, { spec, test });
        }
      }
      visit(suite.suites ?? []);
    }
  }
  visit(report.suites);
  assert(result.size > 0, "El inventario está vacío");
  return result;
}

/** Compara inventario y ejecución; cada runner corre exactamente los archivos de su partición. */
export function verifyE2eReports(inventory, reports, partitions) {
  const expected = cases(inventory);
  const setups = new Set(
    [...expected].filter(([, item]) => item.test.projectName === "setup").map(([key]) => key),
  );
  assert(setups.size > 0 && expected.size > setups.size, "Faltan autenticación o escenarios");
  assert(Array.isArray(partitions) && partitions.length > 0, "Falta el reparto de particiones");
  assert.equal(
    reports.length,
    partitions.length,
    `Se necesitan los ${partitions.length} informes E2E`,
  );
  const seenScenarios = new Set();
  const durations = [];
  const shards = [];
  for (const [index, report] of reports.entries()) {
    const shard = index + 1;
    const { config, stats } = report;
    assert.equal(config?.workers, 1, "Cada partición exige un worker");
    assert.equal(config.forbidOnly, true, "CI debe rechazar pruebas enfocadas");
    assert.equal(config.shard ?? null, null, "El reparto por archivo no admite --shard");
    for (const status of ["unexpected", "skipped", "flaky"]) {
      assert.equal(stats?.[status], 0, `La partición ${shard} tiene casos ${status}`);
    }
    const actual = cases(report);
    assert.equal(stats.expected, actual.size, "El conteo del informe no coincide con sus casos");
    const actualSetups = new Set();
    const files = new Set();
    for (const [key, { spec, test }] of actual) {
      assert(expected.has(key), `Caso ajeno al inventario: ${key}`);
      assert.equal(test.expectedStatus, "passed", `Se esperaba un fallo en ${key}`);
      assert.equal(test.status, "expected", `Estado final incorrecto en ${key}`);
      assert.equal(test.results?.length, 1, `Falta el resultado o hubo reintentos en ${key}`);
      const result = test.results[0];
      assert.equal(result.status, "passed", `Falló ${key}`);
      assert.equal(result.retry, 0, `Hubo un reintento en ${key}`);
      assert.deepEqual(result.errors, [], `Errores en ${key}`);
      assert(Number.isFinite(result.duration) && result.duration >= 0, `Duración inválida: ${key}`);
      if (setups.has(key)) {
        actualSetups.add(key);
      } else {
        assert(!seenScenarios.has(key), `Escenario repetido entre particiones: ${key}`);
        seenScenarios.add(key);
        files.add(spec.file);
        const annotations = [...(test.annotations ?? []), ...(result.annotations ?? [])];
        assert(
          annotations.some((item) => item.type === "outbox" && item.description === "sin fallos"),
          `Falta la comprobación final del outbox en ${key}`,
        );
      }
      durations.push({ id: key, file: spec.file, title: spec.title, durationMs: result.duration });
    }
    assert.deepEqual(actualSetups, setups, `Autenticación incompleta en la partición ${shard}`);
    assert.deepEqual(
      files,
      new Set(partitions[index].files),
      `La partición ${shard} no ejecutó exactamente sus archivos`,
    );
    shards.push({ shard, files: files.size, cases: actual.size, durationMs: stats.duration });
  }
  assert.deepEqual(
    seenScenarios,
    new Set([...expected.keys()].filter((key) => !setups.has(key))),
    "Faltan escenarios del inventario",
  );
  return {
    uniqueCases: expected.size,
    scenarios: seenScenarios.size,
    setupPerShard: setups.size,
    outbox: "sin fallos en todos los escenarios",
    shards,
    durations: durations.sort((a, b) => b.durationMs - a.durationMs),
  };
}
