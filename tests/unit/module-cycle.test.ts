import { describe, expect, it } from "vitest";
import { findModuleCycle } from "../../scripts/ci/module-cycle.mjs";

// El detector que `.dependency-cruiser.cjs` corre sobre `MODULE_DEPS` al cargar (ADR-110 regla 1): si
// deja de ver un ciclo, una dependencia que lo cierra vuelve a pasar `npm run deps:check` sin aviso.
describe("ciclos entre módulos de dominio", () => {
  it("encuentra un ciclo de dos módulos y lo escribe de punta a punta", () => {
    const deps = { content: [], events: ["content", "people"], people: ["events"] };

    expect(findModuleCycle(deps)).toEqual(["events", "people", "events"]);
  });

  it("encuentra un ciclo de tres módulos", () => {
    const deps = {
      content: [],
      identity: ["content", "people"],
      people: ["system"],
      system: ["identity"],
    };

    expect(findModuleCycle(deps)).toEqual(["identity", "people", "system", "identity"]);
  });

  it("no ve un ciclo en un grafo donde dos caminos llegan al mismo módulo", () => {
    const deps = {
      comms: ["participation", "people"],
      participation: ["people", "terms"],
      people: ["terms"],
      terms: [],
    };

    expect(findModuleCycle(deps)).toBeNull();
  });

  it("escribe solo el ciclo, sin el camino que llevó hasta él", () => {
    const deps = { comms: ["events"], events: ["people"], people: ["events"] };

    expect(findModuleCycle(deps)).toEqual(["events", "people", "events"]);
  });

  it("encuentra un ciclo al que solo se llega después de módulos ya recorridos", () => {
    const deps = {
      content: ["terms"],
      terms: [],
      wallet: ["content", "identity"],
      identity: ["wallet"],
    };

    expect(findModuleCycle(deps)).toEqual(["wallet", "identity", "wallet"]);
  });

  it("un módulo que se declara a sí mismo es un ciclo", () => {
    expect(findModuleCycle({ system: ["system"] })).toEqual(["system", "system"]);
  });

  it("una dependencia que no está en la tabla no tiene de quién importar", () => {
    expect(findModuleCycle({ events: ["content"] })).toBeNull();
  });
});
