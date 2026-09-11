import assert from "node:assert/strict";
import { matchesGlob } from "node:path";
import documentationPaths from "./documentation-paths.json" with { type: "json" };

/** Un diff ausente, vacío o con cualquier ruta desconocida exige la suite completa. */
export function classifyPaths(paths) {
  return Array.isArray(paths) &&
    paths.length > 0 &&
    paths.every((path) => documentationPaths.some((pattern) => matchesGlob(path, pattern)))
    ? "documentation"
    : "full";
}

/** El rango es del push completo o de la base del PR al merge que realmente se comprueba. */
export function comparisonBase(eventName, event, head) {
  if (!/^[a-f0-9]{40}$/.test(head)) return null;
  const base =
    eventName === "push" && event.after === head
      ? event.before
      : eventName === "pull_request"
        ? event.pull_request?.base?.sha
        : null;
  return typeof base === "string" && /^[a-f0-9]{40}$/.test(base) && !/^0+$/.test(base)
    ? base
    : null;
}

/** Un job omitido solo es válido con documentación reconocida o con evidencia de promoción (ADR-054). */
export function verifyJobs(needs) {
  assert.equal(needs.cambios?.result, "success", "Falló la clasificación del cambio");
  const mode = needs.cambios.outputs?.mode;
  assert(["documentation", "promotion", "full"].includes(mode), "Modo de CI ausente o desconocido");
  for (const name of ["calidad", "respaldo", "integracion", "e2e"]) {
    assert.equal(
      needs[name]?.result,
      mode === "full" ? "success" : "skipped",
      `El job ${name} no terminó como exige el modo ${mode}`,
    );
  }
  return mode;
}
