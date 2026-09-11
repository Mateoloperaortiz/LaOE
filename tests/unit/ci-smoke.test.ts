import { describe, expect, it } from "vitest";
import { resolveSmokeContext } from "../../scripts/ci/smoke-context.mjs";

function fixture() {
  const environment = "casa-digital / staging";
  const creator = { login: "railway-app[bot]" };
  return {
    deployment: {
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
