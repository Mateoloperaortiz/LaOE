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
    const pitrName = environment === "production" ? "Postgres-PITR-production" : "Postgres-PITR";
    expect(resources.find((resource) => resource.address === `bucket.${pitrName}`)).toMatchObject({
      type: "bucket",
      name: pitrName,
      config: { region: "iad" },
    });
    expect(resources.filter((resource) => resource.name.startsWith("Postgres-PITR"))).toHaveLength(
      1,
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
    expect(web.build?.watchPatterns).toContain("**");
    expect(web.build?.watchPatterns).toContain("!/docs/09-roadmap.md");
    expect(web.build?.watchPatterns).not.toContain("!/docs/**");
    expect(web.build?.watchPatterns).not.toContain("!/docs/14-copy-y-textos.md");
    expect(web.networking?.customDomains).toEqual(
      environment === "production" ? { "oeeafit.com": { port: 8080 } } : undefined,
    );
    // El prefijo vacío neutraliza el NPM_CONFIG_PRODUCTION que Railpack deja en la imagen: npm
    // deja de advertir por la clave obsoleta y esa línea ya no entra a los registros como error.
    expect(web.deploy?.preDeployCommand).toEqual(["NPM_CONFIG_PRODUCTION= npm run db:release"]);
    expect(web.deploy?.startCommand).toEqual("NPM_CONFIG_PRODUCTION= npm run start");
    expect(web.variables?.DATABASE_URL).toEqual({
      type: "reference",
      resource: "database.Postgres",
      output: "DATABASE_URL",
    });
    expect(web.variables?.OTP_FIXED_CODE).toBeUndefined();
    expect(web.variables?.GOOGLE_WALLET_CLASS_SUFFIX).toEqual({
      type: "literal",
      value: environment === "production" ? "carnet-oe" : "carnet-oe-staging",
    });
    for (const key of [
      "APPLE_PASS_TYPE_ID",
      "APPLE_TEAM_ID",
      "APPLE_PASS_CERT_BASE64",
      "APPLE_PASS_KEY_BASE64",
      "APPLE_PASS_KEY_PASSPHRASE",
      "GOOGLE_WALLET_ISSUER_ID",
      "GOOGLE_WALLET_SA_EMAIL",
      "GOOGLE_WALLET_SA_KEY_BASE64",
    ])
      expect(web.variables?.[key]).toEqual({ type: "preserve" });
    expect(Object.keys(web.variables ?? {}).some((name) => name.startsWith("AWS_"))).toBe(false);
    expect(web.variables?.PUBLIC_INDEXING).toEqual({
      type: "literal",
      value: environment === "production" ? "true" : "false",
    });
    expect(web.variables?.PUBLIC_API_ORIGINS).toEqual({
      type: "literal",
      value:
        environment === "production"
          ? "https://dias.oeeafit.com"
          : "http://localhost:3100,http://localhost:3101",
    });
    expect(db.deploy?.multiRegionConfig).toEqual({ "us-east4-eqdc4a": { numReplicas: 1 } });
    expect(db.deploy?.limitOverride?.containers?.memoryBytes).toBe(1_000_000_000);
    expect(resources.some((resource) => resource.name === "backup")).toBe(
      environment === "production",
    );
  });
});
