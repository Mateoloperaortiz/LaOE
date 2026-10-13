import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { attendedRequired, requiredTotal } from "@/modules/participation/domain/assembly-pure";
import { type MandatoryView, mandatoryCounts, type PersonPermanence } from "@/modules/permanence";
import { Desglose } from "@/modules/permanence/components/Desglose";
import { t } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";

// Las asambleas obligatorias de un resultado de permanencia, a fuerza bruta (DT-395): cuántas exige
// el requisito y cuántas lleva firmadas la persona. `permanence` hacía esa cuenta a mano en dos
// sitios, sobre `MandatoryView`: `Obligatorias`, del Desglose, y `mandatoryCounts`, de la mesa de
// cumplimiento. Acá `requiredTotal` y `attendedRequired`, de `participation`, se comparan con las dos
// en todas las combinaciones de lo exigido y lo firmado, y con lo que el Desglose dibuja de verdad.
//
// Las dos copias van escritas como estaban en `refactor/ciclo-16`: desde que el código llama a las
// funciones por `mandatoryCounts` (ADR-129 regla 4), son lo único que queda para decir que no cambió
// ningún número.

// El Desglose trae la marca, y la marca carga sus fuentes con Next.
vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "" }) }));

type Counts = { attended: number; total: number };

/** La cuenta de `Obligatorias` (`components/Desglose.tsx`) como estaba, letra por letra. */
function desgloseAsItWas(mandatory: MandatoryView): Counts {
  const total =
    mandatory.required.ordinary +
    (mandatory.required.boardElection ? 1 : 0) +
    (mandatory.required.runoff ? 1 : 0);
  const attended =
    Math.min(mandatory.attended.ordinary, mandatory.required.ordinary) +
    (mandatory.required.boardElection && mandatory.attended.boardElection ? 1 : 0) +
    (mandatory.required.runoff && mandatory.attended.runoff ? 1 : 0);
  return { attended, total };
}

/** `mandatoryCounts` (`domain/compliance.ts`) como estaba, letra por letra. */
function complianceAsItWas(view: { mandatory: MandatoryView }): Counts {
  const m = view.mandatory;
  return {
    attended:
      Math.min(m.attended.ordinary, m.required.ordinary) +
      (m.required.boardElection && m.attended.boardElection ? 1 : 0) +
      (m.required.runoff && m.attended.runoff ? 1 : 0),
    total: m.required.ordinary + (m.required.boardElection ? 1 : 0) + (m.required.runoff ? 1 : 0),
  };
}

/** Lo que dicen las dos funciones de `participation` de ese resultado. */
function byTheFunctions(mandatory: MandatoryView): Counts {
  const requirement = {
    requiredOrdinary: mandatory.required.ordinary,
    requiresBoardElection: mandatory.required.boardElection,
    requiresRunoff: mandatory.required.runoff,
  };
  return {
    attended: attendedRequired(requirement, {
      ordinaryAttended: mandatory.attended.ordinary,
      boardElectionAttended: mandatory.attended.boardElection,
      runoffAttended: mandatory.attended.runoff,
    }),
    total: requiredTotal(requirement),
  };
}

/** La línea de T-124 que dibuja el Desglose de alguien que sí se evalúa. */
function shownByDesglose(mandatory: MandatoryView): string | null {
  const result: PersonPermanence = {
    personId: "persona-sintetica",
    status: "ACTIVE",
    isNew: false,
    probation: false,
    expulsionWarning: false,
    evaluated: true,
    general: [],
    generalTotal: 0,
    generalMax: 0,
    results: [],
    mandatory,
  };
  const html = renderToStaticMarkup(
    createElement(Desglose, {
      result,
      closed: false,
      committeeNames: new Map(),
      personNames: new Map(),
      generalMissing: false,
      voice: "self",
    }),
  );
  return html.match(copyPattern("T-124"))?.[0] ?? null;
}

// El snapshot guarda lo exigido y lo firmado como un número cualquiera (`mandatorySchema`), así que
// entran también el negativo y la fracción que ningún comando escribe.
const REQUIRED_ORDINARY = [-1, 0, 1, 1.5, 2, 3, 4];
const SIGNED_ORDINARY = [-1, 0, 1, 2, 2.5, 3, 4, 5];
const FLAGS = [false, true];

/** Todas las combinaciones de lo que exige el requisito y lo que lleva firmado la persona. */
function everyMandatory(): MandatoryView[] {
  const all: MandatoryView[] = [];
  for (const requiredOrdinary of REQUIRED_ORDINARY) {
    for (const requiresBoardElection of FLAGS) {
      for (const requiresRunoff of FLAGS) {
        for (const signedOrdinary of SIGNED_ORDINARY) {
          for (const signedBoardElection of FLAGS) {
            for (const signedRunoff of FLAGS) {
              all.push({
                required: {
                  ordinary: requiredOrdinary,
                  boardElection: requiresBoardElection,
                  runoff: requiresRunoff,
                },
                attended: {
                  ordinary: signedOrdinary,
                  boardElection: signedBoardElection,
                  runoff: signedRunoff,
                },
                met: false,
                missing: [],
                lost: [],
                excused: [],
                upcoming: [],
                induction: { required: false, attended: false, excused: false, pending: false },
              });
            }
          }
        }
      }
    }
  }
  return all;
}

/** Las combinaciones en que `count` no dice lo mismo que las funciones, con lo que dijo cada una. */
function differences(
  count: (mandatory: MandatoryView) => unknown,
  expected: (mandatory: MandatoryView) => unknown = byTheFunctions,
) {
  return everyMandatory().flatMap((mandatory) => {
    const [got, want] = [count(mandatory), expected(mandatory)];
    try {
      expect(got).toEqual(want);
      return [];
    } catch {
      return [{ required: mandatory.required, attended: mandatory.attended, got, want }];
    }
  });
}

describe("las asambleas obligatorias de un resultado de permanencia, contra las dos cuentas a mano que había", () => {
  it("recorre 896 combinaciones de lo exigido y lo firmado", () => {
    expect(everyMandatory()).toHaveLength(896);
  });

  it("requiredTotal y attendedRequired dan lo mismo que la cuenta a mano del Desglose en todas las combinaciones", () => {
    expect(differences(desgloseAsItWas)).toEqual([]);
  });

  it("y lo mismo que la cuenta a mano de la mesa de cumplimiento, que también va a su CSV", () => {
    expect(differences((mandatory) => complianceAsItWas({ mandatory }))).toEqual([]);
  });

  it("mandatoryCounts, por donde permanence las llama, da lo mismo que cada una de las dos cuentas a mano", () => {
    expect(differences(mandatoryCounts, desgloseAsItWas)).toEqual([]);
    expect(differences(mandatoryCounts, (mandatory) => complianceAsItWas({ mandatory }))).toEqual(
      [],
    );
  });

  it("el Desglose dibuja en T-124 lo que dicen las funciones en todas las combinaciones", () => {
    expect(
      differences(shownByDesglose, (mandatory) => {
        const { attended, total } = byTheFunctions(mandatory);
        return t("T-124", { n: attended, total });
      }),
    ).toEqual([]);
  });
});
