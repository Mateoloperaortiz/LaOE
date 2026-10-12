import { describe, expect, it } from "vitest";
import { complianceResource, workGroupsResource } from "@/modules/permanence/admin";
import { tList } from "@/shared/copy";

// Tres etiquetas de `permanence` que salen de la casa en un CSV del admin: la condición y el estado
// de cumplimiento de una persona (exporte de cumplimiento, T-792 y T-791) y el tipo de un grupo de
// trabajo (exporte de grupos, T-725). Ninguna prueba leía esas columnas. Se fijan antes de pasar a
// leerlas por valor (DT-011, spec #242): cada valor lleva la pieza de su posición en la lista, y un
// valor que el orden no trae conserva el respaldo de hoy, que espera la decisión abierta 75. Como la
// tabla de enum-label-pairs, compara con posiciones literales de la lista.

/** Valores que ningún orden trae; los cuatro últimos son propiedades de `Object.prototype`. */
const STRANGERS = ["NO_EXISTE", "constructor", "toString", "hasOwnProperty", "__proto__"];

type ComplianceRow = Parameters<NonNullable<typeof complianceResource.exportRow>>[0];
type GroupRow = Parameters<NonNullable<typeof workGroupsResource.exportRow>>[0];

const headers: readonly string[] = tList("T-836");

/** La columna del exporte de cumplimiento que lleva ese encabezado de T-836. */
function complianceCell(position: number, patch: Partial<Record<keyof ComplianceRow, unknown>>) {
  const row = {
    personName: "Persona De Prueba",
    email: "persona@example.com",
    committeeName: "Comité de prueba",
    condition: "ACTIVE",
    state: "CUMPLE",
    generalTotal: 10,
    committeeTotal: 20,
    total: 30,
    threshold: 60,
    mandatoryAttended: 1,
    mandatoryTotal: 2,
    ...patch,
  } as unknown as ComplianceRow;
  return complianceResource.exportRow(row)[headers[position] ?? ""];
}

function groupKindCell(kind: string) {
  const row = {
    name: "Grupo de prueba",
    kind,
    code: null,
    leaderName: "Persona De Prueba",
    members: 3,
    evaluators: 1,
    pending: 0,
  } as unknown as GroupRow;
  return workGroupsResource.exportRow(row).tipo;
}

describe("el exporte de cumplimiento", () => {
  it("lleva en la columna de estado la pieza de T-791 de cada estado", () => {
    const list: readonly string[] = tList("T-791");
    const positions = {
      EN_CAMINO: 0,
      EN_RIESGO: 1,
      NO_ALCANZA: 2,
      CUMPLE: 3,
      PRUEBA: 4,
      NO_CUMPLE: 5,
    };

    expect(headers[9]).toBeTruthy();
    expect(new Set(list).size).toBe(6);
    for (const [state, position] of Object.entries(positions)) {
      expect(complianceCell(9, { state }), state).toBe(list[position]);
    }
  });

  it("una persona exenta, sin estado, lleva la última pieza de T-789", () => {
    expect(complianceCell(9, { state: null })).toBe(tList("T-789")[5]);
  });

  it("lleva en la columna de condición la pieza de T-792 de cada condición, y nada si no hay", () => {
    const list: readonly string[] = tList("T-792");
    const positions = { ACTIVE: 0, NEW: 1, PROBATION: 2, TRANSFER: 3 };

    expect(headers[3]).toBeTruthy();
    expect(new Set(list).size).toBe(4);
    for (const [condition, position] of Object.entries(positions)) {
      expect(complianceCell(3, { condition }), condition).toBe(list[position]);
    }
    expect(complianceCell(3, { condition: null })).toBe("");
  });

  it("un estado o una condición que el orden no trae sale tal cual (decisión abierta 75)", () => {
    expect(STRANGERS.map((state) => complianceCell(9, { state }))).toEqual(STRANGERS);
    expect(STRANGERS.map((condition) => complianceCell(3, { condition }))).toEqual(STRANGERS);
  });
});

describe("el exporte de grupos de trabajo", () => {
  it("lleva en la columna de tipo la pieza de T-725 de cada tipo de grupo", () => {
    const list: readonly string[] = tList("T-725");
    const positions = {
      WORK_COMMITTEE: 0,
      GT_MACROEVENT: 1,
      GAP: 2,
      GAP_OE: 3,
      BARRA_BRAVA: 4,
      NEW_MEMBER_TASK: 5,
    };

    expect(new Set(list).size).toBe(6);
    for (const [kind, position] of Object.entries(positions)) {
      expect(groupKindCell(kind), kind).toBe(list[position]);
    }
  });

  it("un tipo que el orden no trae sale tal cual (decisión abierta 75)", () => {
    expect(STRANGERS.map((kind) => groupKindCell(kind))).toEqual(STRANGERS);
  });
});
