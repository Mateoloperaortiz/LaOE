import { describe, expect, it } from "vitest";
import { asScopeId, scopeId } from "@/shared/lib/scope-id";

// DT-337, inciso a (ADR-123 regla 19): la lectura defensiva del id de un alcance, que estaba escrita
// en siete sitios. Lo que cada comando responde con ella está en sus pruebas de alcance del ciclo 10
// (`*-scope.test.ts`, `people-appointment-owner.test.ts`), que no cambian.

describe("el id con el que llega un alcance", () => {
  it("un texto con algo es el id, y cualquier otra cosa no lo es", () => {
    expect(asScopeId("ocasion-1")).toBe("ocasion-1");
    expect(asScopeId(" ")).toBe(" ");
    for (const value of [
      undefined,
      null,
      "",
      0,
      7,
      true,
      {},
      [],
      ["ocasion-1"],
      () => "ocasion-1",
    ]) {
      expect(asScopeId(value), String(value)).toBeNull();
    }
  });

  it("lee el id bajo su clave, y un alcance que no llegó, que no lo trae o que no es un objeto no tiene id", () => {
    expect(scopeId({ pipelineId: "pipeline-1" }, "pipelineId")).toBe("pipeline-1");
    for (const scope of [
      undefined,
      null,
      {},
      { pipelineId: "" },
      { pipelineId: 7 },
      { pipelineId: null },
      { pipelineId: { id: "pipeline-1" } },
      { otra: "pipeline-1" },
      "pipeline-1",
      7,
      [],
    ]) {
      expect(scopeId(scope, "pipelineId"), JSON.stringify(scope)).toBeNull();
    }
  });

  it("lee solo la clave pedida: lo que el alcance traiga bajo otra no cuenta", () => {
    const owner = { personId: "persona-1", editionId: "edicion-1" };
    expect(scopeId(owner, "personId")).toBe("persona-1");
    expect(scopeId(owner, "editionId")).toBe("edicion-1");
    expect(scopeId({ editionId: "edicion-1" }, "personId")).toBeNull();
  });
});
