import assert from "node:assert/strict";
import environments from "./smoke-environments.json" with { type: "json" };

/** Las expectativas vienen del entorno verificado, nunca de la respuesta HTTP a comprobar. */
export function resolveSmokeContext(deployment, status) {
  assert.equal(
    deployment.creator?.login,
    "railway-app[bot]",
    "El deployment no procede de Railway",
  );
  assert.equal(status?.creator?.login, "railway-app[bot]", "El estado no procede de Railway");
  assert.equal(status.state, "success", "El deployment todavía no está aprobado");
  assert(Object.hasOwn(environments, deployment.environment), "Entorno de smoke desconocido");
  const config = environments[deployment.environment];
  assert.equal(deployment.payload?.environmentId, config.environmentId, "ID de entorno incorrecto");
  assert.equal(status.environment, deployment.environment, "El estado pertenece a otro entorno");
  assert(/^[a-f0-9]{40}$/.test(deployment.sha), "El deployment necesita un SHA completo");
  return { ...config, sha: deployment.sha };
}

async function readDeploymentApi(path) {
  const repository = process.env.GITHUB_REPOSITORY;
  assert.equal(repository, "Mateoloperaortiz/LaOE", "Repositorio de smoke incorrecto");
  const response = await fetch(`https://api.github.com/repos/${repository}/deployments${path}`, {
    headers: {
      authorization: `Bearer ${process.env.GH_TOKEN}`,
      accept: "application/vnd.github+json",
    },
    signal: AbortSignal.timeout(20_000),
  });
  assert(response.ok, `No se pudo consultar el deployment: HTTP ${response.status}`);
  return response.json();
}

/** Consulta metadata de GitHub; los eventos antiguos no certifican una release retirada. */
export async function readSmokeDeployment(eventName, event, read = readDeploymentApi) {
  if (eventName === "deployment_status") {
    const deployment = event.deployment;
    const config = resolveSmokeContext(deployment, event.deployment_status);
    const createdAt = Date.parse(deployment.created_at);
    assert(Number.isSafeInteger(deployment.id) && Number.isFinite(createdAt), "Metadata inválida");
    const deployments = await read(
      `?environment=${encodeURIComponent(deployment.environment)}&per_page=100`,
    );
    assert(Array.isArray(deployments), "Listado de deployments inválido");
    const newer = deployments
      .filter(
        (candidate) =>
          candidate.creator?.login === "railway-app[bot]" &&
          candidate.environment === deployment.environment &&
          Number.isSafeInteger(candidate.id) &&
          (Date.parse(candidate.created_at) > createdAt ||
            (Date.parse(candidate.created_at) === createdAt && candidate.id > deployment.id)),
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
    for (const candidate of newer) {
      const statuses = await read(`/${candidate.id}/statuses?per_page=100`);
      assert(Array.isArray(statuses), "Estados de deployment inválidos");
      const approved = statuses.find((status) => status.state === "success");
      if (approved) {
        resolveSmokeContext(candidate, approved);
        return { ...config, supersededBy: String(candidate.id) };
      }
    }
    return config;
  }
  assert.equal(eventName, "workflow_dispatch", "Evento de smoke desconocido");
  const id = event.inputs?.deployment_id;
  assert(typeof id === "string" && /^[1-9][0-9]*$/.test(id), "deployment_id inválido");
  const [deployment, statuses] = await Promise.all([
    read(`/${id}`),
    read(`/${id}/statuses?per_page=100`),
  ]);
  assert(Array.isArray(statuses), "Estados de deployment inválidos");
  // Railway puede volver a marcar success un deployment antiguo y desactivar el actual en GitHub.
  // El modo manual verifica siempre el SHA solicitado por HTTP, incluso si ya está retirado.
  const approved = statuses.find((status) => status.state === "success");
  assert(approved, "El deployment todavía no está aprobado");
  return resolveSmokeContext(deployment, approved);
}
