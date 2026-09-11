import { describe, expect, it } from "vitest";
import { readSmokeDeployment, resolveSmokeContext } from "../../scripts/ci/smoke-context.mjs";

function fixture() {
  const environment = "casa-digital / staging";
  const creator = { login: "railway-app[bot]" };
  return {
    deployment: {
      id: 100,
      created_at: "2026-09-11T10:00:00Z",
      environment,
      creator,
      sha: "a".repeat(40),
      payload: { environmentId: "41f59e9b-3988-4d5a-9e98-4c9ccf8285eb" },
    },
    status: { environment, creator, state: "success" },
  };
}

describe("smoke de deployments", () => {
  it("deriva expectativas de un entorno verificado y conserva el SHA del deployment", () => {
    const { deployment, status } = fixture();
    expect(resolveSmokeContext(deployment, status)).toMatchObject({
      sha: "a".repeat(40),
      indexing: false,
      base: "https://web-staging-53f6.up.railway.app",
    });
  });
  it("rechaza un emisor distinto aunque imite el nombre del entorno", () => {
    const { deployment, status } = fixture();
    expect(() =>
      resolveSmokeContext({ ...deployment, creator: { login: "otro" } }, status),
    ).toThrow("Railway");
  });
  it("no toma la URL ni la indexación sugeridas por un evento como expectativas", () => {
    const { deployment, status } = fixture();
    expect(
      resolveSmokeContext(deployment, {
        ...status,
        environment_url: "https://example.test",
        indexing: true,
      }),
    ).toMatchObject({
      indexing: false,
      base: "https://web-staging-53f6.up.railway.app",
    });
  });
  it("rechaza un SHA incompleto, un estado no exitoso y un ID ajeno", () => {
    const { deployment, status } = fixture();
    expect(() => resolveSmokeContext({ ...deployment, sha: "main" }, status)).toThrow(
      "SHA completo",
    );
    expect(() => resolveSmokeContext(deployment, { ...status, state: "failure" })).toThrow(
      "aprobado",
    );
    expect(() =>
      resolveSmokeContext({ ...deployment, payload: { environmentId: "otro" } }, status),
    ).toThrow("ID de entorno");
  });
});

describe("eventos tardíos y comprobación manual del smoke", () => {
  const event = () => {
    const { deployment, status } = fixture();
    return { deployment, deployment_status: status };
  };
  const newer = () => ({
    ...fixture().deployment,
    id: 101,
    created_at: "2026-09-11T11:00:00Z",
    sha: "b".repeat(40),
  });

  it("comprueba el evento actual cuando no hay un deployment posterior aprobado", async () => {
    const input = event();
    const result = await readSmokeDeployment("deployment_status", input, async () => [
      input.deployment,
    ]);
    expect(result).toMatchObject({ sha: "a".repeat(40) });
    expect(result).not.toHaveProperty("supersededBy");
  });

  it("omite un evento antiguo aunque GitHub haya vuelto a marcar inactive el nuevo", async () => {
    const { status } = fixture();
    const result = await readSmokeDeployment("deployment_status", event(), async (path: string) =>
      path.startsWith("?") ? [newer()] : [{ ...status, state: "inactive" }, status],
    );
    expect(result).toMatchObject({ sha: "a".repeat(40), supersededBy: "101" });
  });

  it("una publicación nueva pendiente o fallida no omite el smoke del deployment aprobado", async () => {
    const { status } = fixture();
    const result = await readSmokeDeployment("deployment_status", event(), async (path: string) =>
      path.startsWith("?")
        ? [newer()]
        : [
            { ...status, state: "failure" },
            { ...status, state: "in_progress" },
          ],
    );
    expect(result).not.toHaveProperty("supersededBy");
  });

  it("un emisor o entorno ajeno no puede suprimir la comprobación", async () => {
    const result = await readSmokeDeployment("deployment_status", event(), async () => [
      { ...newer(), creator: { login: "otro" } },
      { ...newer(), environment: "otro" },
    ]);
    expect(result).not.toHaveProperty("supersededBy");
  });

  it("no declara un evento obsoleto si falla la consulta de metadata", async () => {
    await expect(
      readSmokeDeployment("deployment_status", event(), async () => {
        throw new Error("GitHub no disponible");
      }),
    ).rejects.toThrow("GitHub no disponible");
  });

  it("el modo manual conserva el SHA solicitado aunque exista una desactivación posterior", async () => {
    const { deployment, status } = fixture();
    const result = await readSmokeDeployment(
      "workflow_dispatch",
      { inputs: { deployment_id: "100" } },
      async (path: string) =>
        path.includes("statuses") ? [{ ...status, state: "inactive" }, status] : deployment,
    );
    expect(result).toMatchObject({ sha: "a".repeat(40) });
    expect(result).not.toHaveProperty("supersededBy");
  });

  it("el modo manual rechaza un deployment que nunca fue aprobado", async () => {
    const { deployment, status } = fixture();
    await expect(
      readSmokeDeployment(
        "workflow_dispatch",
        { inputs: { deployment_id: "100" } },
        async (path: string) =>
          path.includes("statuses") ? [{ ...status, state: "failure" }] : deployment,
      ),
    ).rejects.toThrow("no está aprobado");
  });
});
