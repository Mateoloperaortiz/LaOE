import assert from "node:assert/strict";
import { listSpecFiles, partitionFiles } from "./e2e-partition.mjs";
import durations from "./integration-durations.json" with { type: "json" };

/** Runners de integración de la matriz del workflow; el comando rechaza cualquier otro total (ADR-139). */
export const INTEGRATION_SHARDS = 3;
const ROOT = "tests/integration";

/** Archivos de integración con la ruta del repo, en orden estable; Vitest los acepta como filtro. */
export function listIntegrationFiles() {
  return listSpecFiles(ROOT).map((name) => `${ROOT}/${name}`);
}

/** El informe JSON de Vitest nombra cada archivo con ruta absoluta; se normaliza a la del repo. */
export function integrationFileOf(name) {
  assert(typeof name === "string", "Archivo sin nombre en el informe");
  const normalized = name.replaceAll("\\", "/");
  const index = normalized.lastIndexOf(`${ROOT}/`);
  assert(index >= 0, `Archivo ajeno a ${ROOT}: ${name}`);
  return normalized.slice(index);
}

/** Segundos por archivo a partir de un informe JSON aprobado de Vitest. */
export function durationsFromVitestReport(report, sourceRunId = "manual", sourceSha = "manual") {
  assert.equal(report?.success, true, "Solo un informe aprobado aporta duraciones");
  assert(
    Array.isArray(report.testResults) && report.testResults.length > 0,
    "Informe sin archivos",
  );
  const files = new Map();
  for (const file of report.testResults) {
    assert(Number.isFinite(file.startTime) && Number.isFinite(file.endTime), "Tiempos inválidos");
    const name = integrationFileOf(file.name);
    assert(!files.has(name), `Archivo repetido en el informe: ${name}`);
    files.set(name, Math.max(0, (file.endTime - file.startTime) / 1000));
  }
  return {
    sourceRunId: String(sourceRunId),
    sourceSha: String(sourceSha),
    files: Object.fromEntries(
      [...files]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([file, seconds]) => [file, Math.round(seconds * 10) / 10]),
    ),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Mediana por archivo entre informes aprobados de varias particiones y ejecuciones. Cada informe se
 * valida por separado, así que un archivo repetido dentro del mismo informe sigue rechazándose.
 */
export function durationsFromVitestReports(
  reports,
  sourceRunIds = ["manual"],
  sourceSha = "manual",
) {
  assert(Array.isArray(reports) && reports.length > 0, "Sin informes para aportar duraciones");
  const ids = (Array.isArray(sourceRunIds) ? sourceRunIds : [sourceRunIds]).map(String);
  assert(ids.length > 0, "Sin ejecuciones para aportar duraciones");
  const samples = new Map();
  for (const report of reports) {
    const generated = durationsFromVitestReport(report, "manual", "manual");
    for (const [file, seconds] of Object.entries(generated.files)) {
      if (!samples.has(file)) samples.set(file, []);
      samples.get(file).push(seconds);
    }
  }
  return {
    sourceRunId: ids[0],
    sourceRunIds: ids,
    sourceSha: String(sourceSha),
    files: Object.fromEntries(
      [...samples]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([file, values]) => [file, Math.round(median(values) * 10) / 10]),
    ),
  };
}

/** Reparto vigente del checkout: mismo árbol y mismo JSON, misma partición en cada job y en el gate. */
export function integrationPartitions() {
  return partitionFiles(listIntegrationFiles(), durations.files, INTEGRATION_SHARDS);
}
