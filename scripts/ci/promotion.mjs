import assert from "node:assert/strict";

export const REPOSITORY = "Mateoloperaortiz/LaOE";
export const WORKFLOW_PATH = ".github/workflows/ci.yml";
const SHA = /^[a-f0-9]{40}$/;

/** Solo un push a production cuyo HEAD es el `after` del evento puede reutilizar evidencia. */
export function promotionHead(eventName, ref, event, head) {
  if (eventName !== "push" || ref !== "refs/heads/production") return null;
  if (!SHA.test(head) || event?.after !== head) return null;
  return head;
}

/** La ejecución aprobada más reciente de este workflow para el SHA exacto, empujado a main. */
export function selectEvidenceRun(head, runs, currentRunId) {
  assert(Array.isArray(runs), "Listado de ejecuciones inválido");
  const candidates = runs
    .filter(
      (run) =>
        run?.head_sha === head &&
        run.head_branch === "main" &&
        run.event === "push" &&
        run.status === "completed" &&
        run.conclusion === "success" &&
        run.path === WORKFLOW_PATH &&
        run.repository?.full_name === REPOSITORY &&
        Number.isSafeInteger(run.id) &&
        String(run.id) !== String(currentRunId) &&
        Number.isFinite(Date.parse(run.created_at)),
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  return candidates[0] ?? null;
}

/** La evidencia debe ser el resultado completo y aprobado de esa misma ejecución y ese SHA. */
export function verifyEvidence(head, run, evidence) {
  assert(SHA.test(head), "SHA inválido");
  assert.equal(run?.head_sha, head, "La ejecución reutilizada no corresponde al SHA promovido");
  assert.equal(run.head_branch, "main", "Solo se reutiliza el CI de main");
  assert.equal(run.event, "push", "Solo se reutiliza el CI de un push");
  assert.equal(run.conclusion, "success", "La ejecución reutilizada no está aprobada");
  assert.equal(run.path, WORKFLOW_PATH, "La ejecución reutilizada es de otro workflow");
  assert.equal(evidence?.schema, 1, "Esquema de evidencia desconocido");
  assert.equal(evidence.sha, head, "La evidencia certifica otro SHA");
  assert.equal(String(evidence.runId), String(run.id), "La evidencia pertenece a otra ejecución");
  assert.equal(evidence.mode, "full", "Solo un CI completo puede reutilizarse");
  assert.equal(evidence.result, "success", "La evidencia no está aprobada");
  for (const family of ["unit", "integration"]) {
    assert(
      Number.isInteger(evidence[family]?.cases) && evidence[family].cases > 0,
      `Sin casos ${family}`,
    );
  }
  const { e2e } = evidence;
  assert(e2e && e2e.uniqueCases > 0 && e2e.scenarios > 0, "Sin escenarios E2E");
  return {
    runId: String(run.id),
    url: run.html_url,
    createdAt: run.created_at,
    headBranch: run.head_branch,
    sha: head,
    unit: evidence.unit,
    integration: evidence.integration,
    e2e: {
      uniqueCases: e2e.uniqueCases,
      scenarios: e2e.scenarios,
      setupPerShard: e2e.setupPerShard,
      outbox: e2e.outbox,
      shards: e2e.shards,
    },
  };
}

/**
 * Busca y verifica la evidencia; `null` cuando no hay candidata o artefacto. Una evidencia que
 * existe pero no cumple lanza, y quien llama decide ejecutar todo. Devuelve la ejecución con los
 * campos de la API para que el gate repita la misma verificación sin volver a consultar.
 */
export async function findPromotionEvidence(head, { listRuns, downloadResult, currentRunId }) {
  const run = selectEvidenceRun(head, await listRuns(head), currentRunId);
  if (!run) return null;
  const evidence = await downloadResult(run.id);
  if (!evidence) return null;
  verifyEvidence(head, run, evidence);
  return {
    run: {
      id: run.id,
      html_url: run.html_url,
      created_at: run.created_at,
      head_branch: run.head_branch,
      head_sha: run.head_sha,
      event: run.event,
      path: run.path,
      status: run.status,
      conclusion: run.conclusion,
      repository: { full_name: run.repository.full_name },
    },
    evidence,
  };
}
