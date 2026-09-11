import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/** Runners E2E de la matriz del workflow; el comando rechaza cualquier otro total (ADR-055). */
export const E2E_SHARDS = 5;

const SCENARIO = /\.(spec|test)\.[cm]?[jt]sx?$/;

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Archivos de escenarios relativos a tests/e2e, en orden estable. La autenticación no se reparte. */
export function listSpecFiles(directory = resolve("tests/e2e")) {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((name) => SCENARIO.test(name))
    .map((name) => name.replaceAll("\\", "/"))
    .sort(compare);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return null;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Reparto voraz por duración: el archivo más largo va al runner menos cargado. Determinista para
 * el mismo árbol y las mismas duraciones; un archivo desconocido pesa la mediana de las conocidas.
 */
export function partitionFiles(files, known, total = E2E_SHARDS) {
  assert(Number.isInteger(total) && total >= 1, "Número de particiones inválido");
  assert(Array.isArray(files) && files.length > 0, "No hay archivos de escenarios para repartir");
  const durations = known && typeof known === "object" ? known : {};
  const fallback =
    median(Object.values(durations).filter((v) => Number.isFinite(v) && v >= 0)) ?? 1;
  const weight = (file) =>
    Number.isFinite(durations[file]) && durations[file] >= 0 ? durations[file] : fallback;
  const ordered = [...new Set(files)].sort((a, b) => weight(b) - weight(a) || compare(a, b));
  /** @type {{ files: string[]; seconds: number }[]} */
  const bins = Array.from({ length: total }, () => ({ files: [], seconds: 0 }));
  for (const file of ordered) {
    const bin = bins.reduce((best, candidate) =>
      candidate.seconds < best.seconds ? candidate : best,
    );
    bin.files.push(file);
    bin.seconds += weight(file);
  }
  return bins.map((bin) => ({
    files: [...bin.files].sort(compare),
    seconds: Math.round(bin.seconds * 10) / 10,
  }));
}

/** `k/n` de la matriz; `n` debe coincidir con E2E_SHARDS para que reparto y matriz no diverjan. */
export function parseShard(spec, total = E2E_SHARDS) {
  const match = /^([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(spec ?? "");
  assert(match, "Partición inválida: usar k/n");
  const current = Number(match[1]);
  const declared = Number(match[2]);
  assert.equal(
    declared,
    total,
    `El workflow declara ${declared} particiones y el reparto usa ${total}`,
  );
  assert(current <= total, `La partición ${current} no existe con ${total} runners`);
  return current;
}

/** Segundos por archivo de escenarios a partir de un ci-result.json completo y aprobado. */
export function durationsFromResult(result) {
  assert.equal(result?.mode, "full", "Solo un CI completo aporta duraciones");
  assert.equal(result.result, "success", "Solo un CI aprobado aporta duraciones");
  assert(
    Array.isArray(result.e2e?.durations) && result.e2e.durations.length > 0,
    "Sin duraciones E2E",
  );
  const files = new Map();
  for (const item of result.e2e.durations) {
    assert(typeof item.file === "string" && Number.isFinite(item.durationMs), "Duración inválida");
    if (!SCENARIO.test(item.file)) continue;
    files.set(item.file, (files.get(item.file) ?? 0) + item.durationMs / 1000);
  }
  assert(files.size > 0, "El resultado no contiene escenarios");
  return {
    sourceRunId: String(result.runId),
    sourceSha: result.sha,
    files: Object.fromEntries(
      [...files]
        .sort(([a], [b]) => compare(a, b))
        .map(([file, s]) => [file, Math.round(s * 10) / 10]),
    ),
  };
}
