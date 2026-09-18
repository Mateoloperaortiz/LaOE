import { describe, expect, it } from "vitest";
import { corsRule, withCorsOrigin } from "../../scripts/lib/bucket-cors";

describe("CORS del bucket: sumar el origen de una corrida E2E (ADR-077)", () => {
  const existing = [corsRule("http://localhost:3000"), corsRule("http://localhost:3011")];

  it("agrega una regla propia y deja las de otras sesiones como estaban", () => {
    const next = withCorsOrigin(existing, "http://localhost:3013");
    expect(next).toEqual([...existing, corsRule("http://localhost:3013")]);
    // Garage responde con todos los orígenes de la regla que coincide: cada una lleva uno solo.
    expect(next?.every((rule) => rule.AllowedOrigins?.length === 1)).toBe(true);
    expect(existing).toHaveLength(2);
  });

  it("no pide escribir si el origen ya está o si el bucket admite cualquiera", () => {
    expect(withCorsOrigin(existing, "http://localhost:3011")).toBeNull();
    expect(withCorsOrigin([corsRule("*")], "http://localhost:3013")).toBeNull();
  });

  it("parte de cero en un bucket sin reglas", () => {
    expect(withCorsOrigin([], "http://localhost:3013")).toEqual([
      corsRule("http://localhost:3013"),
    ]);
  });
});
