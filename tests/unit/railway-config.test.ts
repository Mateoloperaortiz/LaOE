import { createRailwayContext, project } from "railway/iac";
import { describe, expect, it } from "vitest";
import configuration from "../../.railway/railway";

describe("infraestructura por entorno (ADR-039)", () => {
  it.each(["ensayo", "preview", undefined])("rechaza el entorno %s", (environment) => {
    expect(() =>
      configuration(createRailwayContext(environment ? { environment } : {}), project),
    ).toThrow("solo admite los entornos staging y production");
  });

  it.each(["staging", "production"])("define una app aislada para %s", async (environment) => {
    const config = await configuration(createRailwayContext({ environment }), project);
    const resources = config.resources?.flat() ?? [];
    const web = resources.find((resource) => resource.name === "web");
    const db = resources.find((resource) => resource.name === "Postgres");
    // Un recurso omitido del grafo se elimina: el archivo WAL debe sobrevivir cada apply.
    expect(resources.find((resource) => resource.address === "bucket.Postgres-PITR")).toMatchObject(
      {
        type: "bucket",
        name: "Postgres-PITR",
        config: { region: "iad" },
      },
    );
    if (!web || web.type !== "service" || !db || db.type !== "database") {
      throw new Error("Faltan web o Postgres");
    }
    expect(web.source).toMatchObject({
      repo: "Mateoloperaortiz/LaOE",
      branch: environment === "staging" ? "main" : "production",
      checkSuites: true,
    });
    expect(web.source).not.toHaveProperty("rootDirectory");
    expect(web.networking?.customDomains).toBeUndefined();
    expect(web.deploy?.preDeployCommand).toEqual(["npm run db:release"]);
    expect(web.variables?.DATABASE_URL).toEqual({
      type: "reference",
      resource: "database.Postgres",
      output: "DATABASE_URL",
    });
    expect(web.variables?.OTP_FIXED_CODE).toBeUndefined();
    expect(Object.keys(web.variables ?? {}).some((name) => name.startsWith("AWS_"))).toBe(false);
    expect(web.variables?.PUBLIC_INDEXING).toEqual({
      type: "literal",
      value: environment === "production" ? "true" : "false",
    });
    expect(db.deploy?.multiRegionConfig).toEqual({ "us-east4-eqdc4a": { numReplicas: 1 } });
    expect(db.deploy?.limitOverride?.containers?.memoryBytes).toBe(1_000_000_000);
    expect(resources.some((resource) => resource.name === "backup")).toBe(
      environment === "production",
    );
  });
});
