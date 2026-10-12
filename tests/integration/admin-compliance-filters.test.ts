import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { complianceResource } from "@/modules/permanence/admin";
import { type AnyResource, resolveFilters } from "@/shared/admin-kit/types";
import { tList } from "@/shared/copy";
import { truncateAll } from "./db";

// El recurso de cumplimiento del kit ofrece seis filtros (`filtro` en su barra y en la URL del
// exporte), cada uno con la etiqueta de su posición en T-789. Ninguna prueba leía esas opciones, y
// ninguna expresión de la spec #242 ve el recorrido que las arma: lo que lleva el índice es una
// llamada (`tList("T-789")[index]`) y no una variable. Se fijan antes de pasar a leerlas por valor
// (DT-011, ADR-126): como la tabla de enum-label-pairs, compara con posiciones literales de la lista.

describe("los filtros del recurso de cumplimiento", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("ofrece cada filtro, en su orden, con la pieza de T-789 de su posición", async () => {
    const list: readonly string[] = tList("T-789");
    const positions = {
      todos: 0,
      "por-debajo": 1,
      "no-alcanza": 2,
      prueba: 3,
      nuevos: 4,
      exentos: 5,
    };
    expect(new Set(list).size).toBe(6);

    // Por la entrada del kit, que es por donde la leen la barra de filtros y la ruta del exporte.
    const filters = await resolveFilters(complianceResource as unknown as AnyResource);
    const compliance = filters.find((filter) => filter.key === "filtro");

    expect(compliance?.label).toBe(list[0]);
    expect(compliance?.options).toEqual(
      Object.entries(positions).map(([value, position]) => ({ value, label: list[position] })),
    );
  });
});
