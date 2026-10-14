import { describe, expect, it } from "vitest";
import { reglaFormLabels } from "@/app/admin/permanencia/_ui/reglas";
import { tList } from "@/shared/copy";

// Las opciones que el formulario de reglas de permanencia arma con un orden escrito en su archivo
// (`src/app/admin/permanencia/_ui/reglas.ts`, ADR-126 reglas 2 y 9). Las categorías eran un par de
// largo distinto: el formulario ofrece siete y T-566 trae ocho piezas, porque el dominio de
// permanencia no admite `INDUCTION` en una regla. Acá queda qué pieza lleva cada opción, comparada
// con posiciones literales de la lista como en la tabla de enum-label-pairs.

function options(code: Parameters<typeof tList>[0], values: readonly string[]) {
  const list: readonly string[] = tList(code);
  return values.map((value, index) => ({ value, label: list[index] }));
}

describe("las opciones del formulario de reglas de permanencia", () => {
  it("cada una de las siete categorías lleva la pieza de T-566 de su posición", () => {
    expect(reglaFormLabels().categories).toEqual(
      options("T-566", [
        "INTEGRATION",
        "ATHLETIC_MATCH",
        "COMMITTEE_MEETING",
        "TALK",
        "WORKSHOP",
        "SOCIAL",
        "OTHER",
      ]),
    );
  });

  it("no ofrece INDUCTION, la octava pieza de T-566", () => {
    const list: readonly string[] = tList("T-566");
    const { categories } = reglaFormLabels();

    expect(list).toHaveLength(8);
    expect(categories.map((option) => option.value)).not.toContain("INDUCTION");
    expect(categories.map((option) => option.label)).not.toContain(list[7]);
  });

  it("el tipo de ocasión, los dos filtros y el modo de un grupo llevan la pieza de su posición", () => {
    const labels = reglaFormLabels();

    expect(labels.kinds).toEqual(options("T-564", ["ACTIVITY", "ASSEMBLY", "EDITION_SESSION"]));
    expect(labels.newMembersFilters).toEqual(options("T-721", ["ANY", "ONLY", "EXCLUDE"]));
    expect(labels.committeeFilters).toEqual(options("T-722", ["ANY", "OWN"]));
    expect(labels.groupModes).toEqual(options("T-724", ["FIXED", "PER_GROUP", "TIERS"]));
  });
});
