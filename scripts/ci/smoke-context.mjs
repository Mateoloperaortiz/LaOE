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

/** Consulta únicamente metadata de deployments de este repositorio; no necesita claves Railway. */
export async function readSmokeDeployment(eventName, event) {
  if (eventName === "deployment_status")
    return resolveSmokeContext(event.deployment, event.deployment_status);
  assert.equal(eventName, "workflow_dispatch", "Evento de smoke desconocido");
  const id = event.inputs?.deployment_id;
  assert(typeof id === "string" && /^[1-9][0-9]*$/.test(id), "deployment_id inválido");
  const repository = process.env.GITHUB_REPOSITORY;
  assert.equal(repository, "Mateoloperaortiz/LaOE", "Repositorio de smoke incorrecto");
  const read = async (suffix) => {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/deployments/${id}${suffix}`,
      {
        headers: {
          authorization: `Bearer ${process.env.GH_TOKEN}`,
          accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
    assert(response.ok, `No se pudo consultar el deployment: HTTP ${response.status}`);
    return response.json();
  };
  const [deployment, statuses] = await Promise.all([read(""), read("/statuses")]);
  return resolveSmokeContext(deployment, statuses[0]);
}
